// ============================================================
// solicitacao.js — Lógica do portal de solicitação (Link 1)
// Desenvolvido por Lucas L. Diogo para Be8 2026
// ============================================================

import {
  db, auth,
  collection, doc, addDoc, getDocs, updateDoc, query, where,
  orderBy, onSnapshot, serverTimestamp,
  signInAnonymously, onAuthStateChanged,
} from './firebase.js';

// ─── STATE ───────────────────────────────────────────────────
let currentUser = { name: '', email: '' };
let editingId = null;
let solicitacoesListener = null;
let minhasSolicitacoes = [];

// ─── DOM HELPERS ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loader = (show) => $('loader').classList.toggle('hidden', !show);
const showAlert = (id, type, msg) => {
  $(id).innerHTML = `<div class="alert alert-${type}" style="margin-bottom:1rem">${msg}</div>`;
  setTimeout(() => { $(id).innerHTML = ''; }, 5000);
};

// ─── MASKS ────────────────────────────────────────────────────
function maskCNPJ(v) {
  return v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);
}

function maskCEP(v) {
  return v.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
}

document.addEventListener('DOMContentLoaded', () => {
  // Apply masks
  ['f-cnpjTomador','f-cnpjColeta','f-cnpjDestino'].forEach(id => {
    $(id)?.addEventListener('input', e => e.target.value = maskCNPJ(e.target.value));
  });
  ['f-cepColeta','f-cepDestino'].forEach(id => {
    $(id)?.addEventListener('input', e => e.target.value = maskCEP(e.target.value));
  });

  // Sign in anonymously for read/write access
  signInAnonymously(auth).catch(console.error);
});

// ─── ACCESS ───────────────────────────────────────────────────
window.acessar = async function () {
  const name = $('acc-name').value.trim();
  const email = $('acc-email').value.trim().toLowerCase();

  if (!name) return showAlert('access-alert', 'error', 'Informe seu nome.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return showAlert('access-alert', 'error', 'Informe um e-mail válido.');

  loader(true);
  try {
    currentUser = { name, email };
    // Save/update requester record
    const rRef = collection(db, 'requesters');
    const snap = await getDocs(query(rRef, where('email', '==', email)));
    if (snap.empty) {
      await addDoc(rRef, { name, email, createdAt: serverTimestamp() });
    } else {
      await updateDoc(snap.docs[0].ref, { name, lastSeen: serverTimestamp() });
    }

    $('screen-access').classList.add('hidden');
    $('screen-main').classList.remove('hidden');
    $('welcome-msg').textContent = `Bem-vindo(a), ${name} • ${email}`;
    $('f-solicitante').value = name;

    iniciarListener();
  } catch (e) {
    console.error(e);
    showAlert('access-alert', 'error', 'Erro ao acessar. Tente novamente.');
  } finally { loader(false); }
};

window.sair = function () {
  if (solicitacoesListener) solicitacoesListener();
  currentUser = { name: '', email: '' };
  editingId = null;
  $('screen-main').classList.add('hidden');
  $('screen-access').classList.remove('hidden');
  $('acc-name').value = '';
  $('acc-email').value = '';
};

// ─── LISTENER ─────────────────────────────────────────────────
function iniciarListener() {
  if (solicitacoesListener) solicitacoesListener();
  const q = query(
    collection(db, 'solicitacoes'),
    where('requesterEmail', '==', currentUser.email),
    orderBy('createdAt', 'desc')
  );
  solicitacoesListener = onSnapshot(q, snap => {
    minhasSolicitacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistorico();
    $('hist-count').textContent = minhasSolicitacoes.length;
  }, err => console.error('Listener error:', err));
}

// ─── RENDER HISTÓRICO ─────────────────────────────────────────
function renderHistorico() {
  const list = $('hist-list');
  if (!minhasSolicitacoes.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>Nenhuma solicitação encontrada. Crie sua primeira solicitação na aba "Nova Solicitação".</p></div>`;
    return;
  }

  list.innerHTML = minhasSolicitacoes.map(s => {
    const dt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('pt-BR') : '—';
    const statusBadge = statusBadgeHtml(s.status || 'A tratar');
    const canEdit = !['Entregue','Cancelado'].includes(s.status);

    const winnerHtml = s.vencedora?.transportadora
      ? `<div class="soli-winner">🏆 Coleta solicitada: <strong>${s.vencedora.transportadora}</strong> | CNPJ: ${s.vencedora.cnpj || '—'} | Cotação nº ${s.numeroCotacao || '—'} | Valor: R$ ${Number(s.vencedora.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`
      : '';

    const nfLink = s.anexoNotaFiscalUrl
      ? `<a href="${s.anexoNotaFiscalUrl}" target="_blank" style="color:var(--teal);font-size:0.78rem">📎 Ver NF</a>`
      : '';

    return `
    <div class="soli-card mb-1">
      <div class="soli-card-header">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="soli-card-id">#${s.id.slice(0,8).toUpperCase()}</span>
          ${s.numeroCotacao ? `<span style="font-size:0.78rem;color:var(--slate)">Cotação: <strong style="color:var(--white)">${s.numeroCotacao}</strong></span>` : ''}
          ${statusBadge}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${nfLink}
          ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="editarSolicitacao('${s.id}')">✏️ Editar</button>` : ''}
        </div>
      </div>
      <div class="soli-card-info">
        <div class="soli-info-item"><span class="soli-info-label">Data</span><span class="soli-info-val">${dt}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Origem</span><span class="soli-info-val">${s.cidadeColeta || '—'}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Destino</span><span class="soli-info-val">${s.cidadeDestino || '—'}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Peso</span><span class="soli-info-val">${s.peso || '—'} kg</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Volume</span><span class="soli-info-val">${s.volume || '—'}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Valor NF</span><span class="soli-info-val">R$ ${Number(s.valorNF||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Remetente</span><span class="soli-info-val">${s.nomeEmpresaColeta || '—'}</span></div>
        <div class="soli-info-item"><span class="soli-info-label">Nº Pedido</span><span class="soli-info-val">${s.numeroPedido || '—'}</span></div>
      </div>
      ${winnerHtml}
    </div>`;
  }).join('');
}

// ─── STATUS BADGE HTML ─────────────────────────────────────────
function statusBadgeHtml(status) {
  const map = {
    'A tratar':   'atratar',
    'Cotação':    'cotacao',
    'Aprovação':  'aprovacao',
    'Coleta':     'coleta',
    'Em trânsito':'transito',
    'Entregue':   'entregue',
    'Cancelado':  'cancelado',
  };
  const cls = map[status] || 'atratar';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

// ─── SALVAR SOLICITAÇÃO ────────────────────────────────────────
window.salvarSolicitacao = async function () {
  // Gather fields
  const data = {
    requesterName:     currentUser.name,
    requesterEmail:    currentUser.email,
    solicitante:       $('f-solicitante').value.trim(),
    numeroPedido:      $('f-numeroPedido').value.trim(),
    centroCusto:       $('f-centroCusto').value.trim(),
    cnpjTomador:       $('f-cnpjTomador').value.trim(),
    cnpjColeta:        $('f-cnpjColeta').value.trim(),
    nomeEmpresaColeta: $('f-nomeEmpresaColeta').value.trim(),
    cepColeta:         $('f-cepColeta').value.trim(),
    cidadeColeta:      $('f-cidadeColeta').value.trim(),
    enderecoCompleto:  $('f-enderecoCompleto').value.trim(),
    horarioColeta:     $('f-horarioColeta').value.trim(),
    cnpjDestino:       $('f-cnpjDestino').value.trim(),
    nomeDestino:       $('f-nomeDestino').value.trim(),
    cepDestino:        $('f-cepDestino').value.trim(),
    cidadeDestino:     $('f-cidadeDestino').value.trim(),
    peso:              $('f-peso').value.trim(),
    volume:            $('f-volume').value.trim(),
    valorNF:           parseFloat($('f-valorNF').value.replace(',','.')) || 0,
    dimensoes:         $('f-dimensoes').value.trim(),
    descricaoMaterial: $('f-descricaoMaterial').value.trim(),
    quimico:           $('f-quimico').value,
    updatedAt:         serverTimestamp(),
  };

  // Validate required
  const required = ['solicitante','cnpjTomador','cnpjColeta','nomeEmpresaColeta','cepColeta','cidadeColeta','enderecoCompleto','cnpjDestino','nomeDestino','cidadeDestino','peso','volume','descricaoMaterial'];
  const missing = required.filter(k => !data[k]);
  if (data.valorNF === 0 && !$('f-valorNF').value.trim()) missing.push('valorNF');

  if (missing.length) {
    return showAlert('form-alert', 'error', `⚠️ Preencha os campos obrigatórios: ${missing.map(k => k).join(', ')}`);
  }

  loader(true);
  try {    if (editingId) {
      await updateDoc(doc(db, 'solicitacoes', editingId), data);
      showAlert('form-alert', 'success', '✅ Solicitação atualizada com sucesso!');
      editingId = null;
      $('form-soli-id').classList.add('hidden');
    } else {
      data.status = 'A tratar';
      data.createdAt = serverTimestamp();
      data.cotacao1 = { transportadora: '', cnpj: '', valor: '' };
      data.cotacao2 = { transportadora: '', cnpj: '', valor: '' };
      data.cotacao3 = { transportadora: '', cnpj: '', valor: '' };
      data.vencedora = {};
      data.numeroCotacao = '';
      data.reducao = '';
      data.operador = '';
      data.unidade = '';
      data.tipoFrete = '';
      data.observacoes = '';
      data.cotacaoFechada = '';
      data.valorFechado = 0;
      await addDoc(collection(db, 'solicitacoes'), data);
      showAlert('form-alert', 'success', '✅ Solicitação enviada com sucesso! Acompanhe no histórico.');
    }

    limparForm();
    switchTab('tab-historico', document.querySelectorAll('.tab')[1]);
  } catch (e) {
    console.error(e);
    showAlert('form-alert', 'error', `❌ Erro ao salvar: ${e.message}`);
  } finally { loader(false); }
};

// ─── EDITAR ───────────────────────────────────────────────────
window.editarSolicitacao = function (id) {
  const s = minhasSolicitacoes.find(x => x.id === id);
  if (!s) return;

  editingId = id;
  $('f-solicitante').value       = s.solicitante || '';
  $('f-numeroPedido').value      = s.numeroPedido || '';
  $('f-centroCusto').value       = s.centroCusto || '';
  $('f-cnpjTomador').value       = s.cnpjTomador || '';
  $('f-cnpjColeta').value        = s.cnpjColeta || '';
  $('f-nomeEmpresaColeta').value = s.nomeEmpresaColeta || '';
  $('f-cepColeta').value         = s.cepColeta || '';
  $('f-cidadeColeta').value      = s.cidadeColeta || '';
  $('f-enderecoCompleto').value  = s.enderecoCompleto || '';
  $('f-horarioColeta').value     = s.horarioColeta || '';
  $('f-cnpjDestino').value       = s.cnpjDestino || '';
  $('f-nomeDestino').value       = s.nomeDestino || '';
  $('f-cepDestino').value        = s.cepDestino || '';
  $('f-cidadeDestino').value     = s.cidadeDestino || '';
  $('f-peso').value              = s.peso || '';
  $('f-volume').value            = s.volume || '';
  $('f-valorNF').value           = s.valorNF || '';
  $('f-dimensoes').value         = s.dimensoes || '';
  $('f-descricaoMaterial').value = s.descricaoMaterial || '';
  $('f-quimico').value           = s.quimico || 'Não';

  $('editing-id-label').textContent = `Editando: #${id.slice(0,8).toUpperCase()}`;
  $('form-soli-id').classList.remove('hidden');

  switchTab('tab-nova', document.querySelectorAll('.tab')[0]);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── TABS ─────────────────────────────────────────────────────
window.switchTab = function (tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  $(tabId).classList.add('active');
  btn.classList.add('active');
};

// ─── NOVA / LIMPAR ────────────────────────────────────────────
window.novaSolicitacao = function () {
  limparForm();
  switchTab('tab-nova', document.querySelectorAll('.tab')[0]);
};

window.limparForm = function () {
  editingId = null;
  $('form-soli-id').classList.add('hidden');
  $('upload-status').textContent = '';
  ['f-numeroPedido','f-centroCusto','f-cnpjTomador','f-cnpjColeta','f-nomeEmpresaColeta',
   'f-cepColeta','f-cidadeColeta','f-enderecoCompleto','f-horarioColeta','f-cnpjDestino',
   'f-nomeDestino','f-cepDestino','f-cidadeDestino','f-peso','f-volume','f-valorNF',
   'f-dimensoes','f-descricaoMaterial'].forEach(id => { if ($(id)) $(id).value = ''; });
  $('f-quimico').value = 'Não';
  $('f-solicitante').value = currentUser.name;
};
