# Portal Be8 — Cotação & Coleta Transporte
### Desenvolvido por Lucas L. Diogo para Be8 2026

---

## 📁 Estrutura de Arquivos

```
be8-portal/
├── index.html          ← Página inicial (escolha do link)
├── solicitacao.html    ← LINK 1: Solicitação de Cotação/Coleta
├── painel.html         ← LINK 2: Painel de Recebimento de Cotações
├── styles.css          ← Estilos globais (identidade Be8)
├── firebase.js         ← Configuração Firebase (compartilhado)
├── solicitacao.js      ← Lógica Link 1
├── painel.js           ← Lógica Link 2
├── firebase.json       ← Configuração Firebase Hosting
├── firestore.rules     ← Regras de segurança Firestore + Storage
├── assets/
│   ├── logo-be8.png
│   └── logo-be8-secundaria.jpg
└── README.md
```

---

## 🔐 Configuração Firebase (ANTES DE PUBLICAR)

### 1. Habilitar Autenticação

No Firebase Console → **Authentication** → Sign-in method, ative:
- ✅ **Anonymous** (para solicitantes sem login)
- ✅ **Email/Password** (para operadores do painel)

Crie o usuário administrador:
- Email: seu e-mail operacional (ex: `operacoes@be8.com.br`)
- Senha: senha forte

### 2. Regras do Firestore

No Firebase Console → **Firestore** → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isAdmin() { return request.auth != null && request.auth.token.email != null; }
    function isAnonymous() { return request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous'; }

    match /requesters/{requesterId} {
      allow read, create, update: if isSignedIn();
      allow delete: if isAdmin();
    }

    match /solicitacoes/{solId} {
      allow read: if isSignedIn() && (
        isAdmin()
        || resource.data.requesterEmail == request.auth.token.email
      );
      allow create: if isSignedIn()
        && request.resource.data.requesterEmail is string
        && request.resource.data.requesterEmail.size() > 0;
      allow update: if isSignedIn() && (
        isAdmin()
        || (resource.data.requesterEmail == request.auth.token.email
          && !(resource.data.status in ['Entregue','Cancelado']))
      );
      allow delete: if isAdmin();
    }

    match /configuracoes/{configId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
  }
}
```

### 3. Regras do Storage

No Firebase Console → **Storage** → Rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /notas-fiscais/{fileName} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('(application/pdf|text/xml|image/.*)');
      allow delete: if request.auth != null && request.auth.token.email != null;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🚀 Publicação — Firebase Hosting

```bash
# 1. Instalar Firebase CLI (se não tiver)
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Entrar na pasta do projeto
cd be8-portal

# 4. Inicializar (se primeira vez)
firebase init hosting
#  → Escolha: Use an existing project → soli-coleta-be8
#  → Public directory: . (ponto)
#  → Single-page app: No
#  → Overwrite index.html: No

# 5. Publicar
firebase deploy --only hosting

# URL ficará tipo:
# https://soli-coleta-be8.web.app
```

### Publicação — Netlify (alternativa simples)

1. Acesse https://netlify.com
2. Crie conta gratuita
3. Arraste a pasta `be8-portal` para o painel
4. Pronto — URL gerada automaticamente

### Publicação — Vercel

```bash
npm install -g vercel
cd be8-portal
vercel
# Siga as instruções → framework: Other
```

---

## 🔗 Links do sistema após publicação

| Link | URL | Usuário |
|------|-----|---------|
| Página inicial | `https://SEU-DOMÍNIO/` | Todos |
| LINK 1 - Solicitação | `https://SEU-DOMÍNIO/solicitacao.html` | Solicitantes internos |
| LINK 2 - Painel | `https://SEU-DOMÍNIO/painel.html` | Operadores Be8 |

---

## 📋 Como usar

### LINK 1 — Solicitação (solicitantes internos)
1. Acesse `solicitacao.html`
2. Informe nome e e-mail
3. Preencha o formulário com dados da coleta
4. Salve — a solicitação aparece automaticamente no Painel
5. Acompanhe status e transportadora definida na aba Histórico

### LINK 2 — Painel Operacional (operadores Be8)
1. Acesse `painel.html`
2. Clique em 🔐 Admin e faça login com e-mail/senha do Firebase
3. Veja os cards gerados automaticamente pelas solicitações
4. Clique em qualquer card para editar status, lançar cotações e definir vencedora
5. Use a aba Dashboard para indicadores
6. Use a aba Tabela Geral para exportar Excel ou PDF

---

## 🗄️ Modelagem Firestore

### Coleção `requesters`
```json
{
  "name": "João Silva",
  "email": "joao@empresa.com",
  "createdAt": "timestamp",
  "lastSeen": "timestamp"
}
```

### Coleção `solicitacoes`
```json
{
  "requesterName": "João Silva",
  "requesterEmail": "joao@empresa.com",
  "solicitante": "João Silva",
  "numeroPedido": "4500184177",
  "centroCusto": "3010",
  "cnpjTomador": "07.322.382/0001-19",
  "cnpjColeta": "30.556.474/0001-42",
  "nomeEmpresaColeta": "Power Chain S.A.",
  "cepColeta": "14406-076",
  "cidadeColeta": "Franca/SP",
  "enderecoCompleto": "Rua X, 100, Bairro Y",
  "horarioColeta": "08:00 às 17:00",
  "cnpjDestino": "07.322.382/0001-19",
  "nomeDestino": "Be8 Passo Fundo",
  "cepDestino": "99050-700",
  "cidadeDestino": "Passo Fundo - RS",
  "peso": "1136",
  "volume": "2 paletes",
  "valorNF": 12177.00,
  "dimensoes": "1,968 M3",
  "descricaoMaterial": "Conjunto de Paletas em UHMW",
  "quimico": "Não",
  "anexoNotaFiscalUrl": "https://...",
  "status": "A tratar",
  "unidade": "Be8 - Passo Fundo",
  "tipoFrete": "Dedicado",
  "operador": "Cleverson",
  "numeroCotacao": "RODOLIMEIRA 513",
  "cotacao1": { "transportadora": "Rodolimeira", "cnpj": "00.000.000/0001-00", "valor": 2780 },
  "cotacao2": { "transportadora": "Zanivan", "cnpj": "00.000.000/0001-00", "valor": 8850 },
  "cotacao3": { "transportadora": "Courier", "cnpj": "00.000.000/0001-00", "valor": 4983.81 },
  "vencedora": { "cotacaoIdx": 1, "transportadora": "Rodolimeira", "cnpj": "00.000.000/0001-00", "valor": 2780 },
  "cotacaoFechada": "Rodolimeira",
  "valorFechado": 2780,
  "reducao": -2203.81,
  "observacoes": "",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

---

## 📊 Colunas de exportação Excel (conforme planilha 2026)

DATA | OPERADOR | COTAÇÃO FECHADA | VALOR FECHADO | TIPO FRETE | COTAÇÃO 1 | VALOR COT.1 | COTAÇÃO 2 | VALOR COT.2 | COTAÇÃO 3 | VALOR COT.3 | REDUÇÃO | STATUS | SOLICITANTE | CENTRO CUSTO | CNPJ TOMADOR | CNPJ ORIGEM | NOME REMETENTE | CIDADE ORIGEM | CEP ORIGEM | CNPJ DESTINO | NOME DESTINO | CIDADE DESTINO | CEP DESTINO | VALOR NF | VOLUMES | PESO (KG) | DIMENSÕES (CM) | QUÍMICO | DESCRIÇÃO MATERIAL | NÚMERO PEDIDO | Nº COTAÇÃO | UNIDADE | ENDEREÇO COLETA | HORÁRIO COLETA | TRANSPORTADORA VENCEDORA | CNPJ TRANSP. VENCEDORA

---

*Desenvolvido por Lucas L. Diogo para Be8 2026*
