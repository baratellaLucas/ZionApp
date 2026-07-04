import 'dotenv/config'; // carrega backend/.env (local); em produção as vars vêm do host
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { READING_PLAN as STATIC_READING_PLAN } from './readingPlan';

// Bíblia completa (Almeida Corrigida Fiel) carregada em memória para leitura no app
const BIBLE = JSON.parse(readFileSync(join(__dirname, '../data/biblia_acf.json'), 'utf-8')) as { name: string; chapters: string[][] }[];

const app = express();
const port = Number(process.env.PORT) || 3000;
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'zion-dev-secret-change-me';
const SEED_KEY = process.env.SEED_KEY || 'zion-dev-seed';
const TOKEN_TTL = '7d';

// CORS configurável: em produção defina CORS_ORIGIN (lista separada por vírgula)
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Limita tentativas em rotas sensíveis de autenticação (anti brute-force)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' } });

// Campos públicos do usuário (NUNCA expõe password)
const userPublic = {
  id: true, name: true, email: true, role: true, campus: true,
  points: true, bibleStreak: true, profileImage: true, canRedeem: true, welcomed: true, createdAt: true, updatedAt: true,
  canManageLinks: true, canManageAreas: true, canManageStore: true,
} as const;

// Hierarquia de cargos (ordem de liderança). Usada p/ liberar recursos por nível.
const ROLE_RANK: Record<string, number> = { MEMBRO: 0, VOLUNTARIO: 1, AUXILIAR_LIDER: 2, LIDER: 3, PASTOR: 4, ADMIN: 5 };
const roleRank = (role?: string) => ROLE_RANK[role || 'MEMBRO'] ?? 0;
const ALL_ROLES = ['MEMBRO', 'VOLUNTARIO', 'AUXILIAR_LIDER', 'LIDER', 'PASTOR', 'ADMIN'] as const;

// ─── Permissões por cargo (matriz configurável em Admin > Cargos) ─────────
// defaultMinRank define quem tem a permissão por padrão (cargo com rank >= mínimo).
// A matriz salva em RolePermission sobrepõe o padrão; ADMIN sempre tem tudo (anti-lockout).
const PERM_CATALOG: { key: string; label: string; description: string; category: string; defaultMinRank: number }[] = [
  // Obs.: resgate na Loja é livre (qualquer usuário com pontos) e a validação de voucher é
  // controlada pela flag "Atendente" por usuário (Admin > Membros), não pela matriz de cargos.
  { key: 'EVENT_CHECKIN_CODE',  label: 'Gerar QR de check-in de eventos', description: 'Ver o código/QR de check-in para exibir no local do evento.',        category: 'Eventos',       defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'EVENT_MANAGE',        label: 'Criar/editar/excluir eventos',    description: 'Gerenciar a agenda de eventos do app.',                              category: 'Eventos',       defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'GROUP_CREATE',        label: 'Criar grupos de leitura',         description: 'Criar novos grupos de competição do Plano Bíblico.',                 category: 'Plano Bíblico', defaultMinRank: ROLE_RANK.MEMBRO },
  { key: 'READING_PLAN_MANAGE', label: 'Editar o Plano Bíblico',          description: 'Criar/editar planos de leitura anuais (Admin > Plano Bíblico).',      category: 'Plano Bíblico', defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'READING_ADJUST',      label: 'Ajustar contagem de leitura',     description: 'Aumentar/diminuir manualmente os dias de leitura de um membro.',     category: 'Plano Bíblico', defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'ANNOUNCEMENT_MANAGE', label: 'Gerenciar comunicados globais',   description: 'Criar/editar/excluir avisos do Mural Geral.',                        category: 'Comunicação',   defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'PUBLICATION_MANAGE',  label: 'Moderar publicações do mural',    description: 'Excluir publicações de qualquer pessoa no mural do Início, além das próprias.', category: 'Comunicação',   defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'POINT_RULE_MANAGE',   label: 'Editar regras de pontuação',      description: 'Ajustar quantos Zion Points cada ação concede (Gamificação).',       category: 'Gamificação',   defaultMinRank: ROLE_RANK.PASTOR },
  { key: 'BUG_REPORT_MANAGE',   label: 'Ver e resolver bugs reportados',  description: 'Acessar a lista de bugs/sugestões enviados pelos membros.',          category: 'Sistema',       defaultMinRank: ROLE_RANK.PASTOR },
];

const hasPerm = async (role: string | undefined, permKey: string): Promise<boolean> => {
  const r = role || 'MEMBRO';
  if (r === 'ADMIN') return true; // piso: admin nunca perde acesso (anti-lockout). Pastor agora é configurável.
  const saved = await prisma.rolePermission.findUnique({ where: { role_permKey: { role: r, permKey } } });
  if (saved) return saved.allowed;
  const def = PERM_CATALOG.find(p => p.key === permKey);
  return def ? roleRank(r) >= def.defaultMinRank : false;
};

const requirePerm = (permKey: string) => (req: Request, res: Response, next: NextFunction) => {
  hasPerm(req.user?.role, permKey)
    .then(ok => ok ? next() : res.status(403).json({ error: 'Seu cargo não tem permissão para esta ação.' }))
    .catch(next);
};

// Validar/dar baixa em voucher: atendente liberado pela flag "canRedeem" (Admin > Membros) ou staff.
const canValidateVoucher = (req: Request, res: Response, next: NextFunction) => {
  if (isStaff(req)) return next();
  prisma.user.findUnique({ where: { id: req.user!.id }, select: { canRedeem: true } })
    .then(u => u?.canRedeem ? next() : res.status(403).json({ error: 'Você não tem permissão para validar vouchers. Peça à liderança para liberar seu acesso de atendente.' }))
    .catch(next);
};

// Acesso administrativo granular por módulo (Admin > Membros): permite gerenciar um módulo
// específico (Links, Áreas ou Loja) sem precisar do cargo Admin/Pastor. Staff sempre passa.
const MODULE_FLAG = { links: 'canManageLinks', areas: 'canManageAreas', store: 'canManageStore' } as const;
type ManageModule = keyof typeof MODULE_FLAG;
const hasModuleAccess = async (req: Request, moduleKey: ManageModule): Promise<boolean> => {
  if (isStaff(req)) return true;
  const field = MODULE_FLAG[moduleKey];
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { [field]: true } }) as Record<string, boolean> | null;
  return !!u?.[field];
};
const canManage = (moduleKey: ManageModule) => (req: Request, res: Response, next: NextFunction) => {
  hasModuleAccess(req, moduleKey)
    .then(ok => ok ? next() : res.status(403).json({ error: 'Você não tem acesso administrativo a este módulo.' }))
    .catch(next);
};

// ─── Equipe de Intercessão (pedidos de oração) ────────────────────────────
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const normalizeName = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
const isIntercessionArea = (name?: string | null) => { const n = normalizeName(name || ''); return n.includes('interce') || n.includes('interse'); };
// Voluntário APROVADO ou líder de alguma área de intercessão
const isIntercessor = async (userId: string) => {
  const [parts, ledAreas] = await Promise.all([
    prisma.areaParticipation.findMany({ where: { userId, status: { in: ['APROVADO', 'SAIDA_PENDENTE'] } }, include: { area: true } }),
    prisma.area.findMany({ where: { leaderId: userId } }),
  ]);
  return parts.some(p => isIntercessionArea(p.area?.name)) || ledAreas.some(a => isIntercessionArea(a.name));
};
const canViewPrayers = async (req: Request) => isStaff(req) || (!!req.user && await isIntercessor(req.user.id));

// ─── Helpers de erro / async ──────────────────────────────────────────────
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Param de rota :id sempre como string (o tipo do Express é string | string[])
const pid = (req: Request): string => String(req.params.id);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ─── Auth ──────────────────────────────────────────────────────────────────
interface AuthUser { id: string; role: string; }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser; } }
}

const signToken = (user: { id: string; role: string }) =>
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });

const auth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
};

const adminOnly = (req: Request, res: Response, next: NextFunction) =>
  req.user?.role === 'ADMIN' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });

const isAdmin = (req: Request) => req.user?.role === 'ADMIN';
// "Staff" = ADMIN ou PASTOR. O Pastor tem quase todos os acessos de admin,
// exceto ações críticas (matriz de permissões e impersonação), tratadas com adminOnly.
const isStaff = (req: Request) => req.user?.role === 'ADMIN' || req.user?.role === 'PASTOR';
const staffOnly = (req: Request, res: Response, next: NextFunction) =>
  isStaff(req) ? next() : res.status(403).json({ error: 'Acesso restrito à liderança (Admin/Pastor).' });
const FORBIDDEN = 'Você não tem permissão para esta ação.';
const TRAINING_MODULES = ['TECNICA_OPERACIONAL']; // módulos válidos (anti-farm)

// ─── Validação (Zod) ─────────────────────────────────────────────────────
const validate = (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Dados inválidos.', issues: result.error.issues });
  }
  req.body = result.data;
  next();
};

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(3) });
const resetSchema = z.object({ email: z.string().email(), password: z.string().min(3) });
const userUpdateSchema = z.object({ name: z.string().min(1).optional(), profileImage: z.string().nullable().optional() });
const roleSchema = z.object({ role: z.enum(['MEMBRO', 'VOLUNTARIO', 'AUXILIAR_LIDER', 'LIDER', 'PASTOR', 'ADMIN']) });
const redeemFlagSchema = z.object({ canRedeem: z.boolean() });
const publicationSchema = z.object({ content: z.string().min(1), imageUrl: z.string().optional(), documentUrl: z.string().optional() });
const eventSchema = z.object({ title: z.string().min(1), date: z.string().min(1), location: z.string().optional(), type: z.string().optional(), recurrence: z.enum(['NONE', 'WEEKLY', 'MONTHLY']).optional() });
const announcementSchema = z.object({ title: z.string().min(1), content: z.string().min(1), type: z.string().optional() });
const areaSchema = z.object({ name: z.string().min(1), description: z.string().optional().nullable(), leaderId: z.string().min(1), icon: z.string().optional() });
const positionSchema = z.object({ name: z.string().min(1).max(60), requiredTrainingId: z.string().optional().nullable() });
const trainingSchemaArea = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
  videoUrl: z.string().max(2000).optional().nullable(),
  imageUrl: z.string().max(5_000_000).optional().nullable(),
  linkUrl: z.string().max(2000).optional().nullable(),
});
const availabilitySchema = z.object({ weekday: z.number().int().min(0).max(6), period: z.enum(['MANHA', 'TARDE', 'NOITE']) });
const linkSchema = z.object({
  name: z.string().min(1), day: z.string().min(1), time: z.string().min(1),
  isOnline: z.boolean().optional(), locationUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(), leaderId: z.string().min(1),
});
const leaderPatchSchema = z.object({ leaderId: z.string().min(1) });
const statusSchema = z.object({ status: z.string().min(1) });
const inviteSchema = z.object({ userId: z.string().min(1) });
const bugReportSchema = z.object({ title: z.string().min(1).max(120), description: z.string().min(1).max(4000), type: z.enum(['BUG', 'SUGESTAO']).optional() });
const prayerSchema = z.object({ content: z.string().min(1).max(2000) });
const messageSchema = z.object({ content: z.string().min(1), category: z.string().optional(), pollOptions: z.array(z.string().min(1)).min(2).max(6).optional() });
const voteSchema = z.object({ optionIndex: z.number().int().min(0) });
const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional().nullable(),
  cost: z.number().int().positive(),
  imageUrl: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

// Código de voucher legível e único: ZION-XXXXXXXX
const genVoucherCode = () => `ZION-${randomBytes(4).toString('hex').toUpperCase()}`;

const pointRuleSchema = z.object({
  key: z.string().min(1).regex(/^[A-Z0-9_]+$/, 'Use apenas MAIÚSCULAS, números e _'),
  label: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional(),
  points: z.number().int().min(0),
  active: z.boolean().optional(),
});
const pointRuleUpdateSchema = pointRuleSchema.partial();

const readingCheckSchema = z.object({ photoUrl: z.string().optional(), groupIds: z.array(z.string()).optional(), comment: z.string().optional() }); // foto/comentário opcionais; groupIds = grupos p/ compartilhar
const commentSchema = z.object({ content: z.string().min(1) });
const reactSchema = z.object({ emoji: z.string().min(1).max(16) });
const shiftSchema = z.object({ date: z.string().min(1), volunteerId: z.string().optional().nullable(), department: z.string().optional(), positionId: z.string().optional().nullable() });

// Marcos de sequência do plano bíblico (dias acumulados de leitura)
const READING_MILESTONES = [10, 20, 30, 45, 60];

// ─── Plano de Leitura Bíblica: editável por ano (Admin > Plano Bíblico) ───────────────────
// Cache em memória (recarregado ao salvar/excluir um plano) — evita ida ao banco a cada request.
type ReadingPlanCacheEntry = { label: string; days: string[]; spotifyUrl: string | null };
let readingPlanCache: Record<number, ReadingPlanCacheEntry> = {};
const loadReadingPlanCache = async () => {
  const rows = await prisma.readingPlan.findMany();
  readingPlanCache = Object.fromEntries(rows.map(r => [r.year, { label: r.label, days: r.days as unknown as string[], spotifyUrl: r.spotifyUrl }]));
};
// Garante que exista um plano para o ano corrente do dataset estático embutido (primeira execução)
const ensureDefaultReadingPlan = async () => {
  const year = new Date().getFullYear();
  const existing = await prisma.readingPlan.findFirst();
  if (!existing) {
    await prisma.readingPlan.create({ data: { year, label: `Plano Bíblico ${year}`, days: STATIC_READING_PLAN, spotifyUrl: null } });
  }
  await loadReadingPlanCache();
};

const getActivePlan = (): ReadingPlanCacheEntry => {
  const year = new Date().getFullYear();
  return readingPlanCache[year] || { label: `Plano Bíblico ${year}`, days: STATIC_READING_PLAN, spotifyUrl: null };
};
const getPlanDays = () => getActivePlan().days;

// Dia do plano com base na data atual (dia do ano, 1..365)
const currentPlanDay = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  return Math.min(Math.max(day, 1), getPlanDays().length);
};

// Ordem canônica dos 66 livros (alinhada ao dataset local e ao READING_PLAN)
const BOOK_ORDER = [
  'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute',
  '1 Samuel', '2 Samuel', '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester',
  'Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cantares', 'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel',
  'Daniel', 'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu',
  'Zacarias', 'Malaquias', 'Mateus', 'Marcos', 'Lucas', 'João', 'Atos', 'Romanos', '1 Coríntios', '2 Coríntios',
  'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses', '1 Timóteo',
  '2 Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse',
];
const parseRef = (ref: string) => {
  const m = ref.match(/^(.*?)\s+(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { book: m[1], start: parseInt(m[2], 10), end: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10) };
};

// Pontos de uma regra (ativa) do banco; fallback se não existir
const rulePts = async (key: string, fallback: number) => {
  const r = await prisma.pointRule.findUnique({ where: { key } });
  return r ? (r.active ? r.points : 0) : fallback;
};
const DEFAULT_MILESTONE_BONUS: Record<number, number> = { 10: 50, 20: 100, 30: 150, 45: 200, 60: 300 };

// Credita pontos de uma ação apenas uma vez (idempotente via PointAward)
const awardPoints = async (userId: string, ruleKey: string, refId: string, fallback = 0) => {
  const points = await rulePts(ruleKey, fallback);
  try {
    // Atômico: registra o award (único) e credita os pontos juntos
    await prisma.$transaction([
      prisma.pointAward.create({ data: { userId, ruleKey, refId, points } }),
      ...(points > 0 ? [prisma.user.update({ where: { id: userId }, data: { points: { increment: points } } })] : []),
    ]);
  } catch {
    return { awarded: 0, already: true }; // já creditado antes (viola unique)
  }
  return { awarded: points, already: false };
};

// Cria notificação sem bloquear a ação principal
const notify = async (userId: string, type: string, title: string, body?: string, refId?: string, route?: string) => {
  try { await prisma.notification.create({ data: { userId, type, title, body, refId, route } }); } catch { /* silencioso */ }
};

const trainingSchema = z.object({ moduleId: z.string().min(1) });
const groupSchema = z.object({ name: z.string().min(1), description: z.string().optional().nullable() });
const memberSchema = z.object({ userId: z.string().min(1) });

// ════════════════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS (sem auth)
// ════════════════════════════════════════════════════════════════════════

// --- LOGIN ---
app.post('/api/auth/login', authLimiter, validate(loginSchema), h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });
  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });
  const { password, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
}));

// --- REGISTRO (cria conta, auto-login) ---
app.post('/api/auth/register', authLimiter, validate(registerSchema), h(async (req, res) => {
  const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (exists) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
  const hash = await bcrypt.hash(req.body.password, 10);
  const bonus = await rulePts('SIGNUP_BONUS', 100); // bônus de boas-vindas (configurável na Gamificação)
  const user = await prisma.user.create({ data: { name: req.body.name, email: req.body.email, password: hash, points: bonus } });
  const { password, ...safe } = user;
  res.status(201).json({ token: signToken(user), user: safe });
}));

// --- RESET DE SENHA (dev: sem verificação por e-mail) ---
app.post('/api/auth/reset-password', authLimiter, validate(resetSchema), h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user) return res.status(404).json({ error: 'E-mail não encontrado.' });
  const hash = await bcrypt.hash(req.body.password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  res.json({ message: 'Senha atualizada com sucesso.' });
}));

// --- SEED (protegido por chave; recria dados e hasheia senhas) ---
app.post('/api/seed', h(async (req, res) => {
  const key = req.headers['x-seed-key'] || req.query.key;
  if (key !== SEED_KEY) return res.status(403).json({ error: 'Seed protegido. Forneça x-seed-key.' });

  await prisma.notification.deleteMany();
  await prisma.bugReport.deleteMany();
  await prisma.prayerRequest.deleteMany();
  await prisma.messageReaction.deleteMany();
  await prisma.groupMessage.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.readingGroup.deleteMany();
  await prisma.pointAward.deleteMany();
  await prisma.readingLog.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.product.deleteMany();
  await prisma.pointRule.deleteMany();
  await prisma.rolePermission.deleteMany(); // matriz volta aos padrões do catálogo
  await prisma.publication.deleteMany();
  await prisma.areaParticipation.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.areaMessageReaction.deleteMany();
  await prisma.areaPollVote.deleteMany();
  await prisma.areaMessage.deleteMany();
  await prisma.area.deleteMany();
  await prisma.linkParticipation.deleteMany();
  await prisma.linkMessageReaction.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.linkMessage.deleteMany();
  await prisma.event.deleteMany();
  await prisma.link.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();

  const pass = await bcrypt.hash('123', 10);
  const adminUser = await prisma.user.create({ data: { name: "Admin Zion", email: "admin@zion.com", password: pass, role: "ADMIN", points: 5000, bibleStreak: 0, canRedeem: true, welcomed: true } });
  const liderLucas = await prisma.user.create({ data: { name: "Lucas Dias", email: "lucas@zion.com", password: pass, role: "LIDER", points: 2500, bibleStreak: 0, canRedeem: true, welcomed: true } });
  await prisma.user.create({ data: { name: "Pastor André", email: "pastor@zion.com", password: pass, role: "PASTOR", points: 3000, bibleStreak: 0, canRedeem: true, welcomed: true } });
  await prisma.user.create({ data: { name: "João Silva", email: "joao@zion.com", password: pass, role: "LIDER", points: 1200, bibleStreak: 0, canRedeem: true, welcomed: true } });

  const linkVox = await prisma.link.create({ data: { name: "Link VOX", day: "Sexta", time: "20:00", leaderId: liderLucas.id, isOnline: true } });
  await prisma.linkParticipation.create({ data: { userId: adminUser.id, linkId: linkVox.id, status: "PENDENTE" } });

  await prisma.event.create({ data: { title: "Culto de Celebração", date: new Date("2026-07-06T10:00:00Z"), location: "Campus RP", type: "GERAL", checkinCode: "ZION01" } });

  const areaKeola = await prisma.area.create({ data: { name: "Keola Coffee", description: "Servir com excelência.", leaderId: liderLucas.id } });
  await prisma.shift.create({ data: { department: "Keola Coffee", date: new Date("2026-07-06T09:00:00Z"), status: "Pendente", volunteerId: adminUser.id, areaId: areaKeola.id } });

  await prisma.publication.create({ data: { content: "Que alegria ver nossa comunidade crescer! 🙌", authorId: adminUser.id } });

  await prisma.product.createMany({ data: [
    { name: "Livro: Fundamentos da Fé", category: "Livros", description: "Best-seller da editora Zion.", cost: 800 },
    { name: "Caneca Zion Coffee", category: "Café", description: "Caneca exclusiva de cerâmica.", cost: 500 },
    { name: "Desconto 20% no Keola", category: "Descontos", description: "Vale 20% em qualquer bebida.", cost: 300 },
  ] });

  await prisma.pointRule.createMany({ data: [
    { key: "EVENT_PARTICIPATION", label: "Participar de um evento", category: "Eventos", points: 20, description: "Confirmar presença em um evento." },
    { key: "SHIFT_CONFIRMATION", label: "Confirmar escala de voluntário", category: "Voluntariado", points: 50, description: "Confirmar um turno de serviço." },
    { key: "TRAINING_COMPLETION", label: "Concluir módulo de treinamento", category: "Voluntariado", points: 150, description: "Finalizar um treinamento da trilha." },
    { key: "BIBLE_DAILY_READ", label: "Ler o capítulo do dia (com foto)", category: "Plano Bíblico", points: 15, description: "Marcar a leitura diária comprovando com foto." },
    { key: "BIBLE_DAILY_NOPHOTO", label: "Ler o capítulo do dia (sem foto)", category: "Plano Bíblico", points: 5, description: "Marcar a leitura diária sem foto de comprovação (menos pontos)." },
    { key: "BIBLE_MILESTONE_10", label: "Marco: 10 dias de leitura", category: "Plano Bíblico", points: 50, description: "Bônus ao atingir 10 dias." },
    { key: "BIBLE_MILESTONE_20", label: "Marco: 20 dias de leitura", category: "Plano Bíblico", points: 100, description: "Bônus ao atingir 20 dias." },
    { key: "BIBLE_MILESTONE_30", label: "Marco: 1 mês de leitura", category: "Plano Bíblico", points: 150, description: "Bônus ao atingir 30 dias." },
    { key: "BIBLE_MILESTONE_45", label: "Marco: 45 dias de leitura", category: "Plano Bíblico", points: 200, description: "Bônus ao atingir 45 dias." },
    { key: "BIBLE_MILESTONE_60", label: "Marco: 2 meses de leitura", category: "Plano Bíblico", points: 300, description: "Bônus ao atingir 60 dias." },
    { key: "SIGNUP_BONUS", label: "Bônus de boas-vindas", category: "Geral", points: 100, description: "Pontos creditados ao criar a conta." },
  ] });

  res.json({ message: "Seed executado com sucesso! Senha padrão: 123" });
}));

// ════════════════════════════════════════════════════════════════════════
// A PARTIR DAQUI: TUDO EXIGE AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════════════════
app.use(auth);

// --- AUTH (sessão) ---
app.get('/api/auth/me', h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: userPublic });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(user);
}));

// Impersonação (Modo de Teste) — apenas ADMIN gera token de outro usuário
app.post('/api/auth/impersonate/:id', adminOnly, h(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: pid(req) }, select: userPublic });
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ token: signToken({ id: target.id, role: target.role }), user: target });
}));

// --- USERS ---
app.get('/api/users', h(async (req, res) => res.json(await prisma.user.findMany({ select: userPublic }))));
app.get('/api/leaders', h(async (req, res) => res.json(await prisma.user.findMany({ where: { role: { in: ['LIDER', 'PASTOR', 'ADMIN'] } }, select: userPublic }))));
app.put('/api/users/:id', validate(userUpdateSchema), h(async (req, res) => {
  if (req.user!.id !== pid(req) && !isStaff(req))
    throw new HttpError(403, 'Você só pode editar o próprio perfil.');
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { name: req.body.name, profileImage: req.body.profileImage }, select: userPublic }));
}));
// Alterar cargo: staff (Admin/Pastor). Apenas ADMIN pode conceder cargos de PASTOR ou ADMIN.
app.patch('/api/users/:id/role', staffOnly, validate(roleSchema), h(async (req, res) => {
  if ((req.body.role === 'ADMIN' || req.body.role === 'PASTOR') && !isAdmin(req))
    return res.status(403).json({ error: 'Apenas administradores podem conceder o cargo de Pastor ou Administrador.' });
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { role: req.body.role }, select: userPublic }));
}));
// Liberar/bloquear resgate de prêmios para um usuário (admin)
app.patch('/api/users/:id/redeem-flag', staffOnly,validate(redeemFlagSchema), h(async (req, res) =>
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { canRedeem: req.body.canRedeem }, select: userPublic }))));
// Conceder/revogar acesso administrativo a um módulo específico (Links, Áreas ou Loja) sem
// precisar do cargo Admin/Pastor. Só staff (Admin/Pastor) concede.
const moduleAccessSchema = z.object({ module: z.enum(['links', 'areas', 'store']), value: z.boolean() });
app.patch('/api/users/:id/module-access', staffOnly, validate(moduleAccessSchema), h(async (req, res) => {
  const field = MODULE_FLAG[req.body.module as ManageModule];
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { [field]: req.body.value }, select: userPublic }));
}));
// Marca que o usuário já viu o pop-up de boas-vindas
app.post('/api/users/me/welcome', h(async (req, res) =>
  res.json(await prisma.user.update({ where: { id: req.user!.id }, data: { welcomed: true }, select: userPublic }))));

// --- REPORTAR BUG ---
app.post('/api/bug-reports', validate(bugReportSchema), h(async (req, res) =>
  res.status(201).json(await prisma.bugReport.create({ data: { title: req.body.title, description: req.body.description, type: req.body.type || 'BUG', userId: req.user!.id } }))));
app.get('/api/bug-reports', requirePerm('BUG_REPORT_MANAGE'),h(async (req, res) =>
  res.json(await prisma.bugReport.findMany({ include: { user: { select: userPublic } }, orderBy: { createdAt: 'desc' } }))));
app.patch('/api/bug-reports/:id', requirePerm('BUG_REPORT_MANAGE'),h(async (req, res) => {
  const b = await prisma.bugReport.findUnique({ where: { id: pid(req) } });
  if (!b) return res.status(404).json({ error: 'Report não encontrado.' });
  res.json(await prisma.bugReport.update({ where: { id: pid(req) }, data: { status: b.status === 'RESOLVIDO' ? 'ABERTO' : 'RESOLVIDO' } }));
}));

// --- PEDIDOS DE ORAÇÃO (equipe de Intercessão) ---
app.post('/api/prayer-requests', validate(prayerSchema), h(async (req, res) => {
  const pr = await prisma.prayerRequest.create({ data: { content: req.body.content, userId: req.user!.id } });
  // Notifica os intercessores (voluntários APROVADOS + líderes de áreas de intercessão)
  const [parts, areas, me] = await Promise.all([
    prisma.areaParticipation.findMany({ where: { status: { in: ['APROVADO', 'SAIDA_PENDENTE'] } }, include: { area: true } }),
    prisma.area.findMany(),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
  ]);
  const targets = new Set<string>();
  parts.forEach(p => { if (isIntercessionArea(p.area?.name)) targets.add(p.userId); });
  areas.forEach(a => { if (isIntercessionArea(a.name)) targets.add(a.leaderId); });
  targets.delete(req.user!.id);
  targets.forEach(uid => notify(uid, 'INFO', 'Novo pedido de oração 🙏', `${me?.name || 'Alguém'} compartilhou um motivo de oração.`, pr.id, 'voluntarios'));
  res.status(201).json(pr);
}));
app.get('/api/prayer-requests/access', h(async (req, res) => res.json({ canView: await canViewPrayers(req) })));
app.get('/api/prayer-requests', h(async (req, res) => {
  if (!(await canViewPrayers(req))) return res.status(403).json({ error: 'Restrito à equipe de intercessão.' });
  res.json(await prisma.prayerRequest.findMany({ include: { user: { select: userPublic } }, orderBy: { createdAt: 'desc' } }));
}));
app.patch('/api/prayer-requests/:id', h(async (req, res) => {
  if (!(await canViewPrayers(req))) return res.status(403).json({ error: 'Restrito à equipe de intercessão.' });
  const pr = await prisma.prayerRequest.findUnique({ where: { id: pid(req) } });
  if (!pr) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json(await prisma.prayerRequest.update({ where: { id: pid(req) }, data: { status: pr.status === 'ORADO' ? 'ATIVO' : 'ORADO' } }));
}));

// --- PERMISSÕES POR CARGO (Admin > Cargos) ---
// Matriz completa: catálogo + estado efetivo de cada cargo (padrão sobreposto pelo que foi salvo)
app.get('/api/permissions', adminOnly, h(async (req, res) => {
  const saved = await prisma.rolePermission.findMany();
  const permissions = PERM_CATALOG.map(p => {
    const matrix: Record<string, boolean> = {};
    for (const role of ALL_ROLES) {
      if (role === 'ADMIN') { matrix[role] = true; continue; } // admin sempre tem tudo (anti-lockout)
      const row = saved.find(s => s.role === role && s.permKey === p.key);
      matrix[role] = row ? row.allowed : roleRank(role) >= p.defaultMinRank;
    }
    return { key: p.key, label: p.label, description: p.description, category: p.category, matrix };
  });
  res.json({ roles: ALL_ROLES, permissions });
}));

const permissionsSchema = z.object({
  changes: z.array(z.object({
    role: z.enum(['MEMBRO', 'VOLUNTARIO', 'AUXILIAR_LIDER', 'LIDER', 'PASTOR']), // ADMIN não é editável (anti-lockout)
    permKey: z.string().min(1),
    allowed: z.boolean(),
  })).min(1).max(100),
});
app.put('/api/permissions', adminOnly, validate(permissionsSchema), h(async (req, res) => {
  const validKeys = new Set(PERM_CATALOG.map(p => p.key));
  const changes = (req.body.changes as { role: string; permKey: string; allowed: boolean }[]).filter(c => validKeys.has(c.permKey));
  await prisma.$transaction(changes.map(c => prisma.rolePermission.upsert({
    where: { role_permKey: { role: c.role, permKey: c.permKey } },
    update: { allowed: c.allowed },
    create: { role: c.role, permKey: c.permKey, allowed: c.allowed },
  })));
  res.json({ message: 'Permissões atualizadas.', applied: changes.length });
}));

// Permissões do meu cargo (para a UI habilitar/esconder ações)
app.get('/api/permissions/me', h(async (req, res) => {
  const keys: string[] = [];
  for (const p of PERM_CATALOG) if (await hasPerm(req.user?.role, p.key)) keys.push(p.key);
  res.json({ role: req.user?.role, permissions: keys });
}));

// --- MURAL DA COMUNIDADE ---
app.get('/api/publications', h(async (req, res) => res.json(await prisma.publication.findMany({ include: { author: { select: userPublic } }, orderBy: { createdAt: 'desc' } }))));
app.post('/api/publications', validate(publicationSchema), h(async (req, res) => res.status(201).json(await prisma.publication.create({ data: { content: req.body.content, imageUrl: req.body.imageUrl, documentUrl: req.body.documentUrl, authorId: req.user!.id }, include: { author: { select: userPublic } } }))));
app.delete('/api/publications/:id', h(async (req, res) => {
  const pub = await prisma.publication.findUnique({ where: { id: pid(req) } });
  if (!pub) return res.status(404).json({ error: 'Publicação não encontrada.' });
  if (pub.authorId !== req.user!.id && !isStaff(req) && !(await hasPerm(req.user?.role, 'PUBLICATION_MANAGE'))) return res.status(403).json({ error: FORBIDDEN });
  await prisma.publication.delete({ where: { id: pid(req) } });
  res.json({ message: "Deletado" });
}));

// --- EVENTOS ---
const eventPublic = { id: true, title: true, date: true, location: true, type: true, recurrence: true, createdAt: true, updatedAt: true } as const; // sem checkinCode
const genEventCode = () => randomBytes(3).toString('hex').toUpperCase(); // 6 caracteres

app.get('/api/events', h(async (req, res) => res.json(await prisma.event.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, select: eventPublic, orderBy: { date: 'asc' } }))));
app.post('/api/events', requirePerm('EVENT_MANAGE'),validate(eventSchema), h(async (req, res) => res.status(201).json(await prisma.event.create({ data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence, checkinCode: genEventCode() } }))));
app.put('/api/events/:id', requirePerm('EVENT_MANAGE'),validate(eventSchema), h(async (req, res) => res.json(await prisma.event.update({ where: { id: pid(req) }, data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence } }))));
app.delete('/api/events/:id', requirePerm('EVENT_MANAGE'),h(async (req, res) => { await prisma.event.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));

// Código de check-in (só admin — para exibir o QR)
app.get('/api/events/:id/checkin-code', requirePerm('EVENT_CHECKIN_CODE'), h(async (req, res) => {
  const ev = await prisma.event.findUnique({ where: { id: pid(req) } });
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });
  let code = ev.checkinCode;
  if (!code) { code = genEventCode(); await prisma.event.update({ where: { id: ev.id }, data: { checkinCode: code } }); } // gera se legado sem código
  res.json({ code });
}));

// Check-in por código (membro) — valida e credita presença uma vez
app.post('/api/events/:id/checkin', h(async (req, res) => {
  const ev = await prisma.event.findUnique({ where: { id: pid(req) } });
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!ev.checkinCode || code !== ev.checkinCode) return res.status(400).json({ error: 'Código de check-in inválido.' });
  // refId deve ser o evento ou uma ocorrência dele (anti-farm)
  const refId = String(req.body.refId || ev.id);
  if (refId !== ev.id && !refId.startsWith(`${ev.id}@`)) return res.status(400).json({ error: 'Referência de evento inválida.' });
  await prisma.eventParticipation.upsert({
    where: { userId_refId: { userId: req.user!.id, refId } },
    update: { checkedInAt: new Date() },
    create: { userId: req.user!.id, eventId: ev.id, refId, checkedInAt: new Date() },
  });
  const award = await awardPoints(req.user!.id, 'EVENT_PARTICIPATION', refId, 20);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: userPublic });
  res.status(201).json({ awarded: award.awarded, already: award.already, points: user?.points, refId });
}));

// Confirmar participação (RSVP, sem código) — marca presença no calendário e credita pontos
// RSVP: só marca presença pretendida no calendário — pontos só são dados no check-in real
app.post('/api/events/:id/participate', h(async (req, res) => {
  const ev = await prisma.event.findUnique({ where: { id: pid(req) } });
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });
  const refId = String(req.body.refId || ev.id); // evento ou ocorrência dele (anti-farm)
  if (refId !== ev.id && !refId.startsWith(`${ev.id}@`)) return res.status(400).json({ error: 'Referência de evento inválida.' });
  const existing = await prisma.eventParticipation.findUnique({ where: { userId_refId: { userId: req.user!.id, refId } } });
  await prisma.eventParticipation.upsert({
    where: { userId_refId: { userId: req.user!.id, refId } },
    update: {},
    create: { userId: req.user!.id, eventId: ev.id, refId },
  });
  res.status(201).json({ already: !!existing, refId });
}));

// Minhas confirmações (RSVP e check-in) — usado para alternar o botão Participar/Check-in
app.get('/api/events/my-participations', h(async (req, res) => res.json(await prisma.eventParticipation.findMany({ where: { userId: req.user!.id }, select: { refId: true, rsvpAt: true, checkedInAt: true } }))));

// Admin: quantos confirmaram presença (RSVP) vs quantos fizeram check-in de fato, por evento
app.get('/api/events/stats', staffOnly, h(async (req, res) => {
  const rows = await prisma.eventParticipation.findMany({ select: { eventId: true, checkedInAt: true } });
  const map: Record<string, { eventId: string; rsvpCount: number; checkinCount: number }> = {};
  for (const r of rows) {
    if (!map[r.eventId]) map[r.eventId] = { eventId: r.eventId, rsvpCount: 0, checkinCount: 0 };
    map[r.eventId].rsvpCount++;
    if (r.checkedInAt) map[r.eventId].checkinCount++;
  }
  res.json(Object.values(map));
}));

// --- COMUNICADOS ---
app.get('/api/announcements', h(async (req, res) => res.json(await prisma.announcement.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { createdAt: 'desc' } }))));
app.post('/api/announcements', requirePerm('ANNOUNCEMENT_MANAGE'),validate(announcementSchema), h(async (req, res) => res.status(201).json(await prisma.announcement.create({ data: req.body }))));
app.put('/api/announcements/:id', requirePerm('ANNOUNCEMENT_MANAGE'),validate(announcementSchema), h(async (req, res) => res.json(await prisma.announcement.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/announcements/:id', requirePerm('ANNOUNCEMENT_MANAGE'),h(async (req, res) => { await prisma.announcement.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));

// --- ÁREAS (VOLUNTARIADO) ---
app.get('/api/areas', h(async (req, res) => {
  const areas = await prisma.area.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: { in: ['APROVADO', 'SAIDA_PENDENTE'] } } } } });
  res.json(areas.map(a => ({ ...a, approvedCount: a.participations.length, participations: undefined })));
}));
app.post('/api/areas', canManage('areas'),validate(areaSchema), h(async (req, res) => res.status(201).json(await prisma.area.create({ data: req.body, include: { leader: { select: userPublic } } }))));
app.put('/api/areas/:id', canManage('areas'),validate(areaSchema), h(async (req, res) => res.json(await prisma.area.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } }))));
app.delete('/api/areas/:id', canManage('areas'),h(async (req, res) => { await prisma.area.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));
app.patch('/api/areas/:id/leader', canManage('areas'),validate(leaderPatchSchema), h(async (req, res) => res.json(await prisma.area.update({ where: { id: pid(req) }, data: { leaderId: req.body.leaderId } }))));

// Participações e Escalas (userId vem do token)
app.get('/api/areas/my-participations', h(async (req, res) => res.json(await prisma.areaParticipation.findMany({ where: { userId: req.user!.id }, include: { area: { include: { leader: { select: userPublic } } } } }))));
app.post('/api/areas/:id/request', h(async (req, res) => {
  try {
    const part = await prisma.areaParticipation.create({ data: { userId: req.user!.id, areaId: pid(req), status: 'PENDENTE' } });
    const [area, me] = await Promise.all([
      prisma.area.findUnique({ where: { id: pid(req) } }),
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
    ]);
    if (area) notify(area.leaderId, 'REQUEST', 'Nova solicitação de voluntário', `${me?.name || 'Alguém'} pediu para servir na área "${area.name}".`, area.id, 'voluntarios');
    res.status(201).json(part);
  } catch { res.status(409).json({ error: 'Você já solicitou participação nesta área.' }); }
}));
app.delete('/api/areas/:id/request', h(async (req, res) => {
  const areaId = pid(req);
  const part = await prisma.areaParticipation.findUnique({ where: { userId_areaId: { userId: req.user!.id, areaId } } });
  if (!part) return res.json({ message: "Cancelado" });
  if (part.status === 'APROVADO') {
    // Sair de uma área aprovada vira um pedido — o líder precisa aprovar a saída
    const updated = await prisma.areaParticipation.update({ where: { id: part.id }, data: { status: 'SAIDA_PENDENTE' } });
    const area = await prisma.area.findUnique({ where: { id: areaId } });
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    if (area) notify(area.leaderId, 'REQUEST', 'Pedido de saída', `${me?.name || 'Um voluntário'} pediu para sair da área "${area.name}".`, area.id, 'voluntarios');
    return res.json(updated);
  }
  await prisma.areaParticipation.deleteMany({ where: { userId: req.user!.id, areaId } });
  res.json({ message: "Cancelado" });
}));
app.get('/api/areas/:id/participations', h(async (req, res) => res.json(await prisma.areaParticipation.findMany({ where: { areaId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } }))));

// Líder convida um membro (fica CONVITE_PENDENTE até o convidado aceitar/recusar)
app.post('/api/areas/:id/invite', validate(inviteSchema), h(async (req, res) => {
  const area = await prisma.area.findUnique({ where: { id: pid(req) } });
  if (!area) return res.status(404).json({ error: 'Área não encontrada.' });
  if (area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode convidar membros.' });
  try {
    const part = await prisma.areaParticipation.create({ data: { userId: req.body.userId, areaId: area.id, status: 'CONVITE_PENDENTE' } });
    notify(req.body.userId, 'INVITE', 'Convite para servir', `Você foi convidado para servir na área "${area.name}".`, area.id, 'voluntarios');
    res.status(201).json(part);
  } catch { res.status(409).json({ error: 'Essa pessoa já participa ou já tem uma solicitação/convite pendente.' }); }
}));
app.post('/api/areas/:id/invite/accept', h(async (req, res) => {
  const m = await prisma.areaParticipation.findUnique({ where: { userId_areaId: { userId: req.user!.id, areaId: pid(req) } } });
  if (!m || m.status !== 'CONVITE_PENDENTE') return res.status(404).json({ error: 'Convite não encontrado.' });
  const [updated, me] = await Promise.all([
    prisma.areaParticipation.update({ where: { id: m.id }, data: { status: 'APROVADO' }, include: { area: true } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
  ]);
  notify(updated.area.leaderId, 'INFO', 'Convite aceito', `${me?.name || 'Alguém'} aceitou o convite para a área "${updated.area.name}".`, updated.area.id, 'voluntarios');
  res.json({ message: 'Você entrou!' });
}));
app.post('/api/areas/:id/invite/decline', h(async (req, res) => {
  await prisma.areaParticipation.deleteMany({ where: { userId: req.user!.id, areaId: pid(req), status: 'CONVITE_PENDENTE' } });
  res.json({ message: 'Convite recusado.' });
}));
app.patch('/api/areas/participations/:id', validate(statusSchema), h(async (req, res) => {
  const part = await prisma.areaParticipation.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!part) return res.status(404).json({ error: 'Participação não encontrada.' });
  if (part.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode aprovar/recusar.' });
  if (part.status === 'SAIDA_PENDENTE') {
    if (req.body.status === 'APROVADO') {
      await prisma.areaParticipation.delete({ where: { id: pid(req) } });
      notify(part.userId, 'INFO', 'Saída confirmada', `Sua saída da área "${part.area.name}" foi confirmada pelo líder.`, part.area.id, 'voluntarios');
      return res.json({ message: 'Removido' });
    }
    const reverted = await prisma.areaParticipation.update({ where: { id: pid(req) }, data: { status: 'APROVADO' }, include: { user: { select: userPublic } } });
    notify(part.userId, 'INFO', 'Permanência na área', `Seu pedido de saída da área "${part.area.name}" foi recusado — você continua na equipe.`, part.area.id, 'voluntarios');
    return res.json(reverted);
  }
  const updated = await prisma.areaParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } });
  const aprovado = req.body.status === 'APROVADO';
  notify(part.userId, aprovado ? 'APPROVED' : 'REJECTED', aprovado ? 'Voluntariado aprovado!' : 'Solicitação recusada', `Sua entrada na área "${part.area.name}" foi ${aprovado ? 'aprovada' : 'recusada'}.`, part.area.id, 'voluntarios');
  res.json(updated);
}));

// Líder/admin cria turno na área (escala real)
app.post('/api/areas/:id/shifts', validate(shiftSchema), h(async (req, res) => {
  const area = await prisma.area.findUnique({ where: { id: pid(req) } });
  if (!area) return res.status(404).json({ error: 'Área não encontrada.' });
  if (area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode criar escalas.' });
  const when = new Date(req.body.date);
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Data inválida.' });
  // Se a posição exige treinamento, o voluntário escolhido precisa já ter concluído
  if (req.body.positionId && req.body.volunteerId) {
    const position = await prisma.areaPosition.findUnique({ where: { id: req.body.positionId }, include: { requiredTraining: true } });
    if (position?.requiredTrainingId) {
      const done = await prisma.areaTrainingCompletion.findUnique({ where: { trainingId_userId: { trainingId: position.requiredTrainingId, userId: req.body.volunteerId } } });
      if (!done) return res.status(400).json({ error: `Este voluntário ainda não concluiu o treinamento "${position.requiredTraining?.title}", exigido para a posição "${position.name}".` });
    }
  }
  const shift = await prisma.shift.create({ data: { areaId: area.id, department: area.name, date: when, volunteerId: req.body.volunteerId || null, positionId: req.body.positionId || null, status: 'Pendente' }, include: { user: { select: userPublic }, position: true } });
  if (req.body.volunteerId) notify(req.body.volunteerId, 'INFO', 'Você foi escalado', `Nova escala em "${area.name}" para ${new Date(req.body.date).toLocaleDateString('pt-BR')}. Confirme sua presença!`, area.id, 'voluntarios:escala');
  res.status(201).json(shift);
}));

// Lista turnos de uma área
app.get('/api/areas/:id/shifts', h(async (req, res) => res.json(await prisma.shift.findMany({ where: { areaId: pid(req) }, include: { user: { select: userPublic }, position: true }, orderBy: { date: 'asc' } }))));

// --- POSIÇÕES DA ÁREA (ex.: Balcão, Forno, Barista) — criadas só pelo líder/staff ---
app.get('/api/areas/:id/positions', h(async (req, res) => res.json(await prisma.areaPosition.findMany({ where: { areaId: pid(req) }, include: { requiredTraining: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }))));
app.post('/api/areas/:id/positions', validate(positionSchema), h(async (req, res) => {
  const area = await prisma.area.findUnique({ where: { id: pid(req) } });
  if (!area) return res.status(404).json({ error: 'Área não encontrada.' });
  if (area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode criar posições.' });
  const count = await prisma.areaPosition.count({ where: { areaId: area.id } });
  try {
    const position = await prisma.areaPosition.create({ data: { areaId: area.id, name: req.body.name, order: count, requiredTrainingId: req.body.requiredTrainingId || null }, include: { requiredTraining: true } });
    res.status(201).json(position);
  } catch { res.status(409).json({ error: 'Já existe uma posição com esse nome nesta área.' }); }
}));
app.put('/api/areas/positions/:id', validate(positionSchema), h(async (req, res) => {
  const position = await prisma.areaPosition.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!position) return res.status(404).json({ error: 'Posição não encontrada.' });
  if (position.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode editar posições.' });
  const updated = await prisma.areaPosition.update({ where: { id: pid(req) }, data: { name: req.body.name, requiredTrainingId: req.body.requiredTrainingId || null }, include: { requiredTraining: true } });
  res.json(updated);
}));
app.delete('/api/areas/positions/:id', h(async (req, res) => {
  const position = await prisma.areaPosition.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!position) return res.status(404).json({ error: 'Posição não encontrada.' });
  if (position.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode remover posições.' });
  await prisma.areaPosition.delete({ where: { id: pid(req) } });
  res.json({ message: 'Removido' });
}));

// --- TREINAMENTOS DA ÁREA (módulos: vídeo, foto, link) — criados só pelo líder/staff ---
app.get('/api/areas/:id/trainings', h(async (req, res) => {
  const areaId = pid(req);
  const [trainings, myCompletions] = await Promise.all([
    prisma.areaTraining.findMany({ where: { areaId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.areaTrainingCompletion.findMany({ where: { userId: req.user!.id, training: { areaId } }, select: { trainingId: true } }),
  ]);
  const doneIds = new Set(myCompletions.map(c => c.trainingId));
  res.json(trainings.map(t => ({ ...t, completedByMe: doneIds.has(t.id) })));
}));
app.post('/api/areas/:id/trainings', validate(trainingSchemaArea), h(async (req, res) => {
  const area = await prisma.area.findUnique({ where: { id: pid(req) } });
  if (!area) return res.status(404).json({ error: 'Área não encontrada.' });
  if (area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode criar treinamentos.' });
  const count = await prisma.areaTraining.count({ where: { areaId: area.id } });
  const training = await prisma.areaTraining.create({ data: { areaId: area.id, order: count, ...req.body } });
  res.status(201).json({ ...training, completedByMe: false });
}));
app.put('/api/areas/trainings/:id', validate(trainingSchemaArea), h(async (req, res) => {
  const training = await prisma.areaTraining.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!training) return res.status(404).json({ error: 'Treinamento não encontrado.' });
  if (training.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode editar treinamentos.' });
  const updated = await prisma.areaTraining.update({ where: { id: pid(req) }, data: req.body });
  res.json(updated);
}));
app.delete('/api/areas/trainings/:id', h(async (req, res) => {
  const training = await prisma.areaTraining.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!training) return res.status(404).json({ error: 'Treinamento não encontrado.' });
  if (training.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode remover treinamentos.' });
  await prisma.areaTraining.delete({ where: { id: pid(req) } });
  res.json({ message: 'Removido' });
}));
// Concluir um treinamento (voluntário aprovado da área) — idempotente, credita pontos uma vez
app.post('/api/areas/trainings/:id/complete', h(async (req, res) => {
  const training = await prisma.areaTraining.findUnique({ where: { id: pid(req) } });
  if (!training) return res.status(404).json({ error: 'Treinamento não encontrado.' });
  const isLeaderOrStaff = training.areaId ? (await prisma.area.findUnique({ where: { id: training.areaId } }))?.leaderId === req.user!.id || await hasModuleAccess(req, 'areas') : false;
  if (!isLeaderOrStaff) {
    const part = await prisma.areaParticipation.findUnique({ where: { userId_areaId: { userId: req.user!.id, areaId: training.areaId } } });
    if (!part || (part.status !== 'APROVADO' && part.status !== 'SAIDA_PENDENTE')) return res.status(403).json({ error: 'Apenas voluntários aprovados podem concluir treinamentos.' });
  }
  try {
    await prisma.areaTrainingCompletion.create({ data: { trainingId: training.id, userId: req.user!.id } });
  } catch { /* já concluído — idempotente */ }
  const award = await awardPoints(req.user!.id, 'TRAINING_COMPLETION', training.id, 50);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: userPublic });
  res.json({ awarded: award.awarded, already: award.already, points: user?.points });
}));
// Quem já concluiu um treinamento (líder/staff — para saber quem pode ser escalado numa posição)
app.get('/api/areas/trainings/:id/completions', h(async (req, res) => {
  const training = await prisma.areaTraining.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!training) return res.status(404).json({ error: 'Treinamento não encontrado.' });
  if (training.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode ver quem concluiu.' });
  const rows = await prisma.areaTrainingCompletion.findMany({ where: { trainingId: pid(req) }, select: { userId: true } });
  res.json(rows.map(r => r.userId));
}));

// --- DISPONIBILIDADE SEMANAL (dia + período) do voluntário para uma área ---
// Marca/desmarca (toggle) — só quem é participante aprovado da área ou o líder/staff.
app.post('/api/areas/:id/availability', validate(availabilitySchema), h(async (req, res) => {
  const areaId = pid(req);
  const isLeaderOrStaff = (await prisma.area.findUnique({ where: { id: areaId } }))?.leaderId === req.user!.id || await hasModuleAccess(req, 'areas');
  if (!isLeaderOrStaff) {
    const part = await prisma.areaParticipation.findUnique({ where: { userId_areaId: { userId: req.user!.id, areaId } } });
    if (!part || (part.status !== 'APROVADO' && part.status !== 'SAIDA_PENDENTE')) return res.status(403).json({ error: 'Apenas voluntários aprovados podem marcar disponibilidade.' });
  }
  const existing = await prisma.availability.findUnique({ where: { userId_areaId_weekday_period: { userId: req.user!.id, areaId, weekday: req.body.weekday, period: req.body.period } } });
  if (existing) { await prisma.availability.delete({ where: { id: existing.id } }); return res.json({ toggled: 'removed' }); }
  await prisma.availability.create({ data: { userId: req.user!.id, areaId, weekday: req.body.weekday, period: req.body.period } });
  res.json({ toggled: 'added' });
}));
// Minha disponibilidade nesta área
app.get('/api/areas/:id/availability/mine', h(async (req, res) => res.json(await prisma.availability.findMany({ where: { areaId: pid(req), userId: req.user!.id } }))));
// Disponibilidade de todos os voluntários aprovados da área (líder/staff) — filtro opcional por dia/período
app.get('/api/areas/:id/availability', h(async (req, res) => {
  const areaId = pid(req);
  const area = await prisma.area.findUnique({ where: { id: areaId } });
  if (!area) return res.status(404).json({ error: 'Área não encontrada.' });
  if (area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder da área pode ver a disponibilidade da equipe.' });
  const where: Record<string, unknown> = { areaId };
  if (req.query.weekday !== undefined) where.weekday = Number(req.query.weekday);
  if (req.query.period) where.period = String(req.query.period);
  const rows = await prisma.availability.findMany({ where, include: { user: { select: userPublic } } });
  res.json(rows);
}));

// Remove turno (líder da área/admin)
app.delete('/api/shifts/:id', h(async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!shift) return res.status(404).json({ error: 'Escala não encontrada.' });
  if (shift.area && shift.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Sem permissão.' });
  await prisma.shift.delete({ where: { id: pid(req) } });
  res.json({ message: 'Removido' });
}));

// Minhas escalas + vagas em aberto das áreas onde sou voluntário aprovado (até alguém aceitar)
app.get('/api/shifts', h(async (req, res) => {
  const myAreaIds = (await prisma.areaParticipation.findMany({ where: { userId: req.user!.id, status: { in: ['APROVADO', 'SAIDA_PENDENTE'] } }, select: { areaId: true } })).map(p => p.areaId);
  const shifts = await prisma.shift.findMany({
    where: { OR: [{ volunteerId: req.user!.id }, { areaId: { in: myAreaIds }, volunteerId: null }] },
    include: { area: true, position: true },
    orderBy: { date: 'asc' },
  });
  res.json(shifts);
}));
app.patch('/api/shifts/:id/confirm', h(async (req, res) => {
  const current = await prisma.shift.findUnique({ where: { id: pid(req) } });
  if (!current) return res.status(404).json({ error: 'Escala não encontrada.' });
  if (current.volunteerId !== req.user!.id && !isStaff(req)) return res.status(403).json({ error: 'Você só pode confirmar a sua própria escala.' });
  const shift = await prisma.shift.update({ where: { id: pid(req) }, data: { status: 'Confirmado' } });
  const award = await awardPoints(req.user!.id, 'SHIFT_CONFIRMATION', shift.id, 50);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: userPublic });
  res.json({ shift, awarded: award.awarded, points: user?.points });
}));
// Aceitar uma vaga em aberto (volunteerId null) — some da lista de "abertas" assim que alguém aceita
app.patch('/api/shifts/:id/claim', h(async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: pid(req) }, include: { position: { include: { requiredTraining: true } } } });
  if (!shift) return res.status(404).json({ error: 'Escala não encontrada.' });
  if (shift.areaId) {
    const part = await prisma.areaParticipation.findUnique({ where: { userId_areaId: { userId: req.user!.id, areaId: shift.areaId } } });
    if (!part || (part.status !== 'APROVADO' && part.status !== 'SAIDA_PENDENTE')) return res.status(403).json({ error: 'Apenas voluntários aprovados da área podem aceitar esta vaga.' });
  }
  if (shift.position?.requiredTrainingId) {
    const done = await prisma.areaTrainingCompletion.findUnique({ where: { trainingId_userId: { trainingId: shift.position.requiredTrainingId, userId: req.user!.id } } });
    if (!done) return res.status(400).json({ error: `Você precisa concluir o treinamento "${shift.position.requiredTraining?.title}" antes de aceitar esta vaga.` });
  }
  const result = await prisma.shift.updateMany({ where: { id: pid(req), volunteerId: null }, data: { volunteerId: req.user!.id, status: 'Confirmado' } });
  if (result.count === 0) return res.status(409).json({ error: 'Esta vaga já foi ocupada.' });
  const updated = await prisma.shift.findUnique({ where: { id: pid(req) }, include: { area: true, position: true, user: { select: userPublic } } });
  res.json(updated);
}));

// --- MURAL DA ÁREA (mesma lógica do mural de Links) ---
app.get('/api/areas/:id/messages', h(async (req, res) => {
  const messages = await prisma.areaMessage.findMany({ where: { areaId: pid(req) }, include: { author: { select: userPublic }, reactions: true, votes: true }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] });
  const me = req.user!.id;
  res.json(messages.map(m => {
    const byEmoji: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    for (const r of m.reactions) {
      byEmoji[r.emoji] = byEmoji[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
      byEmoji[r.emoji].count++;
      if (r.userId === me) byEmoji[r.emoji].mine = true;
    }
    let poll = null;
    if (m.pollOptions) {
      const opts: string[] = JSON.parse(m.pollOptions);
      const counts = opts.map(() => 0);
      let myVote: number | null = null;
      for (const v of m.votes) {
        if (v.optionIndex >= 0 && v.optionIndex < counts.length) counts[v.optionIndex]++;
        if (v.userId === me) myVote = v.optionIndex;
      }
      poll = { options: opts.map((text, i) => ({ text, count: counts[i] })), totalVotes: m.votes.length, myVote };
    }
    const { reactions, votes, pollOptions, ...rest } = m;
    return { ...rest, reactions: Object.values(byEmoji), poll };
  }));
}));
app.post('/api/areas/:id/messages', validate(messageSchema), h(async (req, res) => res.status(201).json(await prisma.areaMessage.create({ data: { content: req.body.content, category: req.body.category, areaId: pid(req), authorId: req.user!.id, pollOptions: req.body.pollOptions ? JSON.stringify(req.body.pollOptions) : null }, include: { author: { select: userPublic } } }))));
app.delete('/api/areas/messages/:id', h(async (req, res) => {
  const msg = await prisma.areaMessage.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.authorId !== req.user!.id && msg.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: FORBIDDEN });
  await prisma.areaMessage.delete({ where: { id: pid(req) } });
  res.json({ message: "Deletado" });
}));
app.patch('/api/areas/messages/:id/pin', h(async (req, res) => {
  const msg = await prisma.areaMessage.findUnique({ where: { id: pid(req) }, include: { area: true } });
  if (!msg) return res.status(404).json({ error: "Mensagem não encontrada" });
  if (msg.area.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'areas'))) return res.status(403).json({ error: 'Apenas o líder pode fixar mensagens.' });
  res.json(await prisma.areaMessage.update({ where: { id: pid(req) }, data: { isPinned: !msg.isPinned }, include: { author: { select: userPublic } } }));
}));
app.post('/api/areas/messages/:id/react', validate(reactSchema), h(async (req, res) => {
  const msg = await prisma.areaMessage.findUnique({ where: { id: pid(req) } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  const existing = await prisma.areaMessageReaction.findUnique({ where: { messageId_userId_emoji: { messageId: pid(req), userId: req.user!.id, emoji: req.body.emoji } } });
  if (existing) { await prisma.areaMessageReaction.delete({ where: { id: existing.id } }); return res.json({ toggled: 'removed' }); }
  await prisma.areaMessageReaction.create({ data: { messageId: pid(req), userId: req.user!.id, emoji: req.body.emoji } });
  res.json({ toggled: 'added' });
}));
app.post('/api/areas/messages/:id/vote', validate(voteSchema), h(async (req, res) => {
  const msg = await prisma.areaMessage.findUnique({ where: { id: pid(req) } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (!msg.pollOptions) return res.status(400).json({ error: 'Esta mensagem não é uma enquete.' });
  const opts: string[] = JSON.parse(msg.pollOptions);
  if (req.body.optionIndex >= opts.length) return res.status(400).json({ error: 'Opção inválida.' });
  await prisma.areaPollVote.upsert({ where: { messageId_userId: { messageId: pid(req), userId: req.user!.id } }, update: { optionIndex: req.body.optionIndex }, create: { messageId: pid(req), userId: req.user!.id, optionIndex: req.body.optionIndex } });
  res.json({ message: 'Voto registrado.' });
}));

// --- LINKS ---
app.get('/api/links', h(async (req, res) => {
  const links = await prisma.link.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: 'APROVADO' } } } });
  res.json(links.map(l => ({ ...l, approvedCount: l.participations.length, participations: undefined })));
}));
app.post('/api/links', canManage('links'),validate(linkSchema), h(async (req, res) => res.status(201).json(await prisma.link.create({ data: req.body, include: { leader: { select: userPublic } } }))));
app.put('/api/links/:id', validate(linkSchema), h(async (req, res) => {
  const link = await prisma.link.findUnique({ where: { id: pid(req) } });
  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });
  if (link.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'links'))) return res.status(403).json({ error: 'Apenas o líder pode editar este Link.' });
  res.json(await prisma.link.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } }));
}));
app.delete('/api/links/:id', canManage('links'),h(async (req, res) => { await prisma.link.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));
app.get('/api/links/my-participations', h(async (req, res) => res.json(await prisma.linkParticipation.findMany({ where: { userId: req.user!.id }, include: { link: { include: { leader: { select: userPublic } } } } }))));
app.post('/api/links/:id/request', h(async (req, res) => {
  try {
    const part = await prisma.linkParticipation.create({ data: { userId: req.user!.id, linkId: pid(req), status: 'PENDENTE' } });
    const [link, me] = await Promise.all([
      prisma.link.findUnique({ where: { id: pid(req) } }),
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
    ]);
    if (link) notify(link.leaderId, 'REQUEST', 'Nova solicitação de entrada', `${me?.name || 'Alguém'} pediu para entrar no Link "${link.name}".`, link.id, 'links');
    res.status(201).json(part);
  } catch { res.status(409).json({ error: 'Você já solicitou participação neste Link.' }); }
}));
app.delete('/api/links/:id/request', h(async (req, res) => { await prisma.linkParticipation.deleteMany({ where: { userId: req.user!.id, linkId: pid(req) } }); res.json({ message: "Cancelado" }); }));
app.get('/api/links/:id/participations', h(async (req, res) => res.json(await prisma.linkParticipation.findMany({ where: { linkId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } }))));

// Líder convida um membro (fica CONVITE_PENDENTE até o convidado aceitar/recusar)
app.post('/api/links/:id/invite', validate(inviteSchema), h(async (req, res) => {
  const link = await prisma.link.findUnique({ where: { id: pid(req) } });
  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });
  if (link.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'links'))) return res.status(403).json({ error: 'Apenas o líder do Link pode convidar membros.' });
  try {
    const part = await prisma.linkParticipation.create({ data: { userId: req.body.userId, linkId: link.id, status: 'CONVITE_PENDENTE' } });
    notify(req.body.userId, 'INVITE', 'Convite para participar', `Você foi convidado para participar do Link "${link.name}".`, link.id, 'links');
    res.status(201).json(part);
  } catch { res.status(409).json({ error: 'Essa pessoa já participa ou já tem uma solicitação/convite pendente.' }); }
}));
app.post('/api/links/:id/invite/accept', h(async (req, res) => {
  const m = await prisma.linkParticipation.findUnique({ where: { userId_linkId: { userId: req.user!.id, linkId: pid(req) } } });
  if (!m || m.status !== 'CONVITE_PENDENTE') return res.status(404).json({ error: 'Convite não encontrado.' });
  const [updated, me] = await Promise.all([
    prisma.linkParticipation.update({ where: { id: m.id }, data: { status: 'APROVADO' }, include: { link: true } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
  ]);
  notify(updated.link.leaderId, 'INFO', 'Convite aceito', `${me?.name || 'Alguém'} aceitou o convite para o Link "${updated.link.name}".`, updated.link.id, 'links');
  res.json({ message: 'Você entrou!' });
}));
app.post('/api/links/:id/invite/decline', h(async (req, res) => {
  await prisma.linkParticipation.deleteMany({ where: { userId: req.user!.id, linkId: pid(req), status: 'CONVITE_PENDENTE' } });
  res.json({ message: 'Convite recusado.' });
}));
app.patch('/api/links/participations/:id', validate(statusSchema), h(async (req, res) => {
  const part = await prisma.linkParticipation.findUnique({ where: { id: pid(req) }, include: { link: true } });
  if (!part) return res.status(404).json({ error: 'Participação não encontrada.' });
  if (part.link.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'links'))) return res.status(403).json({ error: 'Apenas o líder do Link pode aprovar/recusar.' });
  const updated = await prisma.linkParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } });
  const aprovado = req.body.status === 'APROVADO';
  notify(part.userId, aprovado ? 'APPROVED' : 'REJECTED', aprovado ? 'Entrada aprovada!' : 'Solicitação recusada', `Sua entrada no Link "${part.link.name}" foi ${aprovado ? 'aprovada' : 'recusada'}.`, part.link.id, 'links');
  res.json(updated);
}));

app.get('/api/links/:id/messages', h(async (req, res) => {
  const messages = await prisma.linkMessage.findMany({ where: { linkId: pid(req) }, include: { author: { select: userPublic }, reactions: true, votes: true }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] });
  const me = req.user!.id;
  res.json(messages.map(m => {
    const byEmoji: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    for (const r of m.reactions) {
      byEmoji[r.emoji] = byEmoji[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
      byEmoji[r.emoji].count++;
      if (r.userId === me) byEmoji[r.emoji].mine = true;
    }
    let poll = null;
    if (m.pollOptions) {
      const opts: string[] = JSON.parse(m.pollOptions);
      const counts = opts.map(() => 0);
      let myVote: number | null = null;
      for (const v of m.votes) {
        if (v.optionIndex >= 0 && v.optionIndex < counts.length) counts[v.optionIndex]++;
        if (v.userId === me) myVote = v.optionIndex;
      }
      poll = { options: opts.map((text, i) => ({ text, count: counts[i] })), totalVotes: m.votes.length, myVote };
    }
    const { reactions, votes, pollOptions, ...rest } = m;
    return { ...rest, reactions: Object.values(byEmoji), poll };
  }));
}));
app.post('/api/links/:id/messages', validate(messageSchema), h(async (req, res) => res.status(201).json(await prisma.linkMessage.create({ data: { content: req.body.content, category: req.body.category, linkId: pid(req), authorId: req.user!.id, pollOptions: req.body.pollOptions ? JSON.stringify(req.body.pollOptions) : null }, include: { author: { select: userPublic } } }))));
app.delete('/api/links/messages/:id', h(async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: pid(req) }, include: { link: true } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.authorId !== req.user!.id && msg.link.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'links'))) return res.status(403).json({ error: FORBIDDEN });
  await prisma.linkMessage.delete({ where: { id: pid(req) } });
  res.json({ message: "Deletado" });
}));
app.patch('/api/links/messages/:id/pin', h(async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: pid(req) }, include: { link: true } });
  if (!msg) return res.status(404).json({ error: "Mensagem não encontrada" });
  if (msg.link.leaderId !== req.user!.id && !(await hasModuleAccess(req, 'links'))) return res.status(403).json({ error: 'Apenas o líder pode fixar mensagens.' });
  res.json(await prisma.linkMessage.update({ where: { id: pid(req) }, data: { isPinned: !msg.isPinned }, include: { author: { select: userPublic } } }));
}));
// Reagir (toggle) a uma mensagem do mural com emoji
app.post('/api/links/messages/:id/react', validate(reactSchema), h(async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: pid(req) } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  const existing = await prisma.linkMessageReaction.findUnique({ where: { messageId_userId_emoji: { messageId: pid(req), userId: req.user!.id, emoji: req.body.emoji } } });
  if (existing) { await prisma.linkMessageReaction.delete({ where: { id: existing.id } }); return res.json({ toggled: 'removed' }); }
  await prisma.linkMessageReaction.create({ data: { messageId: pid(req), userId: req.user!.id, emoji: req.body.emoji } });
  res.json({ toggled: 'added' });
}));
// Votar em enquete do mural (upsert: 1 voto por pessoa)
app.post('/api/links/messages/:id/vote', validate(voteSchema), h(async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: pid(req) } });
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (!msg.pollOptions) return res.status(400).json({ error: 'Esta mensagem não é uma enquete.' });
  const opts: string[] = JSON.parse(msg.pollOptions);
  if (req.body.optionIndex >= opts.length) return res.status(400).json({ error: 'Opção inválida.' });
  await prisma.pollVote.upsert({ where: { messageId_userId: { messageId: pid(req), userId: req.user!.id } }, update: { optionIndex: req.body.optionIndex }, create: { messageId: pid(req), userId: req.user!.id, optionIndex: req.body.optionIndex } });
  res.json({ message: 'Voto registrado.' });
}));

// --- LOJA DE RECOMPENSAS ---
app.get('/api/products', h(async (req, res) => res.json(await prisma.product.findMany({ orderBy: { createdAt: 'desc' } }))));
app.post('/api/products', canManage('store'),validate(productSchema), h(async (req, res) => res.status(201).json(await prisma.product.create({ data: req.body }))));
app.put('/api/products/:id', canManage('store'),validate(productSchema), h(async (req, res) => res.json(await prisma.product.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/products/:id', canManage('store'),h(async (req, res) => { await prisma.product.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));

// Resgatar: debita pontos e gera voucher único (transação)
app.post('/api/products/:id/redeem', h(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: pid(req) } });
  if (!product || !product.active) return res.status(404).json({ error: 'Produto indisponível.' });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  // Resgate é livre para qualquer usuário autenticado — basta ter Zion Points suficientes.
  if (user.points < product.cost) return res.status(400).json({ error: 'Zion Points insuficientes.' });

  const [redemption, updatedUser] = await prisma.$transaction([
    prisma.redemption.create({ data: { code: genVoucherCode(), cost: product.cost, userId: user.id, productId: product.id, productName: product.name } }),
    prisma.user.update({ where: { id: user.id }, data: { points: { decrement: product.cost } }, select: userPublic }),
  ]);
  res.status(201).json({ redemption, points: updatedUser.points });
}));

// Meus vouchers
app.get('/api/redemptions/my', h(async (req, res) => res.json(await prisma.redemption.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } }))));

// Validar voucher pelo código (admin) — confere autenticidade e se ainda está ativo
app.get('/api/redemptions/validate/:code', canValidateVoucher, h(async (req, res) => {
  const r = await prisma.redemption.findUnique({ where: { code: String(req.params.code) }, include: { user: { select: userPublic } } });
  if (!r) return res.status(404).json({ valid: false, error: 'Código não encontrado.' });
  res.json({ valid: r.status === 'ATIVO', redemption: r });
}));

// Marcar voucher como usado (admin)
app.patch('/api/redemptions/:id/use', staffOnly,h(async (req, res) => res.json(await prisma.redemption.update({ where: { id: pid(req) }, data: { status: 'USADO', usedAt: new Date() } }))));

// Validar + consumir voucher pelo código, em uma etapa (atendente via QR). Idempotente.
const consumeSchema = z.object({ code: z.string().min(1) });
app.post('/api/redemptions/consume', canValidateVoucher, validate(consumeSchema), h(async (req, res) => {
  const code = String(req.body.code).trim().toUpperCase();
  const r = await prisma.redemption.findUnique({ where: { code }, include: { user: { select: userPublic } } });
  if (!r) return res.status(404).json({ error: 'Voucher não encontrado.' });
  if (r.status === 'USADO') return res.json({ consumed: false, already: true, redemption: r });
  const updated = await prisma.redemption.update({ where: { id: r.id }, data: { status: 'USADO', usedAt: new Date() }, include: { user: { select: userPublic } } });
  res.json({ consumed: true, already: false, redemption: updated });
}));

// --- GAMIFICAÇÃO (regras de pontos) ---
app.get('/api/point-rules', h(async (req, res) => res.json(await prisma.pointRule.findMany({ orderBy: { category: 'asc' } }))));
app.post('/api/point-rules', requirePerm('POINT_RULE_MANAGE'),validate(pointRuleSchema), h(async (req, res) => {
  try {
    res.status(201).json(await prisma.pointRule.create({ data: req.body }));
  } catch { res.status(409).json({ error: 'Já existe uma regra com essa chave.' }); }
}));
app.put('/api/point-rules/:id', requirePerm('POINT_RULE_MANAGE'),validate(pointRuleUpdateSchema), h(async (req, res) => res.json(await prisma.pointRule.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/point-rules/:id', requirePerm('POINT_RULE_MANAGE'),h(async (req, res) => { await prisma.pointRule.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));

// --- PLANO BÍBLICO ---
// Progresso do usuário + leitura de hoje
app.get('/api/reading/me', h(async (req, res) => {
  // NÃO retorna photoUrl (base64) na listagem — performance
  const logs = await prisma.readingLog.findMany({ where: { userId: req.user!.id }, select: { id: true, day: true, reference: true, createdAt: true }, orderBy: { day: 'asc' } });
  const day = currentPlanDay();
  const todayDone = logs.some(l => l.day === day);

  // Lembrete in-app: cria 1 notificação por dia se a leitura ainda não foi feita
  if (!todayDone) {
    const refId = `reminder-${day}`;
    const exists = await prisma.notification.findFirst({ where: { userId: req.user!.id, refId } });
    if (!exists) notify(req.user!.id, 'REMINDER', 'Leitura de hoje pendente 📖', `Não esqueça: ${getPlanDays()[day - 1] || 'a leitura de hoje'}. Marque como lida e mantenha o fogo aceso! 🔥`, refId, 'membros:reading');
  }

  const [pointsWithPhoto, pointsNoPhoto, memberships] = await Promise.all([
    rulePts('BIBLE_DAILY_READ', 15),
    rulePts('BIBLE_DAILY_NOPHOTO', 5),
    prisma.groupMember.findMany({ where: { userId: req.user!.id, status: 'ATIVO' }, include: { group: { select: { id: true, name: true } } } }),
  ]);

  const activePlan = getActivePlan();
  res.json({
    count: logs.length,
    todayDay: day,
    todayReference: activePlan.days[day - 1] || null,
    todayDone,
    milestones: READING_MILESTONES,
    pointsWithPhoto,
    pointsNoPhoto,
    groups: memberships.map(m => m.group),
    logs,
    planLabel: activePlan.label,
    spotifyUrl: activePlan.spotifyUrl,
  });
}));

// Ranking geral de leitura (todos os usuários com alguma leitura registrada) — visível a qualquer membro
app.get('/api/reading/ranking', h(async (req, res) => {
  const readers = await prisma.readingLog.findMany({ distinct: ['userId'], select: { userId: true } });
  const userIds = readers.map(r => r.userId);
  if (userIds.length === 0) return res.json([]);
  const [users, groupRows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, profileImage: true, bibleStreak: true, points: true } }),
    prisma.groupMember.findMany({ where: { userId: { in: userIds }, status: 'ATIVO' }, include: { group: { select: { name: true } } } }),
  ]);
  const groupNameById: Record<string, string> = {};
  for (const gm of groupRows) if (!groupNameById[gm.userId]) groupNameById[gm.userId] = gm.group.name;
  const ranking = users
    .map(u => ({ ...u, groupName: groupNameById[u.id] || null }))
    .sort((a, b) => (b.bibleStreak - a.bibleStreak) || (b.points - a.points));
  res.json(ranking);
}));

// --- ADMIN: AJUSTAR CONTAGEM DE LEITURA DE UM MEMBRO (Admin > Plano Bíblico) ---
app.get('/api/admin/reading/:userId', requirePerm('READING_ADJUST'), h(async (req, res) => {
  const userId = String(req.params.userId);
  const [user, count] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: userPublic }),
    prisma.readingLog.count({ where: { userId } }),
  ]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ user, count });
}));

const readingAdjustSchema = z.object({ userId: z.string().min(1), newCount: z.number().int().min(0).max(400) });
app.post('/api/admin/reading/adjust', requirePerm('READING_ADJUST'), validate(readingAdjustSchema), h(async (req, res) => {
  const { userId, newCount } = req.body as { userId: string; newCount: number };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const logs = await prisma.readingLog.findMany({ where: { userId }, orderBy: { day: 'asc' } });
  const oldCount = logs.length;
  const days = getPlanDays();
  const noPhotoPts = await rulePts('BIBLE_DAILY_NOPHOTO', 5);
  const milestoneBonus = async (m: number) => rulePts(`BIBLE_MILESTONE_${m}`, DEFAULT_MILESTONE_BONUS[m] || 0);

  let pointsDelta = 0;
  if (newCount > oldCount) {
    const existingDays = new Set(logs.map(l => l.day));
    const toAdd: number[] = [];
    for (let d = 1; toAdd.length < (newCount - oldCount) && d <= 4000; d++) {
      if (!existingDays.has(d)) toAdd.push(d);
    }
    await prisma.readingLog.createMany({ data: toAdd.map(d => ({ userId, day: d, reference: days[d - 1] || `Dia ${d}`, photoUrl: '' })) });
    pointsDelta += toAdd.length * noPhotoPts;
    for (const m of READING_MILESTONES) if (m > oldCount && m <= newCount) pointsDelta += await milestoneBonus(m);
  } else if (newCount < oldCount) {
    const toRemove = logs.slice().sort((a, b) => b.day - a.day).slice(0, oldCount - newCount);
    await prisma.readingLog.deleteMany({ where: { id: { in: toRemove.map(l => l.id) } } });
    pointsDelta -= toRemove.length * noPhotoPts;
    for (const m of READING_MILESTONES) if (m > newCount && m <= oldCount) pointsDelta -= await milestoneBonus(m);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { bibleStreak: newCount, points: Math.max(0, user.points + pointsDelta) },
    select: userPublic,
  });
  res.json({ user: updated, oldCount, newCount, pointsDelta });
}));

// --- ADMIN: PLANOS DE LEITURA POR ANO (Admin > Plano Bíblico) ---
app.get('/api/reading-plans', requirePerm('READING_PLAN_MANAGE'), h(async (req, res) => {
  const rows = await prisma.readingPlan.findMany({ orderBy: { year: 'asc' } });
  res.json(rows.map(r => ({ id: r.id, year: r.year, label: r.label, spotifyUrl: r.spotifyUrl, dayCount: (r.days as unknown as string[]).length })));
}));
app.get('/api/reading-plans/:id', requirePerm('READING_PLAN_MANAGE'), h(async (req, res) => {
  const r = await prisma.readingPlan.findUnique({ where: { id: pid(req) } });
  if (!r) return res.status(404).json({ error: 'Plano não encontrado.' });
  res.json(r);
}));
const readingPlanSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  label: z.string().min(1).max(120),
  days: z.array(z.string().max(200)).min(1).max(400),
  spotifyUrl: z.string().url().optional().nullable(),
});
app.post('/api/reading-plans', requirePerm('READING_PLAN_MANAGE'), validate(readingPlanSchema), h(async (req, res) => {
  try {
    const created = await prisma.readingPlan.create({ data: req.body });
    await loadReadingPlanCache();
    res.status(201).json(created);
  } catch { res.status(409).json({ error: 'Já existe um plano cadastrado para esse ano.' }); }
}));
app.put('/api/reading-plans/:id', requirePerm('READING_PLAN_MANAGE'), validate(readingPlanSchema), h(async (req, res) => {
  try {
    const updated = await prisma.readingPlan.update({ where: { id: pid(req) }, data: req.body });
    await loadReadingPlanCache();
    res.json(updated);
  } catch { res.status(409).json({ error: 'Já existe outro plano cadastrado para esse ano.' }); }
}));
app.delete('/api/reading-plans/:id', requirePerm('READING_PLAN_MANAGE'), h(async (req, res) => {
  await prisma.readingPlan.delete({ where: { id: pid(req) } });
  await loadReadingPlanCache();
  res.json({ message: 'Removido' });
}));

// Texto da leitura do dia (para ler no app) — dataset local ACF, sem dependência externa
app.get('/api/reading/text', h(async (req, res) => {
  const day = req.query.day ? Math.min(Math.max(parseInt(String(req.query.day), 10) || 1, 1), getPlanDays().length) : currentPlanDay();
  const reference = getPlanDays()[day - 1];
  if (!reference) return res.status(404).json({ error: 'Leitura não encontrada.' });

  const parsed = parseRef(reference);
  const bookIndex = parsed ? BOOK_ORDER.indexOf(parsed.book) : -1;
  const book = bookIndex >= 0 ? BIBLE[bookIndex] : null;
  if (!parsed || !book) return res.status(400).json({ error: 'Não foi possível interpretar a referência.' });

  const passages = [];
  for (let c = parsed.start; c <= parsed.end; c++) {
    const chap = book.chapters[c - 1];
    if (chap) passages.push({ chapter: c, verses: chap.map((text, i) => ({ verse: i + 1, text })) });
  }
  res.json({ reference, translation: 'Almeida Corrigida Fiel (ACF)', passages });
}));

// Marcar leitura do dia (foto opcional; sem foto = menos pontos) — credita e checa marcos
app.post('/api/reading/check', validate(readingCheckSchema), h(async (req, res) => {
  const day = currentPlanDay();
  const reference = getPlanDays()[day - 1] || `Dia ${day}`;
  const hasPhoto = typeof req.body.photoUrl === 'string' && req.body.photoUrl.trim().length > 0;

  // À prova de corrida: confia na constraint única (userId, day) em vez de pré-checar.
  // A foto NÃO é armazenada no ReadingLog (evita inflar o banco): ela só serve para conceder os
  // pontos e, se a leitura for compartilhada, vira histórico na mensagem do grupo (imageUrl).
  let log;
  try {
    log = await prisma.readingLog.create({ data: { userId: req.user!.id, day, reference, photoUrl: '' } });
  } catch {
    return res.status(409).json({ error: 'Você já marcou a leitura de hoje.' });
  }
  const count = await prisma.readingLog.count({ where: { userId: req.user!.id } });

  const dailyPts = hasPhoto ? await rulePts('BIBLE_DAILY_READ', 15) : await rulePts('BIBLE_DAILY_NOPHOTO', 5);
  let bonus = 0;
  let milestoneReached: number | null = null;
  if (READING_MILESTONES.includes(count)) {
    milestoneReached = count;
    bonus = await rulePts(`BIBLE_MILESTONE_${count}`, DEFAULT_MILESTONE_BONUS[count] || 0);
  }
  const pointsEarned = dailyPts + bonus;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { points: { increment: pointsEarned }, bibleStreak: count },
    select: userPublic,
  });

  if (milestoneReached) notify(req.user!.id, 'MILESTONE', `🔥 Marco de ${milestoneReached} dias!`, `Você atingiu ${milestoneReached} dias de leitura e ganhou +${bonus} pontos de bônus!`, undefined, 'membros');

  // Compartilha a atividade (com foto, se houver) nos grupos escolhidos onde o usuário é membro ativo
  const groupIds: string[] = Array.isArray(req.body.groupIds) ? req.body.groupIds : [];
  if (groupIds.length) {
    const memberships = await prisma.groupMember.findMany({ where: { userId: req.user!.id, status: 'ATIVO', groupId: { in: groupIds } }, select: { groupId: true } });
    const allowed = memberships.map(m => m.groupId);
    if (allowed.length) {
      await prisma.groupMessage.createMany({ data: allowed.map(gid => ({ groupId: gid, userId: req.user!.id, type: 'READING', content: reference, imageUrl: hasPhoto ? req.body.photoUrl : null })) });
      const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
      if (comment) await prisma.groupMessage.createMany({ data: allowed.map(gid => ({ groupId: gid, userId: req.user!.id, type: 'COMMENT', content: comment })) });
    }
  }

  res.status(201).json({ log, count, dailyPts, bonus, milestoneReached, pointsEarned, withPhoto: hasPhoto, user });
}));

// --- PONTOS (ações que creditam no banco) ---
app.get('/api/points/mine', h(async (req, res) => res.json(await prisma.pointAward.findMany({ where: { userId: req.user!.id }, select: { ruleKey: true, refId: true, points: true, createdAt: true } }))));

app.post('/api/training/complete', validate(trainingSchema), h(async (req, res) => {
  if (!TRAINING_MODULES.includes(req.body.moduleId)) return res.status(400).json({ error: 'Módulo de treinamento inválido.' });
  const award = await awardPoints(req.user!.id, 'TRAINING_COMPLETION', req.body.moduleId, 150);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: userPublic });
  res.status(201).json({ awarded: award.awarded, already: award.already, points: user?.points });
}));

// --- GRUPOS DE LEITURA ---
app.get('/api/groups', h(async (req, res) => {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: req.user!.id, status: 'ATIVO' },
    include: { group: { include: { owner: { select: userPublic }, members: { where: { status: 'ATIVO' }, select: { id: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(memberships.map(m => ({ id: m.group.id, name: m.group.name, description: m.group.description, ownerId: m.group.ownerId, owner: m.group.owner, memberCount: m.group.members.length })));
}));

app.post('/api/groups', requirePerm('GROUP_CREATE'), validate(groupSchema), h(async (req, res) => {
  const group = await prisma.readingGroup.create({
    data: { name: req.body.name, description: req.body.description, ownerId: req.user!.id, members: { create: { userId: req.user!.id, status: 'ATIVO' } } },
    include: { owner: { select: userPublic } },
  });
  res.status(201).json({ ...group, memberCount: 1 });
}));

// Convites pendentes do usuário (registrar ANTES de /:id para não colidir)
app.get('/api/groups/invites', h(async (req, res) => {
  const invites = await prisma.groupMember.findMany({
    where: { userId: req.user!.id, status: 'PENDENTE' },
    include: { group: { include: { owner: { select: userPublic }, members: { where: { status: 'ATIVO' }, select: { id: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invites.map(i => ({ groupId: i.group.id, name: i.group.name, owner: i.group.owner, memberCount: i.group.members.length })));
}));

app.get('/api/groups/:id', h(async (req, res) => {
  const group = await prisma.readingGroup.findUnique({
    where: { id: pid(req) },
    include: { owner: { select: userPublic }, members: { include: { user: { select: userPublic } } } },
  });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const activeMembers = group.members.filter(m => m.status === 'ATIVO');
  const isMember = activeMembers.some(m => m.userId === req.user!.id);
  if (!isMember && !isStaff(req)) return res.status(403).json({ error: 'Você não participa deste grupo.' });

  const pending = group.members.filter(m => m.status === 'PENDENTE').map(m => ({ id: m.user.id, name: m.user.name }));
  const ranking = activeMembers
    .map(m => m.user)
    .sort((a, b) => (b.bibleStreak - a.bibleStreak) || (b.points - a.points));

  const memberIds = activeMembers.map(m => m.userId);
  const nameById = Object.fromEntries(activeMembers.map(m => [m.userId, m.user.name]));
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  // Feed (leituras recentes dos membros) e ranking semanal (leituras nos últimos 7 dias)
  const [recent, weekGroups] = await Promise.all([
    prisma.readingLog.findMany({ where: { userId: { in: memberIds } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, userId: true, reference: true, createdAt: true } }),
    prisma.readingLog.groupBy({ by: ['userId'], where: { userId: { in: memberIds }, createdAt: { gte: weekAgo } }, _count: { _all: true } }),
  ]);
  const feed = recent.map(r => ({ id: r.id, name: nameById[r.userId] || 'Membro', reference: r.reference, createdAt: r.createdAt }));
  const weekly = weekGroups
    .map(w => ({ id: w.userId, name: nameById[w.userId] || 'Membro', count: w._count._all }))
    .sort((a, b) => b.count - a.count);

  res.json({ id: group.id, name: group.name, description: group.description, ownerId: group.ownerId, owner: group.owner, ranking, weekly, feed, pending });
}));

// Convidar alguém (cria vínculo PENDENTE; a pessoa precisa aceitar)
app.post('/api/groups/:id/members', validate(memberSchema), h(async (req, res) => {
  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: pid(req), userId: req.user!.id } } });
  if (!membership || membership.status !== 'ATIVO') return res.status(403).json({ error: 'Apenas membros podem convidar pessoas.' });
  try {
    await prisma.groupMember.create({ data: { groupId: pid(req), userId: req.body.userId, status: 'PENDENTE' } });
  } catch { return res.status(409).json({ error: 'Essa pessoa já está no grupo ou já foi convidada.' }); }
  const group = await prisma.readingGroup.findUnique({ where: { id: pid(req) } });
  if (group) notify(req.body.userId, 'INVITE', 'Convite para grupo de leitura', `Você foi convidado para o grupo "${group.name}". Aceite para participar! 🔥`, group.id, 'membros:groups');
  res.status(201).json({ message: 'Convite enviado' });
}));

// Aceitar convite (PENDENTE -> ATIVO)
app.post('/api/groups/:id/accept', h(async (req, res) => {
  const m = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: pid(req), userId: req.user!.id } } });
  if (!m || m.status !== 'PENDENTE') return res.status(404).json({ error: 'Convite não encontrado.' });
  await prisma.groupMember.update({ where: { id: m.id }, data: { status: 'ATIVO' } });
  const [group, me] = await Promise.all([
    prisma.readingGroup.findUnique({ where: { id: pid(req) } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
  ]);
  if (group) notify(group.ownerId, 'INFO', 'Novo membro no grupo', `${me?.name || 'Alguém'} entrou no grupo "${group.name}".`, group.id, 'membros:groups');
  res.json({ message: 'Você entrou no grupo!' });
}));

// Recusar convite (remove o vínculo pendente)
app.post('/api/groups/:id/decline', h(async (req, res) => {
  await prisma.groupMember.deleteMany({ where: { groupId: pid(req), userId: req.user!.id, status: 'PENDENTE' } });
  res.json({ message: 'Convite recusado.' });
}));

app.delete('/api/groups/:id/members/:userId', h(async (req, res) => {
  const group = await prisma.readingGroup.findUnique({ where: { id: pid(req) } });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const target = String(req.params.userId);
  if (target !== req.user!.id && group.ownerId !== req.user!.id) return res.status(403).json({ error: 'Sem permissão.' });
  await prisma.groupMember.deleteMany({ where: { groupId: pid(req), userId: target } });
  res.json({ message: 'Removido' });
}));

app.delete('/api/groups/:id', h(async (req, res) => {
  const group = await prisma.readingGroup.findUnique({ where: { id: pid(req) } });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (group.ownerId !== req.user!.id) return res.status(403).json({ error: 'Apenas o dono pode excluir o grupo.' });
  await prisma.readingGroup.delete({ where: { id: pid(req) } });
  res.json({ message: 'Removido' });
}));

// Chat do grupo (atividades de leitura + comentários) — só membro ativo
const isActiveMember = async (groupId: string, userId: string) => {
  const m = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return !!m && m.status === 'ATIVO';
};
app.get('/api/groups/:id/messages', h(async (req, res) => {
  if (!(await isActiveMember(pid(req), req.user!.id)) && !isStaff(req)) return res.status(403).json({ error: 'Você não participa deste grupo.' });
  const messages = await prisma.groupMessage.findMany({ where: { groupId: pid(req) }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { id: true, name: true, profileImage: true } }, reactions: true } });
  const me = req.user!.id;
  res.json(messages.map(m => {
    const byEmoji: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    for (const r of m.reactions) {
      byEmoji[r.emoji] = byEmoji[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
      byEmoji[r.emoji].count++;
      if (r.userId === me) byEmoji[r.emoji].mine = true;
    }
    return { id: m.id, type: m.type, content: m.content, imageUrl: m.imageUrl, createdAt: m.createdAt, userId: m.userId, name: m.user.name, avatar: m.user.profileImage, reactions: Object.values(byEmoji) };
  }));
}));

// Reagir (toggle) a uma mensagem com emoji
app.post('/api/groups/:id/messages/:msgId/react', validate(reactSchema), h(async (req, res) => {
  if (!(await isActiveMember(pid(req), req.user!.id))) return res.status(403).json({ error: 'Só membros podem reagir.' });
  const msgId = String(req.params.msgId);
  const msg = await prisma.groupMessage.findUnique({ where: { id: msgId } });
  if (!msg || msg.groupId !== pid(req)) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: { messageId: msgId, userId: req.user!.id, emoji: req.body.emoji } } });
  if (existing) { await prisma.messageReaction.delete({ where: { id: existing.id } }); return res.json({ toggled: 'removed' }); }
  await prisma.messageReaction.create({ data: { messageId: msgId, userId: req.user!.id, emoji: req.body.emoji } });
  res.json({ toggled: 'added' });
}));
app.post('/api/groups/:id/messages', validate(commentSchema), h(async (req, res) => {
  if (!(await isActiveMember(pid(req), req.user!.id))) return res.status(403).json({ error: 'Só membros podem comentar.' });
  const msg = await prisma.groupMessage.create({ data: { groupId: pid(req), userId: req.user!.id, type: 'COMMENT', content: req.body.content }, include: { user: { select: { id: true, name: true, profileImage: true } } } });
  res.status(201).json({ id: msg.id, type: msg.type, content: msg.content, imageUrl: msg.imageUrl, createdAt: msg.createdAt, userId: msg.userId, name: msg.user.name, avatar: msg.user.profileImage });
}));

// --- NOTIFICAÇÕES ---
app.get('/api/notifications', h(async (req, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: req.user!.id, read: false } }),
  ]);
  res.json({ items, unread });
}));
app.patch('/api/notifications/read-all', h(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
  res.json({ message: 'ok' });
}));
app.patch('/api/notifications/:id/read', h(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: pid(req), userId: req.user!.id }, data: { read: true } });
  res.json({ message: 'ok' });
}));

// --- PERFIL DO USUÁRIO (estatísticas e conquistas) ---
app.get('/api/me/stats', h(async (req, res) => {
  const uid = req.user!.id;
  const [readingCount, shiftsConfirmed, eventsParticipated, trainingsDone, groups, redemptions, user] = await Promise.all([
    prisma.readingLog.count({ where: { userId: uid } }),
    prisma.shift.count({ where: { volunteerId: uid, status: 'Confirmado' } }),
    prisma.pointAward.count({ where: { userId: uid, ruleKey: 'EVENT_PARTICIPATION' } }),
    prisma.pointAward.count({ where: { userId: uid, ruleKey: 'TRAINING_COMPLETION' } }),
    prisma.groupMember.count({ where: { userId: uid } }),
    prisma.redemption.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.user.findUnique({ where: { id: uid }, select: userPublic }),
  ]);
  res.json({ readingCount, shiftsConfirmed, eventsParticipated, trainingsDone, groups, redemptions, points: user?.points || 0, bibleStreak: user?.bibleStreak || 0 });
}));

// --- PAINEL ADMIN (métricas) ---
app.get('/api/admin/stats', staffOnly,h(async (req, res) => {
  const [users, links, areas, events, products, groups, readingLogs, distinctReaders, redActive, redUsed, ptsAgg, spentAgg] = await Promise.all([
    prisma.user.count(),
    prisma.link.count(),
    prisma.area.count(),
    prisma.event.count(),
    prisma.product.count(),
    prisma.readingGroup.count(),
    prisma.readingLog.count(),
    prisma.readingLog.findMany({ distinct: ['userId'], select: { userId: true } }),
    prisma.redemption.count({ where: { status: 'ATIVO' } }),
    prisma.redemption.count({ where: { status: 'USADO' } }),
    prisma.user.aggregate({ _sum: { points: true } }),
    prisma.redemption.aggregate({ _sum: { cost: true } }),
  ]);
  res.json({
    users, links, areas, events, products, groups,
    readingLogs, activeReaders: distinctReaders.length,
    redemptionsActive: redActive, redemptionsUsed: redUsed,
    pointsInCirculation: ptsAgg._sum.points || 0,
    pointsSpent: spentAgg._sum.cost || 0,
  });
}));

// Admin: visão geral dos grupos de leitura (andamento, ranking interno resumido, nº de pessoas)
app.get('/api/admin/groups-overview', staffOnly, h(async (req, res) => {
  const groups = await prisma.readingGroup.findMany({
    include: { owner: { select: userPublic }, members: { where: { status: 'ATIVO' }, include: { user: { select: userPublic } } } },
    orderBy: { createdAt: 'desc' },
  });
  const overview = groups.map(g => {
    const members = g.members.map(m => m.user).sort((a, b) => (b.bibleStreak - a.bibleStreak) || (b.points - a.points));
    const avgStreak = members.length ? Math.round(members.reduce((s, u) => s + u.bibleStreak, 0) / members.length) : 0;
    return {
      id: g.id, name: g.name, description: g.description, owner: g.owner,
      memberCount: members.length, avgStreak,
      topReader: members[0] ? { id: members[0].id, name: members[0].name, bibleStreak: members[0].bibleStreak } : null,
    };
  });
  res.json(overview);
}));

// ─── Middleware de erro (try/catch central) ────────────────────────────────
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err); // detalhe completo só no log do servidor
  // Só expõe a mensagem de erros intencionais (com status); os demais viram 500 genérico
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

ensureDefaultReadingPlan().catch(err => console.error('Falha ao preparar o Plano Bíblico padrão:', err));

app.listen(port, () => console.log(`✅ Servidor Zion ativo na porta ${port}`));
