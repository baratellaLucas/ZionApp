import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const port = 3000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const MAX_LINKS_PER_PERSON = 2;

// --- SEED ---
app.get('/api/seed', async (req, res) => {
  try {
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

    const adminUser = await prisma.user.create({ data: { name: "Admin Zion", email: "admin@zion.com", password: "123", role: "ADMIN", points: 5000, bibleStreak: 100 } });
    const liderLucas = await prisma.user.create({ data: { name: "Lucas Dias", email: "lucas@zion.com", password: "123", role: "LIDER", points: 2500, bibleStreak: 45 } });
    const liderJoao = await prisma.user.create({ data: { name: "João Silva", email: "joao@zion.com", password: "123", role: "LIDER", points: 1200, bibleStreak: 12 } });

    const linkVox = await prisma.link.create({ data: { name: "Link VOX", day: "Sexta", time: "20:00", leaderId: liderLucas.id, isOnline: true } });
    await prisma.linkParticipation.create({ data: { userId: adminUser.id, linkId: linkVox.id, status: "PENDENTE" } });

    await prisma.event.create({ data: { title: "Culto de Celebração", date: new Date("2026-07-06T10:00:00Z"), location: "Campus RP", type: "GERAL" } });

    const areaKeola = await prisma.area.create({ data: { name: "Keola Coffee", description: "Servir com excelência.", leaderId: liderLucas.id } });
    await prisma.shift.create({ data: { department: "Keola Coffee", date: new Date("2026-07-06T09:00:00Z"), status: "Pendente", volunteerId: adminUser.id, areaId: areaKeola.id } });

    await prisma.publication.create({ data: { content: "Que alegria ver nossa comunidade crescer! 🙌", authorId: adminUser.id } });

    res.json({ message: "Seed executado com sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao popular." });
  }
});

// --- USERS ---
app.get('/api/users', async (req, res) => res.json(await prisma.user.findMany()));
app.get('/api/leaders', async (req, res) => res.json(await prisma.user.findMany({ where: { role: { in: ['LIDER', 'ADMIN'] } } })));
app.put('/api/users/:id', async (req, res) => res.json(await prisma.user.update({ where: { id: req.params.id }, data: { name: req.body.name, profileImage: req.body.profileImage } })));
app.patch('/api/users/:id/role', async (req, res) => res.json(await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role } })));

// --- MURAL DA COMUNIDADE ---
app.get('/api/publications', async (req, res) => res.json(await prisma.publication.findMany({ include: { author: true }, orderBy: { createdAt: 'desc' } })));
app.post('/api/publications', async (req, res) => res.status(201).json(await prisma.publication.create({ data: { content: req.body.content, imageUrl: req.body.imageUrl, documentUrl: req.body.documentUrl, authorId: req.body.authorId }, include: { author: true } })));
app.delete('/api/publications/:id', async (req, res) => { await prisma.publication.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); });

// --- EVENTOS ---
app.get('/api/events', async (req, res) => res.json(await prisma.event.findMany({ orderBy: { date: 'asc' } })));
app.post('/api/events', async (req, res) => res.status(201).json(await prisma.event.create({ data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type } })));
app.put('/api/events/:id', async (req, res) => res.json(await prisma.event.update({ where: { id: req.params.id }, data: { title: req.body.title, date: new Date(req.body.date), location: req.body.location, type: req.body.type } })));
app.delete('/api/events/:id', async (req, res) => { await prisma.event.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); });

// --- COMUNICADOS ---
app.get('/api/announcements', async (req, res) => res.json(await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } })));
app.post('/api/announcements', async (req, res) => res.status(201).json(await prisma.announcement.create({ data: req.body })));
app.put('/api/announcements/:id', async (req, res) => res.json(await prisma.announcement.update({ where: { id: req.params.id }, data: req.body })));
app.delete('/api/announcements/:id', async (req, res) => { await prisma.announcement.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); });

// --- ÁREAS (VOLUNTARIADO) ---
app.get('/api/areas', async (req, res) => {
  const areas = await prisma.area.findMany({ include: { leader: true, participations: { where: { status: 'APROVADO' } } } });
  res.json(areas.map(a => ({ ...a, approvedCount: a.participations.length, participations: undefined })));
});
app.post('/api/areas', async (req, res) => res.status(201).json(await prisma.area.create({ data: req.body, include: { leader: true } })));
app.put('/api/areas/:id', async (req, res) => res.json(await prisma.area.update({ where: { id: req.params.id }, data: req.body, include: { leader: true } })));
app.delete('/api/areas/:id', async (req, res) => { await prisma.area.delete({ where: { id: req.params.id } }); res.json({ message: "Removido" }); });
app.patch('/api/areas/:id/leader', async (req, res) => res.json(await prisma.area.update({ where: { id: req.params.id }, data: { leaderId: req.body.leaderId } })));

// Participações e Escalas
app.get('/api/areas/my-participations', async (req, res) => res.json(await prisma.areaParticipation.findMany({ where: { userId: String(req.query.userId) }, include: { area: { include: { leader: true } } } })));
app.post('/api/areas/:id/request', async (req, res) => res.status(201).json(await prisma.areaParticipation.create({ data: { userId: req.body.userId, areaId: req.params.id, status: 'PENDENTE' } })));
app.delete('/api/areas/:id/request', async (req, res) => { await prisma.areaParticipation.deleteMany({ where: { userId: req.body.userId, areaId: req.params.id } }); res.json({ message: "Cancelado" }); });
app.get('/api/shifts', async (req, res) => res.json(await prisma.shift.findMany({ where: req.query.userId ? { volunteerId: String(req.query.userId) } : undefined, include: { area: true }, orderBy: { date: 'asc' } })));
app.patch('/api/shifts/:id/confirm', async (req, res) => res.json(await prisma.shift.update({ where: { id: req.params.id }, data: { status: 'Confirmado' } })));

// --- LINKS ---
app.get('/api/links', async (req, res) => {
  const links = await prisma.link.findMany({ include: { leader: true, participations: { where: { status: 'APROVADO' } } } });
  res.json(links.map(l => ({ ...l, approvedCount: l.participations.length, participations: undefined })));
});
app.post('/api/links', async (req, res) => res.status(201).json(await prisma.link.create({ data: req.body, include: { leader: true } })));
app.put('/api/links/:id', async (req, res) => res.json(await prisma.link.update({ where: { id: req.params.id }, data: req.body, include: { leader: true } })));
app.delete('/api/links/:id', async (req, res) => { await prisma.link.delete({ where: { id: req.params.id } }); res.json({ message: "Removido" }); });
app.get('/api/links/my-participations', async (req, res) => res.json(await prisma.linkParticipation.findMany({ where: { userId: String(req.query.userId) }, include: { link: { include: { leader: true } } } })));
app.post('/api/links/:id/request', async (req, res) => res.status(201).json(await prisma.linkParticipation.create({ data: { userId: req.body.userId, linkId: req.params.id, status: 'PENDENTE' } })));
app.delete('/api/links/:id/request', async (req, res) => { await prisma.linkParticipation.deleteMany({ where: { userId: req.body.userId, linkId: req.params.id } }); res.json({ message: "Cancelado" }); });

app.get('/api/links/:id/messages', async (req, res) => res.json(await prisma.linkMessage.findMany({ where: { linkId: req.params.id }, include: { author: true }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] })));
app.post('/api/links/:id/messages', async (req, res) => res.status(201).json(await prisma.linkMessage.create({ data: req.body, include: { author: true } })));
app.delete('/api/links/messages/:id', async (req, res) => { await prisma.linkMessage.delete({ where: { id: req.params.id } }); res.json({ message: "Deletado" }); });
app.patch('/api/links/messages/:id/pin', async (req, res) => {
  const msg = await prisma.linkMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: "Mensagem não encontrada" });
  res.json(await prisma.linkMessage.update({ where: { id: req.params.id }, data: { isPinned: !msg.isPinned }, include: { author: true } }));
});

app.listen(port, () => console.log(`✅ Servidor Zion ativo na porta ${port}`));