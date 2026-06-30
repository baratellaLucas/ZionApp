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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3000;
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
const MAX_LINKS_PER_PERSON = 2;
// --- SEED ---
app.get('/api/seed', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
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
        const adminUser = yield prisma.user.create({ data: { name: "Admin Zion", email: "admin@zion.com", password: "123", role: "ADMIN", points: 5000, bibleStreak: 100 } });
        const liderLucas = yield prisma.user.create({ data: { name: "Lucas Dias", email: "lucas@zion.com", password: "123", role: "LIDER", points: 2500, bibleStreak: 45 } });
        const liderJoao = yield prisma.user.create({ data: { name: "João Silva", email: "joao@zion.com", password: "123", role: "LIDER", points: 1200, bibleStreak: 12 } });
        const linkVox = yield prisma.link.create({ data: { name: "Link VOX", day: "Sexta", time: "20:00", leaderId: liderLucas.id, isOnline: true } });
        yield prisma.linkParticipation.create({ data: { userId: adminUser.id, linkId: linkVox.id, status: "PENDENTE" } });
        yield prisma.event.create({ data: { title: "Culto de Celebração", date: new Date("2026-07-06T10:00:00Z"), location: "Campus RP", type: "GERAL" } });
        const areaKeola = yield prisma.area.create({ data: { name: "Keola Coffee", description: "Servir com excelência.", leaderId: liderLucas.id } });
        yield prisma.shift.create({ data: { department: "Keola Coffee", date: new Date("2026-07-06T09:00:00Z"), status: "Pendente", volunteerId: adminUser.id, areaId: areaKeola.id } });
        yield prisma.publication.create({ data: { content: "Que alegria ver nossa comunidade crescer! 🙌", authorId: adminUser.id } });
        res.json({ message: "Seed executado com sucesso!" });
    }
    catch (error) {
        res.status(500).json({ error: "Erro ao popular." });
    }
}));
// --- USERS ---
app.get('/api/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.findMany()); }));
app.get('/api/leaders', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.findMany({ where: { role: { in: ['LIDER', 'ADMIN'] } } })); }));
app.put('/api/users/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.update({ where: { id: req.params.id }, data: { name: req.body.name, profileImage: req.body.profileImage } })); }));
app.patch('/api/users/:id/role', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role } })); }));
// --- MURAL DA COMUNIDADE ---
app.get('/api/publications', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.publication.findMany({ include: { author: true }, orderBy: { createdAt: 'desc' } })); }));
app.post('/api/publications', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.publication.create({ data: { content: req.body.content, imageUrl: req.body.imageUrl, documentUrl: req.body.documentUrl, authorId: req.body.authorId }, include: { author: true } })); }));
app.delete('/api/publications/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.publication.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); }));
// --- EVENTOS ---
app.get('/api/events', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.event.findMany({ orderBy: { date: 'asc' } })); }));
app.post('/api/events', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.event.create({ data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type } })); }));
app.put('/api/events/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.event.update({ where: { id: req.params.id }, data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type } })); }));
app.delete('/api/events/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.event.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); }));
// --- COMUNICADOS ---
app.get('/api/announcements', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.announcement.findMany({ where: req.query.type ? { type: String(req.query.type) } : undefined, orderBy: { createdAt: 'desc' } })); }));
app.post('/api/announcements', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.announcement.create({ data: req.body })); }));
app.put('/api/announcements/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.announcement.update({ where: { id: req.params.id }, data: req.body })); }));
app.delete('/api/announcements/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.announcement.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); }));
// --- ÁREAS (VOLUNTARIADO) ---
app.get('/api/areas', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const areas = yield prisma.area.findMany({ include: { leader: true, participations: { where: { status: 'APROVADO' } } } });
    res.json(areas.map(a => (Object.assign(Object.assign({}, a), { approvedCount: a.participations.length, participations: undefined }))));
}));
app.post('/api/areas', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.area.create({ data: req.body, include: { leader: true } })); }));
app.put('/api/areas/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.area.update({ where: { id: req.params.id }, data: req.body, include: { leader: true } })); }));
app.delete('/api/areas/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.area.delete({ where: { id: req.params.id } }); res.json({ message: "Removido" }); }));
app.patch('/api/areas/:id/leader', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.area.update({ where: { id: req.params.id }, data: { leaderId: req.body.leaderId } })); }));
// Participações e Escalas
app.get('/api/areas/my-participations', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.areaParticipation.findMany({ where: { userId: String(req.query.userId) }, include: { area: { include: { leader: true } } } })); }));
app.post('/api/areas/:id/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.status(201).json(yield prisma.areaParticipation.create({ data: { userId: req.body.userId, areaId: req.params.id, status: 'PENDENTE' } }));
    }
    catch (e) {
        res.status(409).json({ error: 'Você já solicitou participação nesta área.' });
    }
}));
app.delete('/api/areas/:id/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.areaParticipation.deleteMany({ where: { userId: req.body.userId, areaId: req.params.id } }); res.json({ message: "Cancelado" }); }));
// Lista todas as participações de uma área (líder: ver membros e pedidos)
app.get('/api/areas/:id/participations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.json(yield prisma.areaParticipation.findMany({ where: { areaId: req.params.id }, include: { user: true }, orderBy: { createdAt: 'asc' } }));
    }
    catch (e) {
        res.status(500).json({ error: 'Erro ao listar participações.' });
    }
}));
// Aprovar / recusar participação em área
app.patch('/api/areas/participations/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.json(yield prisma.areaParticipation.update({ where: { id: req.params.id }, data: { status: req.body.status }, include: { user: true } }));
    }
    catch (e) {
        res.status(404).json({ error: 'Participação não encontrada.' });
    }
}));
app.get('/api/shifts', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.shift.findMany({ where: req.query.userId ? { volunteerId: String(req.query.userId) } : undefined, include: { area: true }, orderBy: { date: 'asc' } })); }));
app.patch('/api/shifts/:id/confirm', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.shift.update({ where: { id: req.params.id }, data: { status: 'Confirmado' } })); }));
// --- LINKS ---
app.get('/api/links', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const links = yield prisma.link.findMany({ include: { leader: true, participations: { where: { status: 'APROVADO' } } } });
    res.json(links.map(l => (Object.assign(Object.assign({}, l), { approvedCount: l.participations.length, participations: undefined }))));
}));
app.post('/api/links', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.link.create({ data: req.body, include: { leader: true } })); }));
app.put('/api/links/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.link.update({ where: { id: req.params.id }, data: req.body, include: { leader: true } })); }));
app.delete('/api/links/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.link.delete({ where: { id: req.params.id } }); res.json({ message: "Removido" }); }));
app.get('/api/links/my-participations', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkParticipation.findMany({ where: { userId: String(req.query.userId) }, include: { link: { include: { leader: true } } } })); }));
app.post('/api/links/:id/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.status(201).json(yield prisma.linkParticipation.create({ data: { userId: req.body.userId, linkId: req.params.id, status: 'PENDENTE' } }));
    }
    catch (e) {
        res.status(409).json({ error: 'Você já solicitou participação neste Link.' });
    }
}));
app.delete('/api/links/:id/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.linkParticipation.deleteMany({ where: { userId: req.body.userId, linkId: req.params.id } }); res.json({ message: "Cancelado" }); }));
// Lista todas as participações de um link (líder: ver membros e pedidos)
app.get('/api/links/:id/participations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.json(yield prisma.linkParticipation.findMany({ where: { linkId: req.params.id }, include: { user: true }, orderBy: { createdAt: 'asc' } }));
    }
    catch (e) {
        res.status(500).json({ error: 'Erro ao listar participações.' });
    }
}));
// Aprovar / recusar participação em link
app.patch('/api/links/participations/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.json(yield prisma.linkParticipation.update({ where: { id: req.params.id }, data: { status: req.body.status }, include: { user: true } }));
    }
    catch (e) {
        res.status(404).json({ error: 'Participação não encontrada.' });
    }
}));
app.get('/api/links/:id/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(yield prisma.linkMessage.findMany({ where: { linkId: req.params.id }, include: { author: true }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] })); }));
app.post('/api/links/:id/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(201).json(yield prisma.linkMessage.create({ data: req.body, include: { author: true } })); }));
app.delete('/api/links/messages/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () { yield prisma.linkMessage.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); }));
app.patch('/api/links/messages/:id/pin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const msg = yield prisma.linkMessage.findUnique({ where: { id: req.params.id } });
    if (!msg)
        return res.status(404).json({ error: "Mensagem não encontrada" });
    res.json(yield prisma.linkMessage.update({ where: { id: req.params.id }, data: { isPinned: !msg.isPinned }, include: { author: true } }));
}));
app.listen(port, () => console.log(`✅ Servidor Zion ativo na porta ${port}`));
