# ZionApp — Documentação Técnica

Aplicativo web de **gestão e engajamento de comunidade eclesiástica** (Igreja Zion), com gamificação, plano de leitura bíblica, pequenos grupos, voluntariado (com treinamentos), loja de recompensas, notificações, pedidos de oração e painel administrativo.

---

## Sumário
1. [Visão geral](#1-visão-geral)
2. [Arquitetura e stack](#2-arquitetura-e-stack)
3. [Estrutura de pastas](#3-estrutura-de-pastas)
4. [Como rodar (dev)](#4-como-rodar-dev)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Autenticação e autorização](#6-autenticação-e-autorização)
7. [Cargos e permissões](#7-cargos-e-permissões)
8. [Gamificação (Zion Points)](#8-gamificação-zion-points)
9. [Modelo de dados](#9-modelo-de-dados)
10. [Módulos e funcionalidades](#10-módulos-e-funcionalidades)
11. [Referência da API](#11-referência-da-api)
12. [Banco de dados e seed](#12-banco-de-dados-e-seed)
13. [Notas de mobile e deploy](#13-notas-de-mobile-e-deploy)

---

## 1. Visão geral

O ZionApp centraliza, num só lugar acessível pelo celular, as rotinas de uma comunidade de igreja:

- **Plano Bíblico** (multi-ano, editável pelo admin) com registro diário, sequência (streak), marcos e link direto para o plano no Spotify.
- **Links** (pequenos grupos) com mural, reações e enquetes, incluindo convite direto do líder.
- **Voluntariado** com áreas de serviço, escalas, disponibilidade, **treinamentos/módulos** por posição e mural.
- **Loja de Recompensas**: troca de pontos por prêmios, com voucher validado por **QR Code** (inclusive via leitor de câmera no app).
- **Grupos de leitura** com chat, ranking (por grupo e geral) e convites.
- **Notificações**, **pedidos de oração** (com controle de acesso granular), **check-in de eventos por QR** (RSVP separado do check-in real) e **painel administrativo** completo.

A mecânica de **gamificação (Zion Points)** incentiva a participação; a **liderança** ganha ferramentas de gestão e comunicação, e o **Admin** controla toda a governança do sistema (inclusive uma matriz de permissões configurável por cargo).

---

## 2. Arquitetura e stack

Arquitetura **cliente-servidor** com API REST (JSON), hospedada em nuvem.

**Frontend**
- React 19 + Vite (build/dev server)
- TailwindCSS 3 (estilização), lucide-react (ícones)
- Cliente de API central (`src/api.js`) com injeção de token JWT
- SPA de aba única (sem react-router; a navegação é por abas de estado)
- Leitor de QR Code embutido (`jsqr`), carregado sob demanda (`React.lazy`) para não engordar o bundle principal

**Backend**
- Node.js + Express 5 + TypeScript (executado via `tsx`)
- Prisma ORM 5 sobre **PostgreSQL**
- JWT (`jsonwebtoken`) para sessão, `bcryptjs` para senhas
- `zod` para validação de entrada, `express-rate-limit` para limitar tentativas, `cors`

**Deploy**
- **Frontend**: Vercel
- **Backend**: Render (plano free — hiberna após inatividade; primeira requisição após ociosidade leva ~20s para "acordar")
- **Banco de dados**: PostgreSQL hospedado no **Neon** (o mesmo banco é usado tanto pelo backend em produção quanto pelo ambiente local de desenvolvimento, via `DATABASE_URL`)

**Fluxo**: o React chama `API_URL` (derivada do host, ou fixa via `VITE_API_URL`) → Express valida token/permissões → Prisma lê/grava no PostgreSQL (Neon).

---

## 3. Estrutura de pastas

```
ZionApp/
├── .gitignore
├── DOCUMENTACAO.md            ← este arquivo
├── backend/
│   ├── package.json
│   ├── data/biblia_acf.json   ← texto bíblico (Almeida Corrigida Fiel) p/ leitura no app
│   ├── prisma/
│   │   ├── schema.prisma      ← modelos do banco (PostgreSQL)
│   │   └── migrations/        ← histórico de migrações (uso pontual; ver seção 12)
│   └── src/
│       ├── server.ts          ← TODA a API (rotas, auth, regras)
│       └── readingPlan.ts     ← plano de leitura estático (fallback do plano ativo)
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx            ← shell: auth, header, abas, notificações, rodapé, modais globais
        ├── api.js             ← cliente HTTP + token + resolução de URL
        ├── main.jsx
        ├── components/
        │   ├── Avatar.jsx
        │   └── QrScanner.jsx  ← leitor de QR via câmera (lazy-loaded)
        ├── utils/
        │   ├── image.js       ← compressão de imagem no upload
        │   └── qrCheckin.js   ← extrai código de check-in/voucher de uma URL escaneada
        └── pages/
            ├── Login.jsx
            ├── MembrosModule.jsx     ← Início (plano bíblico, eventos, calendário, oração)
            ├── LinksModule.jsx       ← pequenos grupos + mural
            ├── VoluntariosModule.jsx ← áreas, escalas, treinamentos, liderança
            ├── RewardsModule.jsx     ← Loja (resgate + validação de voucher)
            ├── GroupsPanel.jsx       ← grupos de leitura (chat/ranking)
            ├── PrayerModule.jsx      ← lista de pedidos de oração (reusado em Admin e como aba própria)
            └── AdminModule.jsx       ← painel administrativo
```

---

## 4. Como rodar (dev)

**Backend** (porta padrão 3000):
```bash
cd backend
npm install
# DATABASE_URL deve apontar para o Postgres (Neon) — ver seção 5
npx prisma db push --skip-generate    # sincroniza o schema com o banco
npx prisma generate
npx tsx src/server.ts                 # sobe a API
# 1ª vez (opcional): popular dados de exemplo
curl -X POST http://localhost:3000/api/seed -H "x-seed-key: zion-dev-seed"
```

> O projeto usa `npx prisma db push` (não `migrate deploy`) para aplicar mudanças de schema — o banco local de desenvolvimento é o **mesmo** banco Neon usado em produção, então uma sincronização de schema já reflete em ambos os ambientes.

**Frontend** (porta 5173):
```bash
cd frontend
npm install
npm run dev                    # abre em http://localhost:5173
```

**Usuários de exemplo** (após o seed) — senha padrão `123`:
| E-mail | Cargo |
|---|---|
| admin@zion.com | ADMIN |
| pastor@zion.com | PASTOR |
| lucas@zion.com | LIDER |
| joao@zion.com | LIDER |

---

## 5. Variáveis de ambiente

**Backend** (`backend/.env`):
| Var | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | — | String de conexão do PostgreSQL (Neon) |
| `PORT` | `3000` | Porta da API |
| `JWT_SECRET` | `zion-dev-secret-change-me` | Segredo dos tokens JWT — **trocar em produção** |
| `SEED_KEY` | `zion-dev-seed` | Chave exigida (`x-seed-key`) para rodar `/api/seed` |
| `CORS_ORIGIN` | (todas) | Lista separada por vírgula de origens permitidas; vazio = libera todas |

**Frontend** (`frontend/.env`, prefixo `VITE_`):
| Var | Padrão | Descrição |
|---|---|---|
| `VITE_API_URL` | (derivado) | URL da API. Se vazio, deriva de `window.location.hostname` + porta |
| `VITE_API_PORT` | `3000` | Porta usada na derivação automática |

> Por padrão a URL da API é derivada do host acessado, então funciona em `localhost` e pelo IP da rede (celular) sem editar nada. Em produção, `VITE_API_URL` aponta para a URL do backend no Render.

---

## 6. Autenticação e autorização

- **Login/registro** retornam um **JWT** contendo `{ id, role }`, assinado com `JWT_SECRET`. O token é guardado no `localStorage` (`zion_token`) pelo `api.js` e enviado como `Authorization: Bearer <token>`.
- Middleware `auth` (global) exige token válido em todas as rotas, exceto login/registro/reset/seed.
- Em resposta **401**, o cliente limpa o token e volta ao login automaticamente.
- **Impersonação ("Modo de Teste")**: admin gera um token temporário de outro usuário (`POST /api/auth/impersonate/:id`); o token original é preservado (`zion_original_token`) para voltar, sobrevivendo a F5.
- Senhas: hash **bcrypt** (nunca em texto puro). Nunca são retornadas (select `userPublic`).

Middlewares/guards de acesso:
- `auth` — autenticado.
- `adminOnly` — só `ADMIN`.
- `staffOnly` — `ADMIN` ou `PASTOR`.
- `requirePerm(chave)` — checa a matriz de permissões configurável por cargo (`hasPerm`).
- `canValidateVoucher` — atendente (flag `canRedeem`) ou staff.
- `canManage(modulo)` — acesso administrativo granular por módulo (Links/Áreas/Loja), via flags `canManageLinks/canManageAreas/canManageStore` no usuário, independente do cargo.
- `canViewPrayers(req)` — combina: staff, voluntário/líder **aprovado na área de Intercessão**, flag individual `prayerAccess`, ou permissão de cargo `PRAYER_VIEW`.

---

## 7. Cargos e permissões

**Hierarquia** (do menor ao maior nível):

```
MEMBRO (0) → VOLUNTARIO (1) → AUXILIAR_LIDER (2) → LIDER (3) → PASTOR (4) → ADMIN (5)
```

- **MEMBRO**: acesso ao app (Início, Links, Voluntários, Loja).
- **VOLUNTARIO / AUXILIAR_LIDER**: participam de áreas; podem liderar quando designados.
- **LIDER**: gerencia seus Links/áreas (aprovar entradas, convidar membros, criar escalas/treinamentos, fixar/excluir no mural).
- **PASTOR**: acessos amplos de admin, mas hoje **totalmente configuráveis** pela matriz de permissões (não há mais bypass automático de Pastor).
- **ADMIN**: único cargo com bypass automático (anti-lockout) — controle total, inclusive editar a matriz de permissões, impersonar usuários e promover qualquer pessoa a Pastor/Admin.

**Matriz de permissões** (Admin → Cargos): configurável por cargo, salva no modelo `RolePermission`. Apenas **ADMIN** tem coluna travada (sempre tudo liberado); **Pastor e demais cargos são totalmente editáveis**. Catálogo atual (`PERM_CATALOG`):

| Permissão | Categoria | Padrão | Descrição |
|---|---|---|---|
| `EVENT_CHECKIN_CODE` | Eventos | Pastor+ | Ver o código/QR de check-in para exibir no local do evento |
| `EVENT_MANAGE` | Eventos | Pastor+ | Criar/editar/excluir eventos |
| `GROUP_CREATE` | Plano Bíblico | Membro+ | Criar novos grupos de competição do Plano Bíblico |
| `READING_PLAN_MANAGE` | Plano Bíblico | Pastor+ | Criar/editar planos de leitura anuais |
| `READING_ADJUST` | Plano Bíblico | Pastor+ | Ajustar manualmente os dias de leitura de um membro |
| `ANNOUNCEMENT_MANAGE` | Comunicação | Pastor+ | Criar/editar/excluir avisos do Mural Geral |
| `PUBLICATION_MANAGE` | Comunicação | Pastor+ | Moderar/excluir publicações de qualquer pessoa no mural do Início |
| `POINT_RULE_MANAGE` | Gamificação | Pastor+ | Ajustar quantos Zion Points cada ação concede |
| `BUG_REPORT_MANAGE` | Sistema | Pastor+ | Ver e resolver bugs/sugestões reportados |
| `PRAYER_VIEW` | Comunidade | Pastor+ | Ver e marcar como orados os pedidos de oração |

> Observação: **resgatar na Loja é livre** para qualquer usuário com pontos; a **validação/baixa de voucher** é liberada individualmente pela flag **"Atendente"** (`canRedeem`) na aba Admin → Membros (ou para staff) — isso é independente da matriz de permissões acima.

---

## 8. Gamificação (Zion Points)

Pontos são creditados por ações e registrados de forma **idempotente** no ledger `PointAward` (unique `userId+ruleKey+refId`), evitando fraude/duplicação — feito pelo helper `awardPoints(userId, ruleKey, refId, fallback)`. Os valores são **configuráveis** em Admin → Gamificação (modelo `PointRule`); os padrões do seed:

| Regra (`key`) | Categoria | Pontos |
|---|---|---|
| `SIGNUP_BONUS` | Geral | 100 (boas-vindas no cadastro) |
| `EVENT_PARTICIPATION` | Eventos | 20 (crédito no **check-in real** do evento, não no RSVP) |
| `SHIFT_CONFIRMATION` | Voluntariado | 50 (confirmar escala) |
| `TRAINING_COMPLETION` | Voluntariado | 150 (concluir treinamento/módulo de uma área) |
| `BIBLE_DAILY_READ` | Plano Bíblico | 15 (leitura do dia **com** foto) |
| `BIBLE_DAILY_NOPHOTO` | Plano Bíblico | 5 (leitura do dia **sem** foto) |
| `BIBLE_MILESTONE_10/20/30/45/60` | Plano Bíblico | 50 / 100 / 150 / 200 / 300 (marcos de sequência) |

Anti-farm: o `refId` do check-in de evento precisa ser o próprio evento; treinamentos usam allowlist de módulos (`AreaTrainingCompletion`, unique por treinamento+usuário).

---

## 9. Modelo de dados

Modelos Prisma (**PostgreSQL**, ver `datasource db { provider = "postgresql" }`). Resumo dos principais (34 modelos no total):

- **User** — `name, email, password(hash), role, campus, points, bibleStreak, profileImage, canRedeem, canManageLinks, canManageAreas, canManageStore, prayerAccess, welcomed`. Relaciona-se com quase tudo.
- **Notification** — `type, title, body, refId, route, read, userId`. `route` faz o deep-link ao clicar.
- **PointAward** — ledger de pontos idempotente (`userId+ruleKey+refId`).
- **PointRule** — regras de pontuação configuráveis (`key, label, category, points, active`).
- **RolePermission** — matriz cargo × permissão (`role, permKey, allowed`).
- **ReadingLog** — leitura por dia (`day, reference, photoUrl`), unique `userId+day`.
- **ReadingPlan** — plano de leitura por ano (`year` unique, `label, days` JSON, `spotifyUrl`), editável pelo Admin; substitui o antigo array estático fixo (que agora só serve de *fallback*).
- **Product / Redemption** — Loja: produto (nome, categoria, custo, imagem) e voucher de resgate (`code, status ATIVO/USADO, cost, productName`), validável por QR.
- **Event** — evento (`title, date, location, type, recurrence, checkinCode`).
- **EventParticipation** — separa **RSVP** (`rsvpAt`) do **check-in real** (`checkedInAt`); pontos só são creditados no check-in.
- **Announcement** — comunicados (`type` GERAL/VOLUNTARIO).
- **Publication** — mural geral da comunidade.
- **Link** — pequeno grupo (`name, day, time, isOnline, locationUrl, leaderId`).
  - **LinkParticipation** (pedido/entrada/convite do líder, com status incluindo `CONVITE_PENDENTE`), **LinkMessage** (mural, com `category`, `pollOptions`, `isPinned`), **LinkMessageReaction**, **PollVote**.
- **Area** — área de voluntariado (`name, description, leaderId, icon`).
  - **AreaParticipation** (inclui `CONVITE_PENDENTE` e `SAIDA_PENDENTE`), **AreaPosition** (posição/função na área, com `requiredTrainingId` opcional), **AreaTraining** (módulo de treinamento: `title, description, videoUrl, imageUrl, linkUrl, order`), **AreaTrainingCompletion** (conclusão por usuário, unique `trainingId+userId`), **Availability** (disponibilidade semanal por dia/período), **Shift** (escala: `date, department, status, volunteerId`), **AreaMessage** (mural da área + enquetes), **AreaMessageReaction**, **AreaPollVote**.
- **ReadingGroup** — grupo de leitura; **GroupMember** (`status` ATIVO/PENDENTE), **GroupMessage** (`type` READING/COMMENT), **MessageReaction**.
- **BugReport** — reportes (`type` BUG/SUGESTAO, `title, description, status`).
- **PrayerRequest** — pedidos de oração (`content, status` ATIVO/ORADO).

O schema completo está em [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

---

## 10. Módulos e funcionalidades

### Início (`MembrosModule`)
- Banner **"Acontecendo agora"** no topo da tela.
- **Meu Engajamento**: saldo de Zion Points e sequência do plano bíblico.
- **Plano Bíblico**: leitura do dia; "Ler agora" (texto ACF no app); marcar leitura (com foto = +15 / sem foto = +5), efeito de "fogo" por marcos; botão de atalho para o **plano no Spotify**; compartilhar leitura + comentário nos grupos.
- **Calendário**: marca eventos confirmados e escalas.
- **Próximos eventos**: **RSVP** ("Participar") e depois **check-in** por código ou **leitor de QR** (câmera) no local — só o check-in credita pontos.
- **Mural da comunidade** (publicações) e **pedido de oração** (visível para quem tem acesso liberado à Intercessão).

### Links (`LinksModule`)
- Diretório de pequenos grupos; "Meus Links" e "Explorar".
- Solicitar entrada → o **líder aprova/recusa**; ou o **líder convida** diretamente um membro (convite pendente, aceite/recusa do convidado).
- **Mural/Timeline** com categorias, **reações (emoji)**, **enquetes** e mensagens **fixadas**.
- Indicação de grupo online "ao vivo" no horário.

### Voluntários (`VoluntariosModule`)
- Áreas de serviço; "Minhas Áreas" e "Explorar".
- Solicitar/aprovar participação, ou **líder convida** membro diretamente.
- **Escalas** criadas pelo líder (com anotação de elegibilidade por treinamento concluído); **disponibilidade** semanal por dia/período.
- **Posições da área** com pré-requisito opcional de treinamento (bloqueia atribuição até a pessoa concluir o módulo).
- **Treinamentos/módulos** por área (aba Liderança): criar/editar/excluir, com vídeo, imagem e link; membros concluem e ganham pontos.
- **Mural da área** (avisos/escala/treino, com reações e enquetes).
- **Check-in de eventos** via leitor de QR embutido.

### Loja (`RewardsModule`)
- Resgate de prêmios por Zion Points (**livre para todos**, basta ter saldo).
- Gera **voucher com QR**; seção **"Validar Voucher (Atendente)"** permite ao atendente/staff escanear (câmera) ou digitar o código para dar baixa.

### Grupos de leitura (`GroupsPanel`)
- Competição saudável: chat, reações, convites (com aceite), ranking por grupo e **ranking geral** entre todos os grupos.

### Oração (`PrayerModule`)
- Lista de pedidos de oração com opção de marcar como "orado".
- Acesso controlado por: staff, ser voluntário/líder aprovado numa área de Intercessão, flag individual `prayerAccess` (concedida em Admin → Membros) ou permissão de cargo `PRAYER_VIEW`.
- Aparece como aba própria para não-staff com acesso liberado, e como aba dentro do Admin para staff.

### Notificações (`App.jsx`)
- Sino no header, com **deep-link** por tipo (leva à tela/ação certa) e lembrete diário do plano.

### Admin (`AdminModule`) — abas
- **Painel** (métricas), **Links**, **Áreas**, **Eventos** (RSVP vs check-in), **Comunicados**, **Mural Geral**, **Loja** (CRUD de produtos + validar voucher), **Gamificação** (regras de pontos), **Membros** (cargos incl. Pastor, flags de atendente/módulos/oração, Modo de Teste), **Cargos** (matriz de permissões, editável inclusive para Pastor — só Admin acessa), **Plano Bíblico** (CRUD de planos por ano + link Spotify + ferramenta "Ajustar Contagem de Leitura" de um membro), **Oração** (pedidos de oração), **Bugs** (reportes/sugestões).

### Recursos globais
- **Pop-up de boas-vindas** no 1º acesso.
- **Rodapé** com **Reportar Bug** e **Enviar Sugestão**.
- **Check-in de evento** e **validação de voucher** por **deep link de QR** (`?checkin=` / `?voucher=`) ou pelo leitor de câmera embutido no app.
- Modais fecham no **X** e clicando **fora**; responsivos (não vazam da tela).

---

## 11. Referência da API

Base: URL do backend (Render em produção, `http://localhost:3000` em dev). Todas as rotas exigem `Authorization: Bearer <token>`, exceto as de autenticação e o seed. Legenda de acesso: 🔓 autenticado · 🛡️ admin · 👔 staff (admin/pastor) · 🎫 atendente/staff · ⭐ permissão específica.

### Autenticação
| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/register` | público (cria conta, +100 pts) |
| POST | `/api/auth/login` | público |
| POST | `/api/auth/reset-password` | público (dev) |
| GET | `/api/auth/me` | 🔓 |
| POST | `/api/auth/impersonate/:id` | 🛡️ |

### Usuários / permissões
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/users` · `/api/leaders` | 🔓 |
| PUT | `/api/users/:id` | dono ou 👔 |
| PATCH | `/api/users/:id/role` | 👔 (Pastor/Admin só por Admin) |
| PATCH | `/api/users/:id/redeem-flag` | 👔 (flag atendente) |
| PATCH | `/api/users/:id/module-access` | 👔 (flags Links/Áreas/Loja) |
| PATCH | `/api/users/:id/prayer-access` | 👔 (flag de acesso à Oração) |
| POST | `/api/users/me/welcome` | 🔓 |
| GET | `/api/permissions` · PUT `/api/permissions` | 🛡️ |
| GET | `/api/permissions/me` | 🔓 |

### Plano Bíblico / pontos
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/reading/me` · `/api/reading/text` | 🔓 |
| POST | `/api/reading/check` | 🔓 (credita pontos) |
| GET | `/api/reading/ranking` | 🔓 (ranking geral entre grupos) |
| GET | `/api/reading-plans` · `/api/reading-plans/:id` | 🔓 |
| POST | `/api/reading-plans` · PUT/DELETE `/api/reading-plans/:id` | ⭐ `READING_PLAN_MANAGE` |
| GET | `/api/admin/reading/:userId` | ⭐ `READING_ADJUST` |
| POST | `/api/admin/reading/adjust` | ⭐ `READING_ADJUST` |
| GET | `/api/points/mine` | 🔓 |
| POST | `/api/training/complete` | 🔓 |
| GET | `/api/me/stats` | 🔓 |

### Eventos
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/events` · `/api/events/stats` · `/api/events/my-participations` | 🔓 |
| POST/PUT/DELETE | `/api/events[/:id]` | ⭐ `EVENT_MANAGE` |
| GET | `/api/events/:id/checkin-code` | ⭐ `EVENT_CHECKIN_CODE` |
| POST | `/api/events/:id/participate` | 🔓 (RSVP) |
| POST | `/api/events/:id/checkin` | 🔓 (check-in real, credita pontos) |

### Links
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/links` · `/api/links/my-participations` · `/api/links/:id/participations` · `/api/links/:id/messages` | 🔓 |
| POST | `/api/links` | 👔 · DELETE `/api/links/:id` 👔 |
| PUT | `/api/links/:id` | líder ou staff |
| POST/DELETE | `/api/links/:id/request` | 🔓 |
| POST | `/api/links/:id/invite` · `/invite/accept` · `/invite/decline` | líder/staff (convidar) · convidado (aceitar/recusar) |
| PATCH | `/api/links/participations/:id` | líder ou staff |
| POST | `/api/links/:id/messages` · `/api/links/messages/:id/react` · `/vote` | 🔓 |
| DELETE/PATCH | `/api/links/messages/:id[/pin]` | autor/líder/staff |

### Áreas (voluntariado)
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/areas` · `/api/areas/my-participations` · `/api/areas/:id/participations` · `/api/areas/:id/shifts` · `/api/areas/:id/messages` | 🔓 |
| POST/PUT/DELETE | `/api/areas[/:id]` | 👔 · PATCH `/api/areas/:id/leader` 👔 |
| POST/DELETE | `/api/areas/:id/request` | 🔓 |
| POST | `/api/areas/:id/invite` · `/invite/accept` · `/invite/decline` | líder/staff (convidar) · convidado (aceitar/recusar) |
| PATCH | `/api/areas/participations/:id` | líder ou staff |
| GET/POST | `/api/areas/:id/positions` · PUT/DELETE `/api/areas/positions/:id` | líder ou staff |
| GET/POST | `/api/areas/:id/trainings` · PUT/DELETE `/api/areas/trainings/:id` | líder ou staff |
| POST | `/api/areas/trainings/:id/complete` | 🔓 (credita pontos) |
| GET | `/api/areas/trainings/:id/completions` | líder ou staff |
| GET/POST | `/api/areas/:id/availability` · GET `/mine` | 🔓 |
| POST | `/api/areas/:id/shifts` | líder ou staff |
| DELETE | `/api/shifts/:id` · PATCH `/api/shifts/:id/claim` · `/confirm` · GET `/api/shifts` | líder/dono/staff |
| POST | `/api/areas/:id/messages` · `/api/areas/messages/:id/react` · `/vote` | 🔓 |
| DELETE/PATCH | `/api/areas/messages/:id[/pin]` | autor/líder/staff |

### Loja
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/products` | 🔓 |
| POST/PUT/DELETE | `/api/products[/:id]` | 👔 |
| POST | `/api/products/:id/redeem` | 🔓 (resgate livre) |
| GET | `/api/redemptions/my` | 🔓 |
| GET | `/api/redemptions/validate/:code` · POST `/api/redemptions/consume` | 🎫 atendente/staff (consume = validação via QR) |
| PATCH | `/api/redemptions/:id/use` | 👔 |

### Grupos de leitura
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/groups` · `/api/groups/invites` · `/api/groups/:id` · `/api/groups/:id/messages` | 🔓 |
| GET | `/api/admin/groups-overview` | 👔 |
| POST | `/api/groups` | ⭐ `GROUP_CREATE` |
| POST | `/api/groups/:id/accept` · `/decline` · `/members` · `/messages` · `/messages/:msgId/react` | 🔓/membro |
| DELETE | `/api/groups/:id` · `/api/groups/:id/members/:userId` | dono/staff |

### Comunicados / mural / notificações
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/announcements` · `/api/publications` | 🔓 |
| POST/PUT/DELETE | `/api/announcements[/:id]` | ⭐ `ANNOUNCEMENT_MANAGE` |
| POST/DELETE | `/api/publications[/:id]` | autor/staff/⭐ `PUBLICATION_MANAGE` |
| GET | `/api/notifications` · PATCH `/read-all` · `/:id/read` | 🔓 |

### Oração / bugs / admin
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/prayer-requests` | ⭐ `canViewPrayers` (staff/intercessor/flag/`PRAYER_VIEW`) |
| GET | `/api/prayer-requests/access` | 🔓 (retorna se o usuário atual pode ver) |
| POST | `/api/prayer-requests` | 🔓 · PATCH `/:id` ⭐ `canViewPrayers` |
| POST | `/api/bug-reports` | 🔓 · GET/PATCH `/api/bug-reports[/:id]` ⭐ `BUG_REPORT_MANAGE` |
| GET | `/api/admin/stats` | 👔 |
| GET | `/api/point-rules` | 🔓 · POST/PUT/DELETE ⭐ `POINT_RULE_MANAGE` |
| POST | `/api/seed` | chave `x-seed-key` |

---

## 12. Banco de dados e seed

- Banco: **PostgreSQL** hospedado no **Neon**, referenciado via `DATABASE_URL`. O mesmo banco atende tanto o ambiente local de desenvolvimento quanto o backend em produção (Render) — não há bancos separados por ambiente.
- Mudanças de schema são aplicadas com `npx prisma db push --skip-generate` + `npx prisma generate` (não `migrate deploy`); a pasta `backend/prisma/migrations/` guarda um histórico pontual de migrações manuais aplicadas em fases anteriores do projeto.
- **Seed** (`POST /api/seed` com header `x-seed-key: zion-dev-seed`): **apaga todos os dados** e recria exemplos (usuários, produtos, regras de pontos, evento, áreas, links). **Não rode em produção depois de haver dados reais** — como o banco é compartilhado, isso afeta a produção também.
- Persistência: por ser Postgres gerenciado (Neon), os dados sobrevivem a reinícios do backend/deploys normalmente; ainda assim, evite rodar o seed fora de um ambiente controlado.

---

## 13. Notas de mobile e deploy

- **Testar no celular (mesma Wi-Fi, em dev)**: rode `npm run dev` (o Vite escuta na rede) e acesse pelo **IP da máquina** (ex.: `http://192.168.x.x:5173`). A URL da API é derivada automaticamente do host.
- **Produção**: frontend publicado no **Vercel**, backend no **Render**, banco no **Neon** — todos com HTTPS. `JWT_SECRET`/`SEED_KEY` de produção são diferentes dos valores padrão de dev, e `CORS_ORIGIN` restringe as origens aceitas pela API.
- Como o Render (free tier) hiberna após inatividade, a **primeira requisição** depois de um período ocioso pode levar ~20s (cold start) — isso é esperado, não é um bug.
- **Virar app nativo**: opções ainda em aberto — **PWA** (rápido, instalável pelo navegador) ou **Capacitor** (empacota o mesmo React em app Android/iOS para as lojas).

---

*Documentação gerada a partir do código-fonte atual (`backend/src/server.ts`, `schema.prisma`, módulos do frontend).*
