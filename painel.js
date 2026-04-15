// ============================================================
// painel.js — Lógica do Painel de Cotações Be8 (Link 2)
// Desenvolvido por Lucas L. Diogo para Be8 2026
// ============================================================

import {
  db, auth,
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously,
} from './firebase.js';

// ─── STATE ───────────────────────────────────────────────────
let allSolicitacoes = [];
let filteredSolicitacoes = [];
let editingCardId = null;
let unidades = [
  'Be8 - Passo Fundo','Be8 - Nova Marilândia','Be8 - Floriano',
  'Be8 - Marialva','Be8 - Santo Antônio do Tauá','Be8 - Alto Araguaia'
];
let tabelaPage = 1;
const PER_PAGE = 25;
let sortCol = null, sortAsc = true;
let chartInstances = {};
let isAdmin = false;

// ─── DOM HELPERS ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loader = (show, msg='') => {
  $('loader').classList.toggle('hidden', !show);
  if (msg) $('loader-text').textContent = msg;
};

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loader(true, 'Inicializando...');

  // Load unidades from localStorage
  const stored = localStorage.getItem('be8_unidades');
  if (stored) unidades = JSON.parse(stored);
  populateUnidadeSelects();

  // Anonymous auth to allow Firestore access
  onAuthStateChanged(auth, user => {
    if (!user) signInAnonymously(auth).catch(console.error);
    else initListener();
  });
});

function initListener() {
  const q = query(collection(db, 'solicitacoes'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    allSolicitacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    filteredSolicitacoes = [...allSolicitacoes];
    renderCards();
    renderKPIs();
    renderTabela();
    loader(false);
  }, err => {
    console.error(err);
    loader(false);
  });
}

// ─── UNIDADES ─────────────────────────────────────────────────
function populateUnidadeSelects() {
  const selects = ['filter-unidade','d-filter-unidade'];
  selects.forEach(id => {
    const el = $(id);
    if (!el) return;
    const cur = el.value;
    const first = el.options[0];
    el.innerHTML = '';
    el.appendChild(first || Object.assign(document.createElement('option'), { value:'', textContent:'Todas as unidades' }));
    unidades.forEach(u => el.appendChild(Object.assign(document.createElement('option'), { value:u, textContent:u })));
    el.value = cur;
  });
}

window.abrirModalUnidades = function () {
  renderUnidadesList();
  $('modal-unidades').classList.remove('hidden');
};

function renderUnidadesList() {
  $('unidades-list').innerHTML = unidades.map((u, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)">
      <span style="font-size:0.85rem">${u}</span>
      <button class="btn btn-danger btn-sm" onclick="removerUnidade(${i})">✕</button>
    </div>`).join('');
}

window.adicionarUnidade = function () {
  const val = $('nova-unidade-input').value.trim();
  if (!val) return;
  unidades.push(val);
  localStorage.setItem('be8_unidades', JSON.stringify(unidades));
  $('nova-unidade-input').value = '';
  renderUnidadesList();
  populateUnidadeSelects();
};

window.removerUnidade = function (idx) {
  unidades.splice(idx, 1);
  localStorage.setItem('be8_unidades', JSON.stringify(unidades));
  renderUnidadesList();
  populateUnidadeSelects();
};

// ─── ADMIN LOGIN ──────────────────────────────────────────────
window.toggleAdminLogin = function () {
  if (isAdmin) {
    signOut(auth).then(() => {
      isAdmin = false;
      $('user-info').textContent = '';
      $('btn-login-admin').textContent = '🔐 Admin';
      signInAnonymously(auth);
    });
  } else {
    $('modal-admin-login').classList.remove('hidden');
  }
};

window.loginAdmin = async function () {
  const email = $('admin-email').value.trim();
  const pass = $('admin-senha').value;
  if (!email || !pass) return;
  loader(true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    isAdmin = true;
    $('user-info').textContent = `✅ ${email}`;
    $('btn-login-admin').textContent = '🚪 Sair';
    fecharModal('modal-admin-login');
  } catch(e) {
    $('admin-login-alert').innerHTML = `<div class="alert alert-error">E-mail ou senha incorretos.</div>`;
  } finally { loader(false); }
};

// ─── FILTERS ──────────────────────────────────────────────────
window.filtrarCards = function () {
  const search = $('search-cards').value.toLowerCase();
  const status = $('filter-status').value;
  const unidade = $('filter-unidade').value;
  const frete = $('filter-frete').value;
  const de = $('filter-de').value;
  const ate = $('filter-ate').value;

  filteredSolicitacoes = allSolicitacoes.filter(s => {
    const txt = JSON.stringify(s).toLowerCase();
    if (search && !txt.includes(search)) return false;
    if (status && s.status !== status) return false;
    if (unidade && s.unidade !== unidade) return false;
    if (frete && s.tipoFrete !== frete) return false;
    if (de || ate) {
      const dt = s.createdAt?.toDate ? s.createdAt.toDate() : null;
      if (dt) {
        if (de && dt < new Date(de)) return false;
        if (ate && dt > new Date(ate + 'T23:59:59')) return false;
      }
    }
    return true;
  });
  renderCards();
  renderKPIs();
};

window.limparFiltros = function () {
  ['search-cards','filter-status','filter-unidade','filter-frete','filter-de','filter-ate']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  filteredSolicitacoes = [...allSolicitacoes];
  renderCards();
  renderKPIs();
};

// ─── RENDER CARDS ─────────────────────────────────────────────
function renderCards() {
  const cont = $('cards-container');
  if (!filteredSolicitacoes.length) {
    cont.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📭</div><p>Nenhuma solicitação encontrada.</p></div>`;
    return;
  }

  cont.innerHTML = filteredSolicitacoes.map(s => {
    const dt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('pt-BR') : '—';
    const statusBadge = statusBadgeHtml(s.status || 'A tratar');

    const cotacoes = [s.cotacao1, s.cotacao2, s.cotacao3]
      .map((c,i) => c?.transportadora ? `<div style="font-size:0.75rem;color:var(--white-dim);margin-top:3px">C${i+1}: <strong>${c.transportadora}</strong> R$${Number(c.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>` : '')
      .join('');

    const winner = s.vencedora?.transportadora
      ? `<div style="background:var(--teal-glow);border:1px solid var(--teal-line);border-radius:var(--radius-sm);padding:6px 10px;font-size:0.75rem;color:var(--teal);margin-top:8px">🏆 ${s.vencedora.transportadora} · R$${Number(s.vencedora.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`
      : '';

    return `
    <div class="painel-card" onclick="abrirCard('${s.id}')">
      <div class="painel-card-header">
        <div>
          <div class="painel-card-num">#${s.id.slice(0,8).toUpperCase()}</div>
          ${s.numeroCotacao ? `<div style="font-size:0.7rem;color:var(--slate)">Cotação: ${s.numeroCotacao}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${statusBadge}
          ${s.unidade ? `<span style="font-size:0.68rem;color:var(--slate)">${s.unidade}</span>` : ''}
        </div>
      </div>
      <div class="painel-card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.79rem;margin-bottom:8px">
          <div><span style="color:var(--slate);font-size:0.68rem">ORIGEM</span><br><strong>${s.cidadeColeta||'—'}</strong></div>
          <div><span style="color:var(--slate);font-size:0.68rem">DESTINO</span><br><strong>${s.cidadeDestino||'—'}</strong></div>
          <div><span style="color:var(--slate);font-size:0.68rem">SOLICITANTE</span><br>${s.solicitante||s.requesterName||'—'}</div>
          <div><span style="color:var(--slate);font-size:0.68rem">TIPO</span><br>${s.tipoFrete||'—'}</div>
          <div><span style="color:var(--slate);font-size:0.68rem">PESO</span><br>${s.peso||'—'} kg</div>
          <div><span style="color:var(--slate);font-size:0.68rem">VALOR NF</span><br>R$ ${Number(s.valorNF||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        </div>
        ${cotacoes}
        ${winner}
        <div style="font-size:0.68rem;color:var(--slate);margin-top:8px;text-align:right">${dt}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── STATUS BADGE ─────────────────────────────────────────────
function statusBadgeHtml(status) {
  const map = {
    'A tratar':'atratar','Cotação':'cotacao','Aprovação':'aprovacao',
    'Coleta':'coleta','Em trânsito':'transito','Entregue':'entregue','Cancelado':'cancelado'
  };
  return `<span class="badge badge-${map[status]||'atratar'}">${status}</span>`;
}

// ─── KPIs ─────────────────────────────────────────────────────
function renderKPIs() {
  const s = filteredSolicitacoes;
  $('kpi-total').textContent = s.length;
  $('kpi-atratar').textContent = s.filter(x=>x.status==='A tratar').length;
  $('kpi-cotacao').textContent = s.filter(x=>x.status==='Cotação').length;
  $('kpi-aprovacao').textContent = s.filter(x=>x.status==='Aprovação').length;
  $('kpi-coleta').textContent = s.filter(x=>x.status==='Coleta').length;
  $('kpi-transito').textContent = s.filter(x=>x.status==='Em trânsito').length;
  $('kpi-entregue').textContent = s.filter(x=>x.status==='Entregue').length;
  const red = s.reduce((acc,x) => acc + Math.abs(parseFloat(x.reducao)||0), 0);
  $('kpi-reducao').textContent = `R$ ${red.toLocaleString('pt-BR',{minimumFractionDigits:0})}`;
}

// ─── ABRIR CARD MODAL ─────────────────────────────────────────
window.abrirCard = function (id) {
  const s = allSolicitacoes.find(x => x.id === id);
  if (!s) return;
  editingCardId = id;
  $('modal-card-title').innerHTML = `📦 Solicitação <span class="mono" style="color:var(--teal)">#${id.slice(0,8).toUpperCase()}</span>`;

  const makeInput = (label, key, type='text', opts=null) => {
    const val = s[key] ?? '';
    if (opts) {
      return `<div class="form-group">
        <label>${label}</label>
        <select id="mc-${key}">${opts.map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join('')}</select>
      </div>`;
    }
    return `<div class="form-group">
      <label>${label}</label>
      <input type="${type}" id="mc-${key}" value="${String(val).replace(/"/g,'&quot;')}" />
    </div>`;
  };

  const unidadeOpts = ['', ...unidades];
  const statusOpts = ['A tratar','Cotação','Aprovação','Coleta','Em trânsito','Entregue','Cancelado'];

  const c1 = s.cotacao1||{}; const c2 = s.cotacao2||{}; const c3 = s.cotacao3||{};

  $('modal-card-body').innerHTML = `
  <div id="modal-save-alert"></div>

  <div class="section-title">Status & Controle</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('Status', 'status', 'text', statusOpts)}
    ${makeInput('Unidade', 'unidade', 'text', unidadeOpts)}
    ${makeInput('Tipo de Frete', 'tipoFrete', 'text', ['','Fracionado','Dedicado'])}
    ${makeInput('Operador', 'operador')}
    ${makeInput('Número da Cotação', 'numeroCotacao')}
    ${makeInput('Centro de Custo', 'centroCusto')}
  </div>

  <div class="section-title">Solicitante</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('Nome Solicitante', 'solicitante')}
    ${makeInput('E-mail Solicitante', 'requesterEmail', 'email')}
    ${makeInput('CNPJ Tomador', 'cnpjTomador')}
    ${makeInput('Número Pedido', 'numeroPedido')}
  </div>

  <div class="section-title">Origem</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('CNPJ Origem', 'cnpjColeta')}
    ${makeInput('Nome Remetente', 'nomeEmpresaColeta')}
    ${makeInput('Cidade Origem', 'cidadeColeta')}
    ${makeInput('CEP Origem', 'cepColeta')}
    ${makeInput('Endereço Coleta', 'enderecoCompleto')}
    ${makeInput('Horário Coleta', 'horarioColeta')}
  </div>

  <div class="section-title">Destino</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('CNPJ Destino', 'cnpjDestino')}
    ${makeInput('Nome Destino', 'nomeDestino')}
    ${makeInput('Cidade Destino', 'cidadeDestino')}
    ${makeInput('CEP Destino', 'cepDestino')}
  </div>

  <div class="section-title">Carga</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('Peso (kg)', 'peso')}
    ${makeInput('Volume', 'volume')}
    ${makeInput('Valor NF', 'valorNF', 'number')}
    ${makeInput('Dimensões', 'dimensoes')}
    ${makeInput('Descrição Material', 'descricaoMaterial')}
    ${makeInput('Químico', 'quimico', 'text', ['Não','Sim'])}
  </div>

  <div class="section-title">Cotações Recebidas</div>
  <div style="display:grid;gap:10px;margin-bottom:1rem">
    ${[1,2,3].map(n => {
      const c = [null, c1, c2, c3][n];
      return `
      <div style="background:rgba(13,27,42,0.5);border:1px solid var(--card-border);border-radius:var(--radius-sm);padding:1rem">
        <div class="cotacao-label">Cotação ${n}</div>
        <div class="cotacao-row">
          <div class="form-group"><label>Transportadora</label><input type="text" id="mc-cot${n}-transp" value="${c.transportadora||''}" /></div>
          <div class="form-group"><label>CNPJ</label><input type="text" id="mc-cot${n}-cnpj" value="${c.cnpj||''}" /></div>
          <div class="form-group"><label>Valor R$</label><input type="number" id="mc-cot${n}-valor" value="${c.valor||''}" step="0.01" /></div>
        </div>
        <div class="winner-select">
          <button class="winner-btn ${s.vencedora?.cotacaoIdx===n?'selected':''}" onclick="selecionarVencedora(${n})" id="wb-${n}">
            🏆 Definir como vencedora
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>

  <div class="section-title">Resultado</div>
  <div class="form-grid mb-1" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${makeInput('Cotação Fechada', 'cotacaoFechada')}
    ${makeInput('Valor Fechado R$', 'valorFechado', 'number')}
    ${makeInput('Redução R$', 'reducao')}
  </div>

  <div class="section-title">Observações</div>
  <div class="form-group mb-1">
    <label>Observações</label>
    <textarea id="mc-observacoes" rows="3">${s.observacoes||''}</textarea>
  </div>

  $('modal-card').classList.remove('hidden');
};

// ─── SELECIONAR VENCEDORA ─────────────────────────────────────
window.selecionarVencedora = function (n) {
  [1,2,3].forEach(i => $(`wb-${i}`)?.classList.toggle('selected', i===n));
  // Tag selected for save
  $('mc-cotacaoFechada') && ($(`mc-cotacaoFechada`).value = $(`mc-cot${n}-transp`).value);
  const val = parseFloat($(`mc-cot${n}-valor`).value)||0;
  $('mc-valorFechado') && ($(`mc-valorFechado`).value = val);

  // Compute reducao
  const vals = [1,2,3].map(i => parseFloat($(`mc-cot${i}-valor`).value)||Infinity);
  const outros = vals.filter((_,i) => i!==n-1).filter(v=>v!==Infinity);
  const red = outros.length ? Math.max(...outros) - val : 0;
  $('mc-reducao') && ($(`mc-reducao`).value = red.toFixed(2));

  // Store winner idx in a data attr
  $('modal-card-body').dataset.winnerIdx = n;
};

// ─── SALVAR CARD ──────────────────────────────────────────────
window.salvarCard = async function () {
  if (!editingCardId) return;
  const get = id => { const el = $(`mc-${id}`); return el ? el.value.trim() : ''; };
  const getNum = id => { const el = $(`mc-${id}`); return el ? parseFloat(el.value)||0 : 0; };

  const winnerIdx = parseInt($('modal-card-body').dataset.winnerIdx)||0;
  const vencedora = winnerIdx ? {
    cotacaoIdx: winnerIdx,
    transportadora: $(`mc-cot${winnerIdx}-transp`)?.value.trim()||'',
    cnpj: $(`mc-cot${winnerIdx}-cnpj`)?.value.trim()||'',
    valor: getNum(`cot${winnerIdx}-valor`),
  } : (allSolicitacoes.find(x=>x.id===editingCardId)?.vencedora||{});

  const data = {
    status:            get('status'),
    unidade:           get('unidade'),
    tipoFrete:         get('tipoFrete'),
    operador:          get('operador'),
    numeroCotacao:     get('numeroCotacao'),
    centroCusto:       get('centroCusto'),
    solicitante:       get('solicitante'),
    requesterEmail:    get('requesterEmail'),
    cnpjTomador:       get('cnpjTomador'),
    numeroPedido:      get('numeroPedido'),
    cnpjColeta:        get('cnpjColeta'),
    nomeEmpresaColeta: get('nomeEmpresaColeta'),
    cidadeColeta:      get('cidadeColeta'),
    cepColeta:         get('cepColeta'),
    enderecoCompleto:  get('enderecoCompleto'),
    horarioColeta:     get('horarioColeta'),
    cnpjDestino:       get('cnpjDestino'),
    nomeDestino:       get('nomeDestino'),
    cidadeDestino:     get('cidadeDestino'),
    cepDestino:        get('cepDestino'),
    peso:              get('peso'),
    volume:            get('volume'),
    valorNF:           getNum('valorNF'),
    dimensoes:         get('dimensoes'),
    descricaoMaterial: get('descricaoMaterial'),
    quimico:           get('quimico'),
    cotacaoFechada:    get('cotacaoFechada'),
    valorFechado:      getNum('valorFechado'),
    reducao:           get('reducao'),
    observacoes:       $('mc-observacoes')?.value.trim()||'',
    cotacao1: { transportadora: $('mc-cot1-transp')?.value.trim()||'', cnpj: $('mc-cot1-cnpj')?.value.trim()||'', valor: parseFloat($('mc-cot1-valor')?.value)||0 },
    cotacao2: { transportadora: $('mc-cot2-transp')?.value.trim()||'', cnpj: $('mc-cot2-cnpj')?.value.trim()||'', valor: parseFloat($('mc-cot2-valor')?.value)||0 },
    cotacao3: { transportadora: $('mc-cot3-transp')?.value.trim()||'', cnpj: $('mc-cot3-cnpj')?.value.trim()||'', valor: parseFloat($('mc-cot3-valor')?.value)||0 },
    vencedora,
    updatedAt: serverTimestamp(),
  };

  loader(true, 'Salvando...');
  try {
    await updateDoc(doc(db, 'solicitacoes', editingCardId), data);
    fecharModal('modal-card');
  } catch(e) {
    console.error(e);
    $('modal-save-alert').innerHTML = `<div class="alert alert-error">Erro ao salvar: ${e.message}</div>`;
  } finally { loader(false); }
};

// ─── EXCLUIR ──────────────────────────────────────────────────
window.confirmarExclusao = function () { $('modal-confirm').classList.remove('hidden'); };

window.excluirCard = async function () {
  if (!editingCardId) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'solicitacoes', editingCardId));
    fecharModal('modal-confirm');
    fecharModal('modal-card');
    editingCardId = null;
  } catch(e) { console.error(e); }
  finally { loader(false); }
};

// ─── MODAL UTILS ──────────────────────────────────────────────
window.fecharModal = function (id) { $(id).classList.add('hidden'); };

// ─── TABS ─────────────────────────────────────────────────────
window.switchMainTab = function (tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#main-tabs .tab').forEach(t => t.classList.remove('active'));
  $(tabId).classList.add('active');
  btn.classList.add('active');
  if (tabId === 'tab-dashboard') renderDashboard();
  if (tabId === 'tab-tabela') { filtrarTabela(); }
};

// ─── DASHBOARD ────────────────────────────────────────────────
window.renderDashboard = function () {
  const du = $('d-filter-unidade')?.value;
  const dde = $('d-filter-de')?.value;
  const date = $('d-filter-ate')?.value;

  let data = allSolicitacoes.filter(s => {
    if (du && s.unidade !== du) return false;
    const dt = s.createdAt?.toDate ? s.createdAt.toDate() : null;
    if (dt) {
      if (dde && dt < new Date(dde)) return false;
      if (date && dt > new Date(date + 'T23:59:59')) return false;
    }
    return true;
  });

  const negociado = data.reduce((a,s) => a + (parseFloat(s.valorFechado)||0), 0);
  const reducao = data.reduce((a,s) => a + Math.abs(parseFloat(s.reducao)||0), 0);
  const media = data.length ? reducao / data.length : 0;
  const frac = data.filter(s => s.tipoFrete === 'Fracionado').length;
  const ded = data.filter(s => s.tipoFrete === 'Dedicado').length;

  $('d-total').textContent = data.length;
  $('d-negociado').textContent = `R$ ${negociado.toLocaleString('pt-BR',{minimumFractionDigits:0})}`;
  $('d-reducao').textContent = `R$ ${reducao.toLocaleString('pt-BR',{minimumFractionDigits:0})}`;
  $('d-media').textContent = `R$ ${media.toLocaleString('pt-BR',{minimumFractionDigits:0})}`;
  $('d-fracionado').textContent = frac;
  $('d-dedicado').textContent = ded;

  // Update unidade filter
  populateUnidadeSelects();

  buildChartStatus(data);
  buildChartDiario(data);
  buildChartUnidade(data);
  buildChartTransportadora(data);
};

window.limparFiltrosDash = function () {
  ['d-filter-unidade','d-filter-de','d-filter-ate'].forEach(id => { if ($(id)) $(id).value = ''; });
  renderDashboard();
};

const CHART_COLORS = ['#1DB88A','#64B5F6','#FFD54F','#CE93D8','#80DEEA','#FFAB40','#EF9A9A','#A5D6A7'];

function destroyChart(key) {
  if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

function chartDefaults() {
  return {
    plugins: { legend: { labels: { color: '#8BA4BC', font: { family: 'Sora', size: 11 } } } },
    scales: {
      x: { ticks: { color: '#8BA4BC', font: { family: 'Sora', size: 10 } }, grid: { color: 'rgba(139,164,188,0.1)' } },
      y: { ticks: { color: '#8BA4BC', font: { family: 'Sora', size: 10 } }, grid: { color: 'rgba(139,164,188,0.1)' } },
    },
    responsive: true,
    maintainAspectRatio: false,
  };
}

function buildChartStatus(data) {
  destroyChart('status');
  const statuses = ['A tratar','Cotação','Aprovação','Coleta','Em trânsito','Entregue','Cancelado'];
  const counts = statuses.map(s => data.filter(x => x.status === s).length);
  chartInstances['status'] = new Chart($('chart-status'), {
    type: 'doughnut',
    data: { labels: statuses, datasets: [{ data: counts, backgroundColor: CHART_COLORS, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8BA4BC', font: { family: 'Sora', size: 11 } } } } },
  });
}

function buildChartDiario(data) {
  destroyChart('diario');
  const counts = {};
  data.forEach(s => {
    const dt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('pt-BR') : null;
    if (dt) counts[dt] = (counts[dt]||0) + 1;
  });
  const labels = Object.keys(counts).slice(-30);
  const vals = labels.map(l => counts[l]);
  chartInstances['diario'] = new Chart($('chart-diario'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Solicitações', data: vals, backgroundColor: 'rgba(29,184,138,0.7)', borderRadius: 4 }] },
    options: chartDefaults(),
  });
}

function buildChartUnidade(data) {
  destroyChart('unidade');
  const counts = {};
  data.forEach(s => { const u = s.unidade||'Sem unidade'; counts[u] = (counts[u]||0) + 1; });
  const labels = Object.keys(counts);
  const vals = labels.map(l => counts[l]);
  chartInstances['unidade'] = new Chart($('chart-unidade'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Qtd', data: vals, backgroundColor: CHART_COLORS, borderRadius: 4 }] },
    options: { ...chartDefaults(), indexAxis: 'y' },
  });
}

function buildChartTransportadora(data) {
  destroyChart('transportadora');
  const counts = {};
  data.forEach(s => {
    const t = s.vencedora?.transportadora;
    if (t) counts[t] = (counts[t]||0) + 1;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
  chartInstances['transportadora'] = new Chart($('chart-transportadora'), {
    type: 'bar',
    data: { labels: sorted.map(x=>x[0]), datasets: [{ label: 'Vitorias', data: sorted.map(x=>x[1]), backgroundColor: CHART_COLORS, borderRadius: 4 }] },
    options: { ...chartDefaults(), indexAxis: 'y' },
  });
}

// ─── TABELA ───────────────────────────────────────────────────
const TABLE_COLS = [
  { key:'createdAt',         label:'DATA',             fmt: v => v?.toDate ? v.toDate().toLocaleDateString('pt-BR') : '—' },
  { key:'operador',          label:'OPERADOR' },
  { key:'cotacaoFechada',    label:'COTAÇÃO FECHADA' },
  { key:'valorFechado',      label:'VALOR FECHADO',    fmt: v => v ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—' },
  { key:'tipoFrete',         label:'TIPO FRETE' },
  { key:'_cot1',             label:'COTAÇÃO 1',        fmt: (_,s) => s.cotacao1?.transportadora||'—' },
  { key:'_val1',             label:'VALOR COT.1',      fmt: (_,s) => s.cotacao1?.valor ? `R$ ${Number(s.cotacao1.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—' },
  { key:'_cot2',             label:'COTAÇÃO 2',        fmt: (_,s) => s.cotacao2?.transportadora||'—' },
  { key:'_val2',             label:'VALOR COT.2',      fmt: (_,s) => s.cotacao2?.valor ? `R$ ${Number(s.cotacao2.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—' },
  { key:'_cot3',             label:'COTAÇÃO 3',        fmt: (_,s) => s.cotacao3?.transportadora||'—' },
  { key:'_val3',             label:'VALOR COT.3',      fmt: (_,s) => s.cotacao3?.valor ? `R$ ${Number(s.cotacao3.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—' },
  { key:'reducao',           label:'REDUÇÃO' },
  { key:'status',            label:'STATUS' },
  { key:'solicitante',       label:'SOLICITANTE' },
  { key:'centroCusto',       label:'CENTRO CUSTO' },
  { key:'cnpjTomador',       label:'CNPJ TOMADOR' },
  { key:'cnpjColeta',        label:'CNPJ ORIGEM' },
  { key:'nomeEmpresaColeta', label:'NOME REMETENTE' },
  { key:'cidadeColeta',      label:'CIDADE ORIGEM' },
  { key:'cepColeta',         label:'CEP ORIGEM' },
  { key:'cnpjDestino',       label:'CNPJ DESTINO' },
  { key:'nomeDestino',       label:'NOME DESTINO' },
  { key:'cidadeDestino',     label:'CIDADE DESTINO' },
  { key:'cepDestino',        label:'CEP DESTINO' },
  { key:'valorNF',           label:'VALOR NF',         fmt: v => v ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—' },
  { key:'volume',            label:'VOLUMES' },
  { key:'peso',              label:'PESO (KG)' },
  { key:'dimensoes',         label:'DIMENSÕES (CM)' },
  { key:'quimico',           label:'QUÍMICO' },
  { key:'descricaoMaterial', label:'DESCRIÇÃO MATERIAL' },
  { key:'numeroPedido',      label:'NÚMERO PEDIDO' },
  { key:'numeroCotacao',     label:'Nº COTAÇÃO' },
  { key:'unidade',           label:'UNIDADE' },
  { key:'enderecoCompleto',  label:'ENDEREÇO COLETA' },
  { key:'horarioColeta',     label:'HORÁRIO COLETA' },
  { key:'_winner',           label:'TRANSPORTADORA VENCEDORA', fmt: (_,s) => s.vencedora?.transportadora||'—' },
  { key:'_winnerCNPJ',       label:'CNPJ TRANSP. VENCEDORA',  fmt: (_,s) => s.vencedora?.cnpj||'—' },
];

let tabelaFiltered = [];

window.filtrarTabela = function () {
  const search = $('search-tabela')?.value.toLowerCase()||'';
  const status = $('t-filter-status')?.value||'';
  tabelaFiltered = allSolicitacoes.filter(s => {
    if (status && s.status !== status) return false;
    if (search && !JSON.stringify(s).toLowerCase().includes(search)) return false;
    return true;
  });
  tabelaPage = 1;
  renderTabelaHTML();
};

function renderTabela() {
  tabelaFiltered = [...allSolicitacoes];
  renderTabelaHTML();
}

function renderTabelaHTML() {
  // Header
  $('tabela-header').innerHTML = TABLE_COLS.map((c,i) =>
    `<th onclick="sortTabela(${i})" ${sortCol===i?'class="sorted"':''}>${c.label} <span class="sort-icon">${sortCol===i?(sortAsc?'↑':'↓'):'⇅'}</span></th>`
  ).join('') + '<th>AÇÃO</th>';

  // Sort
  let data = [...tabelaFiltered];
  if (sortCol !== null) {
    const col = TABLE_COLS[sortCol];
    data.sort((a,b) => {
      const va = col.fmt ? col.fmt(a[col.key],a) : (a[col.key]||'');
      const vb = col.fmt ? col.fmt(b[col.key],b) : (b[col.key]||'');
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  // Paginate
  const total = data.length;
  const pages = Math.ceil(total / PER_PAGE) || 1;
  if (tabelaPage > pages) tabelaPage = 1;
  const slice = data.slice((tabelaPage-1)*PER_PAGE, tabelaPage*PER_PAGE);

  $('tabela-body').innerHTML = slice.map(s => `
    <tr>
      ${TABLE_COLS.map(c => {
        const val = c.fmt ? c.fmt(s[c.key], s) : (s[c.key] ?? '—');
        return `<td title="${val}">${val}</td>`;
      }).join('')}
      <td><button class="btn btn-icon btn-sm" onclick="abrirCard('${s.id}')">✏️</button></td>
    </tr>`).join('');

  // Pagination
  $('pag-info').textContent = `${total} registros · Pág. ${tabelaPage}/${pages}`;
  $('pag-controls').innerHTML = `
    <button class="page-btn" onclick="goPage(1)" ${tabelaPage===1?'disabled':''}>«</button>
    <button class="page-btn" onclick="goPage(${tabelaPage-1})" ${tabelaPage===1?'disabled':''}>‹</button>
    <button class="page-btn active">${tabelaPage}</button>
    <button class="page-btn" onclick="goPage(${tabelaPage+1})" ${tabelaPage===pages?'disabled':''}>›</button>
    <button class="page-btn" onclick="goPage(${pages})" ${tabelaPage===pages?'disabled':''}>»</button>`;
}

window.goPage = function (p) { tabelaPage = p; renderTabelaHTML(); };
window.sortTabela = function (i) {
  if (sortCol === i) sortAsc = !sortAsc;
  else { sortCol = i; sortAsc = true; }
  renderTabelaHTML();
};

// ─── EXPORT EXCEL ─────────────────────────────────────────────
window.exportarExcel = function () {
  const rows = [TABLE_COLS.map(c => c.label)];
  tabelaFiltered.forEach(s => {
    rows.push(TABLE_COLS.map(c => {
      const v = c.fmt ? c.fmt(s[c.key], s) : (s[c.key] ?? '');
      return String(v).replace('R$ ','');
    }));
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = TABLE_COLS.map(() => ({ wch: 20 }));

  // Header style (via cell format)
  TABLE_COLS.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r:0, c:i });
    if (!ws[cellRef]) return;
    ws[cellRef].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0D1B2A' } } };
  });

  XLSX.utils.book_append_sheet(wb, ws, '2026');
  XLSX.writeFile(wb, `Be8_Cotacoes_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// ─── EXPORT PDF TABELA ────────────────────────────────────────
window.exportarPDFTabela = function () {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  pdf.setFont('helvetica');
  pdf.setFontSize(14);
  pdf.text('Be8 — Relatório de Cotações', 14, 16);
  pdf.setFontSize(9);
  pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);

  const visibleCols = TABLE_COLS.slice(0, 20);
  const headers = [visibleCols.map(c => c.label)];
  const body = tabelaFiltered.map(s =>
    visibleCols.map(c => {
      const v = c.fmt ? c.fmt(s[c.key], s) : (s[c.key] ?? '—');
      return String(v);
    })
  );

  pdf.autoTable({
    head: headers,
    body,
    startY: 26,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [13, 27, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 245, 250] },
  });

  pdf.save(`Be8_Cotacoes_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ─── PDF COTAÇÃO (por card) ───────────────────────────────────
window.gerarPDF = function () {
  const s = allSolicitacoes.find(x => x.id === editingCardId);
  if (!s) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header band
  pdf.setFillColor(13, 27, 42);
  pdf.rect(0, 0, 210, 35, 'F');
  pdf.setTextColor(29, 184, 138);
  pdf.setFontSize(18);
  pdf.setFont('helvetica','bold');
  pdf.text('Be8', 14, 18);
  pdf.setFontSize(9);
  pdf.setTextColor(200, 220, 240);
  pdf.text('Portal de Cotação — Transporte', 14, 26);

  // Numero cotacao / data
  pdf.setFontSize(11);
  pdf.setTextColor(29, 184, 138);
  pdf.text(`Cotação Nº: ${s.numeroCotacao || '—'}`, 130, 15);
  pdf.setFontSize(8);
  pdf.setTextColor(180, 200, 220);
  pdf.text(`Data: ${s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('pt-BR') : '—'}`, 130, 21);
  pdf.text(`Unidade: ${s.unidade || '—'}`, 130, 27);

  let y = 42;
  const line = (label, value) => {
    pdf.setFontSize(8);
    pdf.setTextColor(100, 130, 160);
    pdf.setFont('helvetica','normal');
    pdf.text(label + ':', 14, y);
    pdf.setTextColor(30, 40, 50);
    pdf.setFont('helvetica','bold');
    pdf.text(String(value||'—'), 60, y);
    y += 7;
  };

  const section = (title) => {
    y += 3;
    pdf.setFillColor(230, 240, 250);
    pdf.rect(14, y-4, 182, 7, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica','bold');
    pdf.setTextColor(13, 27, 42);
    pdf.text(title, 16, y);
    y += 6;
  };

  section('DADOS DE ORIGEM');
  line('CNPJ Coleta',        s.cnpjColeta);
  line('Remetente',          s.nomeEmpresaColeta);
  line('Endereço',           s.enderecoCompleto);
  line('Cidade',             s.cidadeColeta);
  line('CEP',                s.cepColeta);
  line('Horário Coleta',     s.horarioColeta);

  section('DADOS DE DESTINO');
  line('CNPJ Destino',       s.cnpjDestino);
  line('Nome Destino',       s.nomeDestino);
  line('Cidade Destino',     s.cidadeDestino);
  line('CEP Destino',        s.cepDestino);

  section('CARGA');
  line('Tipo de Frete',      s.tipoFrete);
  line('Peso (kg)',          s.peso);
  line('Volume',             s.volume);
  line('Dimensões',          s.dimensoes);
  line('Valor NF',           s.valorNF ? `R$ ${Number(s.valorNF).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—');
  line('Descrição Material', s.descricaoMaterial);
  line('Produto Químico',    s.quimico);

  // Footer
  pdf.setFontSize(7);
  pdf.setTextColor(150, 170, 190);
  pdf.text('Desenvolvido por Lucas L. Diogo para Be8 2026', 14, 290);
  pdf.text('Portal de Cotação Be8', 155, 290);

  pdf.save(`Be8_Cotacao_${s.numeroCotacao || s.id.slice(0,8)}.pdf`);
};
