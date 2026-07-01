import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { READING_PLAN } from './readingPlan';

const app = express();
const port = Number(process.env.PORT) || 3000;
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'zion-dev-secret-change-me';
const SEED_KEY = process.env.SEED_KEY || 'zion-dev-seed';
const TOKEN_TTL = '7d';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Campos públicos do usuário (NUNCA expõe password)
const userPublic = {
  id: true, name: true, email: true, role: true, campus: true,
  points: true, bibleStreak: true, profileImage: true, createdAt: true, updatedAt: true,
} as const;

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
const userUpdateSchema = z.object({ name: z.string().min(1).optional(), profileImage: z.string().nullable().optional() });
const roleSchema = z.object({ role: z.enum(['MEMBRO', 'VOLUNTARIO', 'LIDER', 'ADMIN']) });
const publicationSchema = z.object({ content: z.string().min(1), imageUrl: z.string().optional(), documentUrl: z.string().optional() });
const eventSchema = z.object({ title: z.string().min(1), date: z.string().min(1), location: z.string().optional(), type: z.string().optional(), recurrence: z.enum(['NONE', 'WEEKLY', 'MONTHLY']).optional() });
const announcementSchema = z.object({ title: z.string().min(1), content: z.string().min(1), type: z.string().optional() });
const areaSchema = z.object({ name: z.string().min(1), description: z.string().optional().nullable(), leaderId: z.string().min(1) });
const linkSchema = z.object({
  name: z.string().min(1), day: z.string().min(1), time: z.string().min(1),
  isOnline: z.boolean().optional(), locationUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(), leaderId: z.string().min(1),
});
const leaderPatchSchema = z.object({ leaderId: z.string().min(1) });
const statusSchema = z.object({ status: z.string().min(1) });
const messageSchema = z.object({ content: z.string().min(1), category: z.string().optional() });
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

const readingCheckSchema = z.object({ photoUrl: z.string().min(1) }); // foto obrigatória

// Marcos de sequência do plano bíblico (dias acumulados de leitura)
const READING_MILESTONES = [10, 20, 30, 45, 60];

// Dia do plano com base na data atual (dia do ano, 1..365)
const currentPlanDay = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  return Math.min(Math.max(day, 1), READING_PLAN.length);
};

// Pontos de uma regra (ativa) do banco; fallback se não existir
const rulePts = async (key: string, fallback: number) => {
  const r = await prisma.pointRule.findUnique({ where: { key } });
  return r ? (r.active ? r.points : 0) : fallback;
};
const DEFAULT_MILESTONE_BONUS: Record<number, number> = { 10: 50, 20: 100, 30: 150, 45: 200, 60: 300 };

// ════════════════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS (sem auth)
// ════════════════════════════════════════════════════════════════════════

// --- LOGIN ---
app.post('/api/auth/login', validate(loginSchema), h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });
  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });
  const { password, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
}));

// --- SEED (protegido por chave; recria dados e hasheia senhas) ---
app.post('/api/seed', h(async (req, res) => {
  const key = req.headers['x-seed-key'] || req.query.key;
  if (key !== SEED_KEY) return res.status(403).json({ error: 'Seed protegido. Forneça x-seed-key.' });

  await prisma.readingLog.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.product.deleteMany();
  await prisma.pointRule.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.areaParticipation.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.area.deleteMany();
  await prisma.linkParticipation.deleteMany();
  await prisma.linkMessage.deleteMany();
  await prisma.event.deleteMany();
  await prisma.link.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();

  const pass = await bcrypt.hash('123', 10);
  const adminUser = await prisma.user.create({ data: { name: "Admin Zion", email: "admin@zion.com", password: pass, role: "ADMIN", points: 5000, bibleStreak: 100 } });
  const liderLucas = await prisma.user.create({ data: { name: "Lucas Dias", email: "lucas@zion.com", password: pass, role: "LIDER", points: 2500, bibleStreak: 45 } });
  await prisma.user.create({ data: { name: "João Silva", email: "joao@zion.com", password: pass, role: "LIDER", points: 1200, bibleStreak: 12 } });

  const linkVox = await prisma.link.create({ data: { name: "Link VOX", day: "Sexta", time: "20:00", leaderId: liderLucas.id, isOnline: true } });
  await prisma.linkParticipation.create({ data: { userId: adminUser.id, linkId: linkVox.id, status: "PENDENTE" } });

  await prisma.event.create({ data: { title: "Culto de Celebração", date: new Date("2026-07-06T10:00:00Z"), location: "Campus RP", type: "GERAL" } });

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
    { key: "BIBLE_DAILY_READ", label: "Ler o capítulo do dia", category: "Plano Bíblico", points: 15, description: "Marcar a leitura diária (com foto)." },
    { key: "BIBLE_MILESTONE_10", label: "Marco: 10 dias de leitura", category: "Plano Bíblico", points: 50, description: "Bônus ao atingir 10 dias." },
    { key: "BIBLE_MILESTONE_20", label: "Marco: 20 dias de leitura", category: "Plano Bíblico", points: 100, description: "Bônus ao atingir 20 dias." },
    { key: "BIBLE_MILESTONE_30", label: "Marco: 1 mês de leitura", category: "Plano Bíblico", points: 150, description: "Bônus ao atingir 30 dias." },
    { key: "BIBLE_MILESTONE_45", label: "Marco: 45 dias de leitura", category: "Plano Bíblico", points: 200, description: "Bônus ao atingir 45 dias." },
    { key: "BIBLE_MILESTONE_60", label: "Marco: 2 meses de leitura", category: "Plano Bíblico", points: 300, description: "Bônus ao atingir 60 dias." },
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
app.get('/api/leaders', h(async (req, res) => res.json(await prisma.user.findMany({ where: { role: { in: ['LIDER', 'ADMIN'] } }, select: userPublic }))));
app.put('/api/users/:id', validate(userUpdateSchema), h(async (req, res) => {
  if (req.user!.id !== pid(req) && req.user!.role !== 'ADMIN')
    throw new HttpError(403, 'Você só pode editar o próprio perfil.');
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { name: req.body.name, profileImage: req.body.profileImage }, select: userPublic }));
}));
app.patch('/api/users/:id/role', adminOnly, validate(roleSchema), h(async (req, res) =>
  res.json(await prisma.user.update({ where: { id: pid(req) }, data: { role: req.body.role }, select: userPublic }))));

// --- MURAL DA COMUNIDADE ---
app.get('/api/publications', h(async (req, res) => res.json(await prisma.publication.findMany({ include: { author: { select: userPublic } }, orderBy: { createdAt: 'desc' } }))));
app.post('/api/publications', validate(publicationSchema), h(async (req, res) => res.status(201).json(await prisma.publication.create({ data: { content: req.body.content, imageUrl: req.body.imageUrl, documentUrl: req.body.documentUrl, authorId: req.user!.id }, include: { author: { select: userPublic } } }))));
app.delete('/api/publications/:id', h(async (req, res) => { await prisma.publication.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));

// --- EVENTOS ---
app.get('/api/events', h(async (req, res) => res.json(await prisma.event.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { date: 'asc' } }))));
app.post('/api/events', adminOnly, validate(eventSchema), h(async (req, res) => res.status(201).json(await prisma.event.create({ data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence } }))));
app.put('/api/events/:id', adminOnly, validate(eventSchema), h(async (req, res) => res.json(await prisma.event.update({ where: { id: pid(req) }, data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence } }))));
app.delete('/api/events/:id', adminOnly, h(async (req, res) => { await prisma.event.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));

// --- COMUNICADOS ---
app.get('/api/announcements', h(async (req, res) => res.json(await prisma.announcement.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { createdAt: 'desc' } }))));
app.post('/api/announcements', adminOnly, validate(announcementSchema), h(async (req, res) => res.status(201).json(await prisma.announcement.create({ data: req.body }))));
app.put('/api/announcements/:id', adminOnly, validate(announcementSchema), h(async (req, res) => res.json(await prisma.announcement.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/announcements/:id', adminOnly, h(async (req, res) => { await prisma.announcement.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));

// --- ÁREAS (VOLUNTARIADO) ---
app.get('/api/areas', h(async (req, res) => {
  const areas = await prisma.area.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: 'APROVADO' } } } });
  res.json(areas.map(a => ({ ...a, approvedCount: a.participations.length, participations: undefined })));
}));
app.post('/api/areas', adminOnly, validate(areaSchema), h(async (req, res) => res.status(201).json(await prisma.area.create({ data: req.body, include: { leader: { select: userPublic } } }))));
app.put('/api/areas/:id', adminOnly, validate(areaSchema), h(async (req, res) => res.json(await prisma.area.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } }))));
app.delete('/api/areas/:id', adminOnly, h(async (req, res) => { await prisma.area.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));
app.patch('/api/areas/:id/leader', adminOnly, validate(leaderPatchSchema), h(async (req, res) => res.json(await prisma.area.update({ where: { id: pid(req) }, data: { leaderId: req.body.leaderId } }))));

// Participações e Escalas (userId vem do token)
app.get('/api/areas/my-participations', h(async (req, res) => res.json(await prisma.areaParticipation.findMany({ where: { userId: req.user!.id }, include: { area: { include: { leader: { select: userPublic } } } } }))));
app.post('/api/areas/:id/request', h(async (req, res) => {
  try {
    res.status(201).json(await prisma.areaParticipation.create({ data: { userId: req.user!.id, areaId: pid(req), status: 'PENDENTE' } }));
  } catch { res.status(409).json({ error: 'Você já solicitou participação nesta área.' }); }
}));
app.delete('/api/areas/:id/request', h(async (req, res) => { await prisma.areaParticipation.deleteMany({ where: { userId: req.user!.id, areaId: pid(req) } }); res.json({ message: "Cancelado" }); }));
app.get('/api/areas/:id/participations', h(async (req, res) => res.json(await prisma.areaParticipation.findMany({ where: { areaId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } }))));
app.patch('/api/areas/participations/:id', validate(statusSchema), h(async (req, res) => res.json(await prisma.areaParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } }))));

app.get('/api/shifts', h(async (req, res) => res.json(await prisma.shift.findMany({ where: { volunteerId: req.user!.id }, include: { area: true }, orderBy: { date: 'asc' } }))));
app.patch('/api/shifts/:id/confirm', h(async (req, res) => res.json(await prisma.shift.update({ where: { id: pid(req) }, data: { status: 'Confirmado' } }))));

// --- LINKS ---
app.get('/api/links', h(async (req, res) => {
  const links = await prisma.link.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: 'APROVADO' } } } });
  res.json(links.map(l => ({ ...l, approvedCount: l.participations.length, participations: undefined })));
}));
app.post('/api/links', adminOnly, validate(linkSchema), h(async (req, res) => res.status(201).json(await prisma.link.create({ data: req.body, include: { leader: { select: userPublic } } }))));
app.put('/api/links/:id', validate(linkSchema), h(async (req, res) => res.json(await prisma.link.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } }))));
app.delete('/api/links/:id', adminOnly, h(async (req, res) => { await prisma.link.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));
app.get('/api/links/my-participations', h(async (req, res) => res.json(await prisma.linkParticipation.findMany({ where: { userId: req.user!.id }, include: { link: { include: { leader: { select: userPublic } } } } }))));
app.post('/api/links/:id/request', h(async (req, res) => {
  try {
    res.status(201).json(await prisma.linkParticipation.create({ data: { userId: req.user!.id, linkId: pid(req), status: 'PENDENTE' } }));
  } catch { res.status(409).json({ error: 'Você já solicitou participação neste Link.' }); }
}));
app.delete('/api/links/:id/request', h(async (req, res) => { await prisma.linkParticipation.deleteMany({ where: { userId: req.user!.id, linkId: pid(req) } }); res.json({ message: "Cancelado" }); }));
app.get('/api/links/:id/participations', h(async (req, res) => res.json(await prisma.linkParticipation.findMany({ where: { linkId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } }))));
app.patch('/api/links/participations/:id', validate(statusSchema), h(async (req, res) => res.json(await prisma.linkParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } }))));

app.get('/api/links/:id/messages', h(async (req, res) => res.json(await prisma.linkMessage.findMany({ where: { linkId: pid(req) }, include: { author: { select: userPublic } }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] }))));
app.post('/api/links/:id/messages', validate(messageSchema), h(async (req, res) => res.status(201).json(await prisma.linkMessage.create({ data: { content: req.body.content, category: req.body.category, linkId: pid(req), authorId: req.user!.id }, include: { author: { select: userPublic } } }))));
app.delete('/api/links/messages/:id', h(async (req, res) => { await prisma.linkMessage.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); }));
app.patch('/api/links/messages/:id/pin', h(async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: pid(req) } });
  if (!msg) return res.status(404).json({ error: "Mensagem não encontrada" });
  res.json(await prisma.linkMessage.update({ where: { id: pid(req) }, data: { isPinned: !msg.isPinned }, include: { author: { select: userPublic } } }));
}));

// --- LOJA DE RECOMPENSAS ---
app.get('/api/products', h(async (req, res) => res.json(await prisma.product.findMany({ orderBy: { createdAt: 'desc' } }))));
app.post('/api/products', adminOnly, validate(productSchema), h(async (req, res) => res.status(201).json(await prisma.product.create({ data: req.body }))));
app.put('/api/products/:id', adminOnly, validate(productSchema), h(async (req, res) => res.json(await prisma.product.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/products/:id', adminOnly, h(async (req, res) => { await prisma.product.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));

// Resgatar: debita pontos e gera voucher único (transação)
app.post('/api/products/:id/redeem', h(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: pid(req) } });
  if (!product || !product.active) return res.status(404).json({ error: 'Produto indisponível.' });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
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
app.get('/api/redemptions/validate/:code', adminOnly, h(async (req, res) => {
  const r = await prisma.redemption.findUnique({ where: { code: String(req.params.code) }, include: { user: { select: userPublic } } });
  if (!r) return res.status(404).json({ valid: false, error: 'Código não encontrado.' });
  res.json({ valid: r.status === 'ATIVO', redemption: r });
}));

// Marcar voucher como usado (admin)
app.patch('/api/redemptions/:id/use', adminOnly, h(async (req, res) => res.json(await prisma.redemption.update({ where: { id: pid(req) }, data: { status: 'USADO', usedAt: new Date() } }))));

// --- GAMIFICAÇÃO (regras de pontos) ---
app.get('/api/point-rules', h(async (req, res) => res.json(await prisma.pointRule.findMany({ orderBy: { category: 'asc' } }))));
app.post('/api/point-rules', adminOnly, validate(pointRuleSchema), h(async (req, res) => {
  try {
    res.status(201).json(await prisma.pointRule.create({ data: req.body }));
  } catch { res.status(409).json({ error: 'Já existe uma regra com essa chave.' }); }
}));
app.put('/api/point-rules/:id', adminOnly, validate(pointRuleUpdateSchema), h(async (req, res) => res.json(await prisma.pointRule.update({ where: { id: pid(req) }, data: req.body }))));
app.delete('/api/point-rules/:id', adminOnly, h(async (req, res) => { await prisma.pointRule.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); }));

// --- PLANO BÍBLICO ---
// Progresso do usuário + leitura de hoje
app.get('/api/reading/me', h(async (req, res) => {
  const logs = await prisma.readingLog.findMany({ where: { userId: req.user!.id }, orderBy: { day: 'asc' } });
  const day = currentPlanDay();
  res.json({
    count: logs.length,
    todayDay: day,
    todayReference: READING_PLAN[day - 1] || null,
    todayDone: logs.some(l => l.day === day),
    milestones: READING_MILESTONES,
    logs,
  });
}));

// Marcar leitura do dia (foto obrigatória) — credita pontos reais e checa marcos
app.post('/api/reading/check', validate(readingCheckSchema), h(async (req, res) => {
  const day = currentPlanDay();
  const reference = READING_PLAN[day - 1] || `Dia ${day}`;

  const existing = await prisma.readingLog.findUnique({ where: { userId_day: { userId: req.user!.id, day } } });
  if (existing) return res.status(409).json({ error: 'Você já marcou a leitura de hoje.' });

  const log = await prisma.readingLog.create({ data: { userId: req.user!.id, day, reference, photoUrl: req.body.photoUrl } });
  const count = await prisma.readingLog.count({ where: { userId: req.user!.id } });

  const dailyPts = await rulePts('BIBLE_DAILY_READ', 15);
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

  res.status(201).json({ log, count, dailyPts, bonus, milestoneReached, pointsEarned, user });
}));

// ─── Middleware de erro (try/catch central) ────────────────────────────────
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
});

app.listen(port, () => console.log(`✅ Servidor Zion ativo na porta ${port}`));
