"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3000;
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'zion-dev-secret-change-me';
const SEED_KEY = process.env.SEED_KEY || 'zion-dev-seed';
const TOKEN_TTL = '7d';
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
// Campos públicos do usuário (NUNCA expõe password)
const userPublic = {
    id: true, name: true, email: true, role: true, campus: true,
    points: true, bibleStreak: true, profileImage: true, createdAt: true, updatedAt: true,
};
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Param de rota :id sempre como string (o tipo do Express é string | string[])
const pid = (req) => String(req.params.id);
class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const signToken = (user) => jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
const auth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!(header === null || header === void 0 ? void 0 : header.startsWith('Bearer ')))
        return res.status(401).json({ error: 'Não autenticado.' });
    try {
        req.user = jsonwebtoken_1.default.verify(header.slice(7), JWT_SECRET);
        next();
    }
    catch (_a) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
};
const adminOnly = (req, res, next) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'ADMIN' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' }); };
// ─── Validação (Zod) ─────────────────────────────────────────────────────
const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: 'Dados inválidos.', issues: result.error.issues });
    }
    req.body = result.data;
    next();
};
const loginSchema = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1) });
const userUpdateSchema = zod_1.z.object({ name: zod_1.z.string().min(1).optional(), profileImage: zod_1.z.string().nullable().optional() });
const roleSchema = zod_1.z.object({ role: zod_1.z.enum(['MEMBRO', 'VOLUNTARIO', 'LIDER', 'ADMIN']) });
const publicationSchema = zod_1.z.object({ content: zod_1.z.string().min(1), imageUrl: zod_1.z.string().optional(), documentUrl: zod_1.z.string().optional() });
const eventSchema = zod_1.z.object({ title: zod_1.z.string().min(1), date: zod_1.z.string().min(1), location: zod_1.z.string().optional(), type: zod_1.z.string().optional(), recurrence: zod_1.z.enum(['NONE', 'WEEKLY', 'MONTHLY']).optional() });
const announcementSchema = zod_1.z.object({ title: zod_1.z.string().min(1), content: zod_1.z.string().min(1), type: zod_1.z.string().optional() });
const areaSchema = zod_1.z.object({ name: zod_1.z.string().min(1), description: zod_1.z.string().optional().nullable(), leaderId: zod_1.z.string().min(1) });
const linkSchema = zod_1.z.object({
    name: zod_1.z.string().min(1), day: zod_1.z.string().min(1), time: zod_1.z.string().min(1),
    isOnline: zod_1.z.boolean().optional(), locationUrl: zod_1.z.string().optional().nullable(),
    description: zod_1.z.string().optional().nullable(), leaderId: zod_1.z.string().min(1),
});
const leaderPatchSchema = zod_1.z.object({ leaderId: zod_1.z.string().min(1) });
const statusSchema = zod_1.z.object({ status: zod_1.z.string().min(1) });
const messageSchema = zod_1.z.object({ content: zod_1.z.string().min(1), category: zod_1.z.string().optional() });
// ════════════════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS (sem auth)
// ════════════════════════════════════════════════════════════════════════
// --- LOGIN ---
app.post('/api/auth/login', validate(loginSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user)
        return res.status(401).json({ error: 'Credenciais inválidas.' });
    const ok = yield bcryptjs_1.default.compare(req.body.password, user.password);
    if (!ok)
        return res.status(401).json({ error: 'Credenciais inválidas.' });
    const { password } = user, safe = __rest(user, ["password"]);
    res.json({ token: signToken(user), user: safe });
})));
// --- SEED (protegido por chave; recria dados e hasheia senhas) ---
app.post('/api/seed', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const key = req.headers['x-seed-key'] || req.query.key;
    if (key !== SEED_KEY)
        return res.status(403).json({ error: 'Seed protegido. Forneça x-seed-key.' });
    yield prisma.publication.deleteMany();
    yield prisma.areaParticipation.deleteMany();
    yield prisma.shift.deleteMany();
    yield prisma.area.deleteMany();
    yield prisma.linkParticipation.deleteMany();
    yield prisma.linkMessage.deleteMany();
    yield prisma.event.deleteMany();
    yield prisma.link.deleteMany();
    yield prisma.announcement.deleteMany();
    yield prisma.user.deleteMany();
    const pass = yield bcryptjs_1.default.hash('123', 10);
    const adminUser = yield prisma.user.create({ data: { name: "Admin Zion", email: "admin@zion.com", password: pass, role: "ADMIN", points: 5000, bibleStreak: 100 } });
    const liderLucas = yield prisma.user.create({ data: { name: "Lucas Dias", email: "lucas@zion.com", password: pass, role: "LIDER", points: 2500, bibleStreak: 45 } });
    yield prisma.user.create({ data: { name: "João Silva", email: "joao@zion.com", password: pass, role: "LIDER", points: 1200, bibleStreak: 12 } });
    const linkVox = yield prisma.link.create({ data: { name: "Link VOX", day: "Sexta", time: "20:00", leaderId: liderLucas.id, isOnline: true } });
    yield prisma.linkParticipation.create({ data: { userId: adminUser.id, linkId: linkVox.id, status: "PENDENTE" } });
    yield prisma.event.create({ data: { title: "Culto de Celebração", date: new Date("2026-07-06T10:00:00Z"), location: "Campus RP", type: "GERAL" } });
    const areaKeola = yield prisma.area.create({ data: { name: "Keola Coffee", description: "Servir com excelência.", leaderId: liderLucas.id } });
    yield prisma.shift.create({ data: { department: "Keola Coffee", date: new Date("2026-07-06T09:00:00Z"), status: "Pendente", volunteerId: adminUser.id, areaId: areaKeola.id } });
    yield prisma.publication.create({ data: { content: "Que alegria ver nossa comunidade crescer! 🙌", authorId: adminUser.id } });
    res.json({ message: "Seed executado com sucesso! Senha padrão: 123" });
})));
// ════════════════════════════════════════════════════════════════════════
// A PARTIR DAQUI: TUDO EXIGE AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════════════════
app.use(auth);
// --- AUTH (sessão) ---
app.get('/api/auth/me', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma.user.findUnique({ where: { id: req.user.id }, select: userPublic });
    if (!user)
        return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(user);
})));
// Impersonação (Modo de Teste) — apenas ADMIN gera token de outro usuário
app.post('/api/auth/impersonate/:id', adminOnly, h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const target = yield prisma.user.findUnique({ where: { id: pid(req) }, select: userPublic });
    if (!target)
        return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ token: signToken({ id: target.id, role: target.role }), user: target });
})));
// --- USERS ---
app.get('/api/users', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.findMany({ select: userPublic })); })));
app.get('/api/leaders', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.findMany({ where: { role: { in: ['LIDER', 'ADMIN'] } }, select: userPublic })); })));
app.put('/api/users/:id', validate(userUpdateSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.user.id !== pid(req) && req.user.role !== 'ADMIN')
        throw new HttpError(403, 'Você só pode editar o próprio perfil.');
    res.json(yield prisma.user.update({ where: { id: pid(req) }, data: { name: req.body.name, profileImage: req.body.profileImage }, select: userPublic }));
})));
app.patch('/api/users/:id/role', adminOnly, validate(roleSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.update({ where: { id: pid(req) }, data: { role: req.body.role }, select: userPublic })); })));
// --- MURAL DA COMUNIDADE ---
app.get('/api/publications', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.publication.findMany({ include: { author: { select: userPublic } }, orderBy: { createdAt: 'desc' } })); })));
app.post('/api/publications', validate(publicationSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.publication.create({ data: { content: req.body.content, imageUrl: req.body.imageUrl, documentUrl: req.body.documentUrl, authorId: req.user.id }, include: { author: { select: userPublic } } })); })));
app.delete('/api/publications/:id', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.publication.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); })));
// --- EVENTOS ---
app.get('/api/events', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.event.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { date: 'asc' } })); })));
app.post('/api/events', adminOnly, validate(eventSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.event.create({ data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence } })); })));
app.put('/api/events/:id', adminOnly, validate(eventSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.event.update({ where: { id: pid(req) }, data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type, recurrence: req.body.recurrence } })); })));
app.delete('/api/events/:id', adminOnly, h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.event.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); })));
// --- COMUNICADOS ---
app.get('/api/announcements', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.announcement.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { createdAt: 'desc' } })); })));
app.post('/api/announcements', adminOnly, validate(announcementSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.announcement.create({ data: req.body })); })));
app.put('/api/announcements/:id', adminOnly, validate(announcementSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.announcement.update({ where: { id: pid(req) }, data: req.body })); })));
app.delete('/api/announcements/:id', adminOnly, h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.announcement.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); })));
// --- ÁREAS (VOLUNTARIADO) ---
app.get('/api/areas', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const areas = yield prisma.area.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: 'APROVADO' } } } });
    res.json(areas.map(a => (Object.assign(Object.assign({}, a), { approvedCount: a.participations.length, participations: undefined }))));
})));
app.post('/api/areas', adminOnly, validate(areaSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.area.create({ data: req.body, include: { leader: { select: userPublic } } })); })));
app.put('/api/areas/:id', adminOnly, validate(areaSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.area.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } })); })));
app.delete('/api/areas/:id', adminOnly, h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.area.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); })));
app.patch('/api/areas/:id/leader', adminOnly, validate(leaderPatchSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.area.update({ where: { id: pid(req) }, data: { leaderId: req.body.leaderId } })); })));
// Participações e Escalas (userId vem do token)
app.get('/api/areas/my-participations', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.areaParticipation.findMany({ where: { userId: req.user.id }, include: { area: { include: { leader: { select: userPublic } } } } })); })));
app.post('/api/areas/:id/request', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.status(201).json(yield prisma.areaParticipation.create({ data: { userId: req.user.id, areaId: pid(req), status: 'PENDENTE' } }));
    }
    catch (_a) {
        res.status(409).json({ error: 'Você já solicitou participação nesta área.' });
    }
})));
app.delete('/api/areas/:id/request', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.areaParticipation.deleteMany({ where: { userId: req.user.id, areaId: pid(req) } }); res.json({ message: "Cancelado" }); })));
app.get('/api/areas/:id/participations', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.areaParticipation.findMany({ where: { areaId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } })); })));
app.patch('/api/areas/participations/:id', validate(statusSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.areaParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } })); })));
app.get('/api/shifts', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.shift.findMany({ where: { volunteerId: req.user.id }, include: { area: true }, orderBy: { date: 'asc' } })); })));
app.patch('/api/shifts/:id/confirm', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.shift.update({ where: { id: pid(req) }, data: { status: 'Confirmado' } })); })));
// --- LINKS ---
app.get('/api/links', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const links = yield prisma.link.findMany({ include: { leader: { select: userPublic }, participations: { where: { status: 'APROVADO' } } } });
    res.json(links.map(l => (Object.assign(Object.assign({}, l), { approvedCount: l.participations.length, participations: undefined }))));
})));
app.post('/api/links', adminOnly, validate(linkSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.link.create({ data: req.body, include: { leader: { select: userPublic } } })); })));
app.put('/api/links/:id', validate(linkSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.link.update({ where: { id: pid(req) }, data: req.body, include: { leader: { select: userPublic } } })); })));
app.delete('/api/links/:id', adminOnly, h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.link.delete({ where: { id: pid(req) } }); res.json({ message: "Removido" }); })));
app.get('/api/links/my-participations', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkParticipation.findMany({ where: { userId: req.user.id }, include: { link: { include: { leader: { select: userPublic } } } } })); })));
app.post('/api/links/:id/request', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.status(201).json(yield prisma.linkParticipation.create({ data: { userId: req.user.id, linkId: pid(req), status: 'PENDENTE' } }));
    }
    catch (_a) {
        res.status(409).json({ error: 'Você já solicitou participação neste Link.' });
    }
})));
app.delete('/api/links/:id/request', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.linkParticipation.deleteMany({ where: { userId: req.user.id, linkId: pid(req) } }); res.json({ message: "Cancelado" }); })));
app.get('/api/links/:id/participations', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkParticipation.findMany({ where: { linkId: pid(req) }, include: { user: { select: userPublic } }, orderBy: { createdAt: 'asc' } })); })));
app.patch('/api/links/participations/:id', validate(statusSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkParticipation.update({ where: { id: pid(req) }, data: { status: req.body.status }, include: { user: { select: userPublic } } })); })));
app.get('/api/links/:id/messages', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkMessage.findMany({ where: { linkId: pid(req) }, include: { author: { select: userPublic } }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] })); })));
app.post('/api/links/:id/messages', validate(messageSchema), h((req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.linkMessage.create({ data: { content: req.body.content, category: req.body.category, linkId: pid(req), authorId: req.user.id }, include: { author: { select: userPublic } } })); })));
app.delete('/api/links/messages/:id', h((req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.linkMessage.delete({ where: { id: pid(req) } }); res.json({ message: "Deletado" }); })));
app.patch('/api/links/messages/:id/pin', h((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const msg = yield prisma.linkMessage.findUnique({ where: { id: pid(req) } });
    if (!msg)
        return res.status(404).json({ error: "Mensagem não encontrada" });
    res.json(yield prisma.linkMessage.update({ where: { id: pid(req) }, data: { isPinned: !msg.isPinned }, include: { author: { select: userPublic } } }));
})));
// ─── Middleware de erro (try/catch central) ────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
});
app.listen(port, () => console.log(`✅ Servidor Zion ativo na porta ${port}`));
