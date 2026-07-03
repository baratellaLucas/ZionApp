# ZionApp — Documentação Técnica

Aplicativo web de **gestão e engajamento de comunidade eclesiástica** (Igreja Zion), com gamificação, plano de leitura bíblica, pequenos grupos, voluntariado, loja de recompensas, notificações e painel administrativo.

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

- **Plano Bíblico 2026** (365 dias) com registro diário, sequência (streak) e marcos.
- **Links** (pequenos grupos) com mural, reações e enquetes.
- **Voluntariado** com áreas de serviço, escalas, disponibilidade e mural.
- **Loja de Recompensas**: troca de pontos por prêmios, com voucher validado por QR Code.
- **Grupos de leitura** com chat, ranking e convites.
- **Notificações**, **pedidos de oração**, **check-in de eventos por QR** e **painel administrativo**.

A mecânica de **gamificação (Zion Points)** incentiva a participação; a **liderança** ganha ferramentas de gestão e comunicação.

---

## 2. Arquitetura e stack

Arquitetura **cliente-servidor** com API REST (JSON).

**Frontend**
- React 19 + Vite (build/dev server)
- TailwindCSS 3 (estilização), lucide-react (ícones)
- Cliente de API central (`src/api.js`) com injeção de token JWT
- SPA de aba única (sem react-router; a navegação é por abas de estado)

**Backend**
- Node.js + Express 5 + TypeScript (executado via `tsx`)
- Prisma ORM 5 sobre **SQLite** (`backend/prisma/dev.db`)
- JWT (`jsonwebtoken`) para sessão, `bcryptjs` para senhas
- `zod` para validação de entrada, `express-rate-limit` para limitar tentativas, `cors`

**Fluxo**: o React chama `API_URL` (derivada do host) → Express valida token/permissões → Prisma lê/grava no SQLite.

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
│   │   ├── schema.prisma      ← modelos do banco
│   │   ├── dev.db             ← banco SQLite (LOCAL, fora do git)
│   │   └── migrations/        ← histórico de migrações
│   └── src/
│       ├── server.ts          ← TODA a API (rotas, auth, regras)
│       └── readingPlan.ts     ← 365 referências do plano de leitura
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx            ← shell: auth, header, abas, notificações, rodapé, modais globais
        ├── api.js             ← cliente HTTP + token + resolução de URL
        ├── main.jsx
        ├── components/Avatar.jsx
        ├── utils/image.js     ← compressão de imagem no upload
        └── pages/
            ├── Login.jsx
            ├── MembrosModule.jsx     ← Início (plano bíblico, eventos, calendário, oração)
            ├── LinksModule.jsx       ← pequenos grupos + mural
            ├── VoluntariosModule.jsx ← áreas, escalas, mural, intercessão
            ├── RewardsModule.jsx     ← Loja
            ├── GroupsPanel.jsx       ← grupos de leitura (chat/ranking)
            └── AdminModule.jsx       ← painel administrativo
```

---

## 4. Como rodar (dev)

**Backend** (porta padrão 3000):
```bash
cd backend
npm install
npx prisma migrate deploy      # cria/atualiza o dev.db
npx prisma generate
npx tsx src/server.ts          # sobe a API
# 1ª vez (opcional): popular dados de exemplo
curl -X POST http://localhost:3000/api/seed -H "x-seed-key: zion-dev-seed"
```

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

**Backend** (`process.env`):
| Var | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta da API |
| `JWT_SECRET` | `zion-dev-secret-change-me` | Segredo dos tokens JWT — **trocar em produção** |
| `SEED_KEY` | `zion-dev-seed` | Chave exigida (`x-seed-key`) para rodar `/api/seed` |
| `CORS_ORIGIN` | (todas) | Lista separada por vírgula de origens permitidas; vazio = libera todas |

**Frontend** (`frontend/.env`, prefixo `VITE_`):
| Var | Padrão | Descrição |
|---|---|---|
| `VITE_API_URL` | (derivado) | URL da API. Se vazio, deriva de `window.location.hostname` + porta |
| `VITE_API_PORT` | `3000` | Porta usada na derivação automática |

> Por padrão a URL da API é derivada do host acessado (mesmo hostname, porta 3000), então funciona em `localhost` e pelo IP da rede (celular) sem editar nada.

---

## 6. Autenticação e autorização

- **Login/registro** retornam um **JWT** contendo `{ id, role }`, assinado com `JWT_SECRET` (validade definida no servidor). O token é guardado no `localStorage` (`zion_token`) pelo `api.js` e enviado como `Authorization: Bearer <token>`.
- Middleware `auth` (global) exige token válido em todas as rotas, exceto login/registro/reset/seed.
- Em resposta **401**, o cliente limpa o token e volta ao login automaticamente.
- **Impersonação ("Modo de Teste")**: admin gera um token temporário de outro usuário (`POST /api/auth/impersonate/:id`); o token original é preservado (`zion_original_token`) para voltar, sobrevivendo a F5.
- Senhas: hash **bcrypt** (nunca em texto puro). Nunca são retornadas (select `userPublic`).

Middlewares de acesso:
- `auth` — autenticado.
- `adminOnly` — só `ADMIN`.
- `staffOnly` — `ADMIN` ou `PASTOR`.
- `requirePerm(chave)` — checa a matriz de permissões por cargo.
- `canValidateVoucher` — atendente (flag `canRedeem`) ou staff.

---

## 7. Cargos e permissões

**Hierarquia** (do menor ao maior nível):

```
MEMBRO (0) → VOLUNTARIO (1) → AUXILIAR_LIDER (2) → LIDER (3) → PASTOR (4) → ADMIN (5)
```

- **MEMBRO**: acesso ao app (Início, Links, Voluntários, Loja).
- **VOLUNTARIO / AUXILIAR_LIDER**: participam de áreas; podem liderar quando designados.
- **LIDER**: gerencia seus Links/áreas (aprovar entradas, criar escalas, fixar/excluir no mural).
- **PASTOR**: quase todos os acessos de admin (painel completo, gestão de conteúdo, overrides de liderança), **exceto**: editar a matriz de permissões, impersonar usuários e conceder cargos de Pastor/Admin.
- **ADMIN**: controle total, inclusive governança do sistema.

**Matriz de permissões** (Admin → Cargos): configurável por cargo, salva no modelo `RolePermission`. ADMIN e PASTOR sempre têm tudo (colunas travadas). Catálogo atual:
| Permissão | Padrão | Uso |
|---|---|---|
| `EVENT_CHECKIN_CODE` | Admin+ | Ver o QR/código de check-in de eventos |
| `GROUP_CREATE` | Todos | Criar grupos de leitura |

> Observação: **resgatar na Loja é livre** para qualquer usuário com pontos; a **validação/baixa de voucher** é liberada individualmente pela flag **"Atendente"** (`canRedeem`) na aba Admin → Membros (ou para staff).

---

## 8. Gamificação (Zion Points)

Pontos são creditados por ações e registrados de forma **idempotente** no ledger `PointAward` (unique `userId+ruleKey+refId`), evitando fraude/duplicação. Os valores são **configuráveis** em Admin → Gamificação (modelo `PointRule`); os padrões do seed:

| Regra (`key`) | Categoria | Pontos |
|---|---|---|
| `SIGNUP_BONUS` | Geral | 100 (boas-vindas no cadastro) |
| `EVENT_PARTICIPATION` | Eventos | 20 (check-in de evento) |
| `SHIFT_CONFIRMATION` | Voluntariado | 50 (confirmar escala) |
| `TRAINING_COMPLETION` | Voluntariado | 150 (concluir treinamento) |
| `BIBLE_DAILY_READ` | Plano Bíblico | 15 (leitura do dia **com** foto) |
| `BIBLE_DAILY_NOPHOTO` | Plano Bíblico | 5 (leitura do dia **sem** foto) |
| `BIBLE_MILESTONE_10/20/30/45/60` | Plano Bíblico | 50 / 100 / 150 / 200 / 300 (marcos de sequência) |

Anti-farm: o `refId` do check-in de evento precisa ser o próprio evento ou uma ocorrência dele; treinamentos usam allowlist de módulos.

---

## 9. Modelo de dados

Modelos Prisma (SQLite). Resumo dos principais:

- **User** — `name, email, password(hash), role, campus, points, bibleStreak, profileImage, canRedeem, welcomed`. Relaciona-se com quase tudo.
- **Notification** — `type, title, body, refId, route, read, userId`. `route` faz o deep-link ao clicar (ex.: `membros:reading`, `voluntarios`, `links`).
- **PointAward** — ledger de pontos idempotente (`userId+ruleKey+refId`).
- **ReadingLog** — leitura por dia (`day, reference, photoUrl`; foto não é persistida por padrão), unique `userId+day`.
- **PointRule** — regras de pontuação configuráveis (`key, label, category, points, active`).
- **RolePermission** — matriz cargo × permissão (`role, permKey, allowed`).
- **Product / Redemption** — Loja: produto (nome, categoria, custo, imagem) e voucher de resgate (`code, status ATIVO/USADO, cost, productName`).
- **Event** — evento (`title, date, location, type, recurrence, checkinCode`).
- **Announcement** — comunicados (`type` GERAL/VOLUNTARIO).
- **Publication** — mural geral da comunidade.
- **Link** — pequeno grupo (`name, day, time, isOnline, locationUrl, leaderId`).
  - **LinkParticipation** (pedido/entrada), **LinkMessage** (mural, com `category`, `pollOptions`, `isPinned`), **LinkMessageReaction**, **PollVote**.
- **Area** — área de voluntariado (`name, description, leaderId`).
  - **AreaParticipation**, **Shift** (escala: `date, department, status, volunteerId`), **AreaMessage** (mural da área + enquetes), **AreaMessageReaction**, **AreaPollVote**.
- **ReadingGroup** — grupo de leitura; **GroupMember** (`status` ATIVO/PENDENTE), **GroupMessage** (`type` READING/COMMENT), **MessageReaction**.
- **BugReport** — reportes (`type` BUG/SUGESTAO, `title, description, status`).
- **PrayerRequest** — pedidos de oração (`content, status`).

O schema completo está em [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

---

## 10. Módulos e funcionalidades

### Início (`MembrosModule`)
- **Meu Engajamento**: saldo de Zion Points e sequência do plano bíblico.
- **Plano Bíblico 2026**: leitura do dia; "Ler agora" (texto ACF no app); marcar leitura (com foto = +15 / sem foto = +5), com efeito de "fogo" por marcos; compartilhar leitura + comentário nos grupos.
- **Calendário**: marca eventos confirmados e escalas.
- **Próximos eventos**: check-in por código/QR (confirma presença + credita pontos).
- **Mural da comunidade** (publicações) e **pedido de oração** (vai para a equipe de Intercessão).

### Links (`LinksModule`)
- Diretório de pequenos grupos; "Meus Links" e "Explorar".
- Solicitar entrada → o **líder aprova/recusa**.
- **Mural/Timeline** com categorias, **reações (emoji)**, **enquetes** e mensagens **fixadas**.
- Indicação de grupo online "ao vivo" no horário.

### Voluntários (`VoluntariosModule`)
- Áreas de serviço; "Minhas Áreas" e "Explorar".
- Solicitar/aprovar participação; **escalas** criadas pelo líder; **disponibilidade** semanal.
- **Mural da área** (avisos/escala/treino, com reações e enquetes).
- Área de **Intercessão**: aba de **pedidos de oração** (só para intercessores/staff) — marcar como orado.

### Loja (`RewardsModule`)
- Resgate de prêmios por Zion Points (**livre para todos**, basta ter saldo).
- Gera **voucher com QR**; o **atendente** escaneia para validar/dar baixa.

### Grupos de leitura (`GroupsPanel`)
- Competição saudável: chat, reações, convites (com aceite) e ranking semanal.

### Notificações (`App.jsx`)
- Sino no header, com **deep-link** por tipo (leva à tela/ação certa) e lembrete diário do plano.

### Admin (`AdminModule`) — abas
- **Painel** (métricas), **Links**, **Áreas**, **Eventos**, **Comunicados**, **Mural Geral**, **Loja** (CRUD de produtos + validar voucher), **Gamificação** (regras de pontos), **Membros** (cargos, flag de atendente, Modo de Teste), **Cargos** (matriz de permissões — só Admin), **Bugs** (reportes/sugestões, atualização automática).

### Recursos globais
- **Pop-up de boas-vindas** no 1º acesso.
- **Rodapé** com **Reportar Bug** e **Enviar Sugestão**.
- **Check-in de evento** e **validação de voucher** por **deep link de QR** (`?checkin=` / `?voucher=`).
- Modais fecham no **X** e clicando **fora**; responsivos (não vazam da tela).

---

## 11. Referência da API

Base: `http://<host>:3000`. Todas as rotas exigem `Authorization: Bearer <token>`, exceto as de autenticação e o seed. Legenda de acesso: 🔓 autenticado · 🛡️ admin · 👔 staff (admin/pastor) · 🎫 atendente/staff · ⭐ permissão específica.

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
| POST | `/api/users/me/welcome` | 🔓 |
| GET | `/api/permissions` · PUT `/api/permissions` | 🛡️ |
| GET | `/api/permissions/me` | 🔓 |

### Plano Bíblico / pontos
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/reading/me` · `/api/reading/text` | 🔓 |
| POST | `/api/reading/check` | 🔓 (credita pontos) |
| GET | `/api/points/mine` | 🔓 |
| POST | `/api/training/complete` | 🔓 |
| GET | `/api/me/stats` | 🔓 |

### Eventos
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/events` | 🔓 |
| POST/PUT/DELETE | `/api/events[/:id]` | 👔 |
| GET | `/api/events/:id/checkin-code` | ⭐ `EVENT_CHECKIN_CODE` |
| POST | `/api/events/:id/checkin` | 🔓 |

### Links
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/links` · `/api/links/my-participations` · `/api/links/:id/participations` · `/api/links/:id/messages` | 🔓 |
| POST | `/api/links` | 👔 · DELETE `/api/links/:id` 👔 |
| PUT | `/api/links/:id` | líder ou staff |
| POST/DELETE | `/api/links/:id/request` | 🔓 |
| PATCH | `/api/links/participations/:id` | líder ou staff |
| POST | `/api/links/:id/messages` · `/api/links/messages/:id/react` · `/vote` | 🔓 |
| DELETE/PATCH | `/api/links/messages/:id[/pin]` | autor/líder/staff |

### Áreas (voluntariado)
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/areas` · `/api/areas/my-participations` · `/api/areas/:id/participations` · `/api/areas/:id/shifts` · `/api/areas/:id/messages` | 🔓 |
| POST/PUT/DELETE | `/api/areas[/:id]` | 👔 · PATCH `/api/areas/:id/leader` 👔 |
| POST/DELETE | `/api/areas/:id/request` | 🔓 |
| PATCH | `/api/areas/participations/:id` | líder ou staff |
| POST | `/api/areas/:id/shifts` | líder ou staff |
| DELETE | `/api/shifts/:id` · PATCH `/api/shifts/:id/confirm` · GET `/api/shifts` | líder/dono/staff |
| POST | `/api/areas/:id/messages` · `/api/areas/messages/:id/react` · `/vote` | 🔓 |
| DELETE/PATCH | `/api/areas/messages/:id[/pin]` | autor/líder/staff |

### Loja
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/products` | 🔓 |
| POST/PUT/DELETE | `/api/products[/:id]` | 👔 |
| POST | `/api/products/:id/redeem` | 🔓 (resgate livre) |
| GET | `/api/redemptions/my` | 🔓 |
| GET | `/api/redemptions/validate/:code` · POST `/api/redemptions/consume` | 🎫 atendente/staff |
| PATCH | `/api/redemptions/:id/use` | 👔 |

### Grupos de leitura
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/groups` · `/api/groups/invites` · `/api/groups/:id` · `/api/groups/:id/messages` | 🔓 |
| POST | `/api/groups` | ⭐ `GROUP_CREATE` |
| POST | `/api/groups/:id/accept` · `/decline` · `/members` · `/messages` · `/messages/:msgId/react` | 🔓/membro |
| DELETE | `/api/groups/:id` · `/api/groups/:id/members/:userId` | dono/staff |

### Comunicados / mural / notificações
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/announcements` · `/api/publications` | 🔓 |
| POST/PUT/DELETE | `/api/announcements[/:id]` | 👔 |
| POST/DELETE | `/api/publications[/:id]` | autor/staff |
| GET | `/api/notifications` · PATCH `/read-all` · `/:id/read` | 🔓 |

### Oração / bugs / admin
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/prayer-requests` · `/access` | intercessor/staff |
| POST | `/api/prayer-requests` | 🔓 · PATCH `/:id` intercessor/staff |
| POST | `/api/bug-reports` | 🔓 · GET/PATCH `/api/bug-reports[/:id]` 👔 |
| GET | `/api/admin/stats` | 👔 |
| GET | `/api/point-rules` | 🔓 · POST/PUT/DELETE 👔 |
| POST | `/api/seed` | chave `x-seed-key` |

---

## 12. Banco de dados e seed

- Banco: **SQLite** em `backend/prisma/dev.db` (arquivo local; **fora do git**).
- Migrações versionadas em `backend/prisma/migrations/` (aplicar com `npx prisma migrate deploy`).
- **Seed** (`POST /api/seed` com header `x-seed-key: zion-dev-seed`): **apaga todos os dados** e recria exemplos (usuários, produtos, regras de pontos, evento, áreas, links). **Não rode após cadastrar dados reais.**
- Persistência: dados criados em runtime ficam no `dev.db` e sobrevivem a reinícios. Faça **backup** do arquivo periodicamente (é a única cópia, pois não está no git).

---

## 13. Notas de mobile e deploy

- **Testar no celular (mesma Wi-Fi)**: rode `npm run dev` (o Vite escuta na rede) e acesse pelo **IP da máquina** (ex.: `http://192.168.x.x:5173`). A URL da API é derivada automaticamente do host.
- **Virar app nativo**: opções — **PWA** (rápido, instalável pelo navegador) ou **Capacitor** (empacota o mesmo React em app Android/iOS para as lojas). Requer o backend hospedado com HTTPS/domínio.
- **Produção**: trocar `JWT_SECRET`/`SEED_KEY`, definir `CORS_ORIGIN`, migrar o SQLite para um banco hospedado (ex.: PostgreSQL) e servir front/back sob domínios com HTTPS.

---

*Documentação gerada a partir do código-fonte atual (`backend/src/server.ts`, `schema.prisma`, módulos do frontend).*
