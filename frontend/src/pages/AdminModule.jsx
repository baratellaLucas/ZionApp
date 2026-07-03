import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { compressImage, fileToDataUrl } from '../utils/image';
import { ShieldCheck, Plus, Trash2, Edit3, Save, X, Calendar, Megaphone, Link as LinkIcon, MessageSquare, AlertTriangle, Users, Eye, Briefcase, Gift, Ticket, Tag, CheckCircle, Zap, BarChart3, BookOpen, Award, QrCode, Bug } from 'lucide-react';

// Locais pré-definidos para eventos (menu de seleção); "Outro" libera um campo de texto livre.
const EVENT_LOCATIONS = ['Templo Principal', 'Auditório', 'Sala de Reuniões', 'Keola Coffee', 'Área Externa', 'Online', 'A definir'];

const AdminModule = ({ user, showNotification, handleSimulateUser }) => {
  const [activeTab, setActiveTab] = useState('painel');
  
  const [allUsers, setAllUsers] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [links, setLinks] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [publications, setPublications] = useState([]);
  const [areas, setAreas] = useState([]);
  const [products, setProducts] = useState([]);
  const [pointRules, setPointRules] = useState([]);
  const [stats, setStats] = useState(null);
  const [qrEvent, setQrEvent] = useState(null); // { event, code } para o modal de QR

  const [isLoading, setIsLoading] = useState(true);

  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, type: '', id: null, title: '' });

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showAnnForm, setShowAnnForm] = useState(false);
  const [showPubForm, setShowPubForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);

  const [editingLinkId, setEditingLinkId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingAnnId, setEditingAnnId] = useState(null);
  const [editingAreaId, setEditingAreaId] = useState(null);

  const [linkData, setLinkData] = useState({ name: '', day: 'Sexta', time: '20:00', leaderId: '', isOnline: false, locationUrl: '', description: '' });
  const [annData, setAnnData] = useState({ title: '', content: '', type: 'GERAL' });
  const [pubData, setPubData] = useState({ content: '', imageUrl: '', documentUrl: '' });
  const [areaData, setAreaData] = useState({ name: '', description: '', leaderId: '' });
  
  const [eventDateStr, setEventDateStr] = useState(''); // formato nativo YYYY-MM-DD
  const [eventTimeStr, setEventTimeStr] = useState('');
  const [eventCommonData, setEventCommonData] = useState({ title: '', location: '', type: 'GERAL', recurrence: 'NONE' });
  const [eventLocationCustom, setEventLocationCustom] = useState(false); // true = campo "Outro" (texto livre)

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productData, setProductData] = useState({ name: '', category: 'Livros', description: '', cost: 100, imageUrl: '', active: true });
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherResult, setVoucherResult] = useState(null); // { valid, redemption, error }

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleData, setRuleData] = useState({ key: '', label: '', description: '', category: 'Geral', points: 10, active: true });

  // Permissões por cargo (aba Cargos)
  const [permData, setPermData] = useState(null); // { roles, permissions }
  const [permSaving, setPermSaving] = useState(false);
  const ROLE_LABEL = { MEMBRO: 'Membro', VOLUNTARIO: 'Voluntário', AUXILIAR_LIDER: 'Aux. Líder', LIDER: 'Líder', PASTOR: 'Pastor', ADMIN: 'Admin' };
  const LOCKED_ROLE = (role) => role === 'ADMIN' || role === 'PASTOR'; // colunas de acesso total na matriz

  const loadPermissions = async () => {
    try {
      const res = await apiFetch('/api/permissions');
      if (res.ok) setPermData(await res.json());
    } catch { /* offline */ }
  };
  useEffect(() => { if (activeTab === 'cargos' && !permData) loadPermissions(); }, [activeTab]);

  // Reportes de bug (aba Bugs)
  const [bugReports, setBugReports] = useState([]);
  const loadBugs = async () => {
    try { const res = await apiFetch('/api/bug-reports'); if (res.ok) setBugReports(await res.json()); } catch { /* offline */ }
  };
  // Recarrega ao abrir a aba e faz polling leve enquanto ela estiver ativa (novos reportes aparecem sozinhos)
  useEffect(() => {
    if (activeTab !== 'bugs') return;
    loadBugs();
    const t = setInterval(loadBugs, 10000);
    return () => clearInterval(t);
  }, [activeTab]);

  const toggleBugStatus = async (id) => {
    try {
      const res = await apiFetch(`/api/bug-reports/${id}`, { method: 'PATCH' });
      if (res.ok) { const b = await res.json(); setBugReports(prev => prev.map(x => x.id === id ? { ...x, status: b.status } : x)); }
    } catch { showNotification('Falha ao atualizar status.'); }
  };

  const togglePerm = (permKey, role) => {
    setPermData(prev => ({
      ...prev,
      permissions: prev.permissions.map(p => p.key === permKey ? { ...p, matrix: { ...p.matrix, [role]: !p.matrix[role] } } : p),
    }));
  };

  const savePermissions = async () => {
    if (!permData) return;
    setPermSaving(true);
    const changes = [];
    for (const p of permData.permissions)
      for (const role of permData.roles)
        if (!LOCKED_ROLE(role)) changes.push({ role, permKey: p.key, allowed: !!p.matrix[role] });
    try {
      const res = await apiFetch('/api/permissions', { method: 'PUT', body: { changes } });
      if (res.ok) showNotification('Permissões salvas!');
      else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Falha ao salvar permissões.'); }
    } catch { showNotification('Falha de rede ao salvar permissões.'); }
    finally { setPermSaving(false); }
  };

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      const [resUsers, resLinks, resEvents, resAnn, resPubs, resAreas, resProducts, resRules, resStats] = await Promise.all([
        apiFetch('/api/users').catch(() => null),
        apiFetch('/api/links').catch(() => null),
        apiFetch('/api/events').catch(() => null),
        apiFetch('/api/announcements').catch(() => null),
        apiFetch('/api/publications').catch(() => null),
        apiFetch('/api/areas').catch(() => null),
        apiFetch('/api/products').catch(() => null),
        apiFetch('/api/point-rules').catch(() => null),
        apiFetch('/api/admin/stats').catch(() => null)
      ]);

      if (resUsers?.ok) {
        const u = await resUsers.json();
        setAllUsers(u);
        const l = u.filter(usr => ['LIDER', 'PASTOR', 'ADMIN'].includes(usr.role));
        setLeaders(l);
        if (l.length > 0) setLinkData(p => ({ ...p, leaderId: l[0].id }));
      }
      if (resLinks?.ok) setLinks(await resLinks.json());
      if (resEvents?.ok) setEvents(await resEvents.json());
      if (resAnn?.ok) setAnnouncements(await resAnn.json());
      if (resPubs?.ok) setPublications(await resPubs.json());
      if (resAreas?.ok) setAreas(await resAreas.json());
      if (resProducts?.ok) setProducts(await resProducts.json());
      if (resRules?.ok) setPointRules(await resRules.json());
      if (resStats?.ok) setStats(await resStats.json());

    } catch (e) {} finally { setIsLoading(false); }
  };

  useEffect(() => { fetchAdminData(); }, []);

  const formatDatePT = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const executeConfirmDelete = async () => {
    const { type, id } = deleteConfirm;
    try {
      await apiFetch(`/api/${type}/${id}`, { method: 'DELETE' }).catch(() => null);
      if (type === 'links') setLinks(links.filter(i => i.id !== id));
      if (type === 'events') setEvents(events.filter(i => i.id !== id));
      if (type === 'announcements') setAnnouncements(announcements.filter(i => i.id !== id));
      if (type === 'publications') setPublications(publications.filter(i => i.id !== id));
      if (type === 'areas') setAreas(areas.filter(i => i.id !== id));
      if (type === 'products') setProducts(products.filter(i => i.id !== id));
      if (type === 'point-rules') setPointRules(pointRules.filter(i => i.id !== id));
      showNotification("Removido com sucesso.");
    } catch (e) {
      if (type === 'links') setLinks(links.filter(i => i.id !== id));
      if (type === 'events') setEvents(events.filter(i => i.id !== id));
      if (type === 'announcements') setAnnouncements(announcements.filter(i => i.id !== id));
      if (type === 'publications') setPublications(publications.filter(i => i.id !== id));
      if (type === 'areas') setAreas(areas.filter(i => i.id !== id));
      if (type === 'products') setProducts(products.filter(i => i.id !== id));
      if (type === 'point-rules') setPointRules(pointRules.filter(i => i.id !== id));
      showNotification("Removido (Offline).");
    } finally {
      setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' });
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await apiFetch(`/api/users/${userId}/role`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setAllUsers(allUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
        if (['LIDER', 'PASTOR', 'ADMIN'].includes(newRole)) {
          if (!leaders.find(l => l.id === userId)) {
            const updatedUser = allUsers.find(u => u.id === userId);
            setLeaders([...leaders, { ...updatedUser, role: newRole }]);
          }
        } else {
          setLeaders(leaders.filter(l => l.id !== userId));
        }
        showNotification("Acesso atualizado!");
      }
    } catch (e) {
      setAllUsers(allUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showNotification("Acesso atualizado (Offline)!");
    }
  };

  const handleRedeemFlagToggle = async (userId, canRedeem) => {
    try {
      const res = await apiFetch(`/api/users/${userId}/redeem-flag`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canRedeem })
      });
      if (res.ok) {
        setAllUsers(allUsers.map(u => u.id === userId ? { ...u, canRedeem } : u));
        showNotification(canRedeem ? 'Membro liberado como atendente (valida vouchers)!' : 'Acesso de atendente removido.');
      }
    } catch (e) {
      setAllUsers(allUsers.map(u => u.id === userId ? { ...u, canRedeem } : u));
      showNotification('Ação registrada (Offline).');
    }
  };

  // Acesso administrativo por módulo (Links, Áreas ou Loja) sem precisar do cargo Admin/Pastor
  const MODULE_FLAG_FIELD = { links: 'canManageLinks', areas: 'canManageAreas', store: 'canManageStore' };
  const handleModuleAccessToggle = async (userId, moduleKey, value) => {
    const field = MODULE_FLAG_FIELD[moduleKey];
    try {
      const res = await apiFetch(`/api/users/${userId}/module-access`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: moduleKey, value })
      });
      if (res.ok) {
        setAllUsers(allUsers.map(u => u.id === userId ? { ...u, [field]: value } : u));
        showNotification(value ? 'Acesso administrativo concedido!' : 'Acesso administrativo removido.');
      }
    } catch (e) {
      setAllUsers(allUsers.map(u => u.id === userId ? { ...u, [field]: value } : u));
      showNotification('Ação registrada (Offline).');
    }
  };

  const handleSaveLink = async (e) => {
    e.preventDefault();
    const method = editingLinkId ? 'PUT' : 'POST';
    const url = editingLinkId ? `/api/links/${editingLinkId}` : '/api/links';
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(linkData) });
      if (res.ok) {
        const saved = await res.json();
        setLinks(editingLinkId ? links.map(l => l.id === editingLinkId ? saved : l) : [...links, saved]);
        setShowLinkForm(false); setEditingLinkId(null); showNotification(editingLinkId ? 'Link Editado!' : 'Link Criado!');
      } else throw new Error('offline');
    } catch (e) {
      const newL = { id: editingLinkId || Date.now().toString(), ...linkData, leader: leaders.find(l => l.id === linkData.leaderId) };
      setLinks(editingLinkId ? links.map(l => l.id === editingLinkId ? newL : l) : [...links, newL]);
      setShowLinkForm(false); setEditingLinkId(null); showNotification("Ação salva (Offline)!");
    }
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!eventDateStr || !eventTimeStr) return showNotification("Informe a data e o horário do evento.");
    const local = new Date(`${eventDateStr}T${eventTimeStr}`);
    if (isNaN(local)) return showNotification("Data ou horário inválido.");
    const payload = { ...eventCommonData, date: local.toISOString() };
    const method = editingEventId ? 'PUT' : 'POST';
    const url = editingEventId ? `/api/events/${editingEventId}` : '/api/events';
    
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const saved = await res.json();
        setEvents(editingEventId ? events.map(ev => ev.id === editingEventId ? saved : ev) : [...events, saved].sort((a,b)=>new Date(a.date)-new Date(b.date)));
        setShowEventForm(false); setEditingEventId(null); showNotification('Evento salvo!');
      } else throw new Error('offline');
    } catch (e) {
      const fallback = { id: editingEventId || Date.now().toString(), ...payload };
      setEvents(editingEventId ? events.map(ev => ev.id === editingEventId ? fallback : ev) : [...events, fallback].sort((a,b)=>new Date(a.date)-new Date(b.date)));
      setShowEventForm(false); setEditingEventId(null); showNotification('Evento salvo (Offline)!');
    }
  };

  const openEditEvent = (ev) => {
    setEditingEventId(ev.id);
    const d = new Date(ev.date);
    const p = (n) => String(n).padStart(2, '0');
    setEventDateStr(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    setEventTimeStr(`${p(d.getHours())}:${p(d.getMinutes())}`);
    setEventCommonData({ title: ev.title, location: ev.location || '', type: ev.type, recurrence: ev.recurrence || 'NONE' });
    setEventLocationCustom(!!ev.location && !EVENT_LOCATIONS.includes(ev.location));
    setShowEventForm(true);
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    const method = editingAnnId ? 'PUT' : 'POST';
    const url = editingAnnId ? `/api/announcements/${editingAnnId}` : '/api/announcements';
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(annData) });
      if (res.ok) {
        const saved = await res.json();
        setAnnouncements(editingAnnId ? announcements.map(a => a.id === editingAnnId ? saved : a) : [saved, ...announcements]);
        setShowAnnForm(false); setEditingAnnId(null); showNotification("Comunicado salvo!");
      } else throw new Error('offline');
    } catch (e) {
      const saved = { id: editingAnnId || Date.now().toString(), ...annData, createdAt: new Date().toISOString() };
      setAnnouncements(editingAnnId ? announcements.map(a => a.id === editingAnnId ? saved : a) : [saved, ...announcements]);
      setShowAnnForm(false); setEditingAnnId(null); showNotification("Comunicado salvo (Offline)!");
    }
  };

  const handleSavePublication = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    try {
      const res = await apiFetch('/api/publications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pubData)
      });
      if (res.ok) {
        setPublications([await res.json(), ...publications]);
        setShowPubForm(false); setPubData({ content: '', imageUrl: '', documentUrl: '' });
        showNotification("Publicação salva. Acesse Início para ver.");
      } else throw new Error("Offline");
    } catch (e) {
      const newPub = { id: Date.now().toString(), ...pubData, author: { name: user.name }, createdAt: new Date().toISOString() };
      setPublications([newPub, ...publications]);
      setShowPubForm(false); setPubData({ content: '', imageUrl: '', documentUrl: '' });
      showNotification("Publicação enviada (Offline).");
    }
  };

  const handleSaveArea = async (e) => {
    e.preventDefault();
    const method = editingAreaId ? 'PUT' : 'POST';
    const url = editingAreaId ? `/api/areas/${editingAreaId}` : '/api/areas';
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(areaData) });
      if (res.ok) {
        const saved = await res.json();
        setAreas(editingAreaId ? areas.map(a => a.id === editingAreaId ? saved : a) : [...areas, saved]);
        setShowAreaForm(false); setEditingAreaId(null); showNotification("Área salva com sucesso!");
      } else throw new Error();
    } catch (e) {
      const newA = { id: editingAreaId || Date.now().toString(), ...areaData, leader: leaders.find(l => l.id === areaData.leaderId) };
      setAreas(editingAreaId ? areas.map(a => a.id === editingAreaId ? newA : a) : [...areas, newA]);
      setShowAreaForm(false); setEditingAreaId(null); showNotification("Área salva (Offline)!");
    }
  };

  const handleProductImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { const img = await compressImage(file, 800, 0.75); setProductData(prev => ({ ...prev, imageUrl: img })); }
    catch { const img = await fileToDataUrl(file).catch(() => ''); setProductData(prev => ({ ...prev, imageUrl: img })); }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const payload = { ...productData, cost: Number(productData.cost) };
    if (!payload.name || !payload.cost || payload.cost <= 0) return showNotification("Informe nome e um custo válido em pontos.");
    const method = editingProductId ? 'PUT' : 'POST';
    const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
    try {
      const res = await apiFetch(url, { method, body: payload });
      if (res.ok) {
        const saved = await res.json();
        setProducts(editingProductId ? products.map(p => p.id === editingProductId ? saved : p) : [saved, ...products]);
        setShowProductForm(false); setEditingProductId(null); showNotification(editingProductId ? 'Produto atualizado!' : 'Produto cadastrado!');
      } else throw new Error();
    } catch (e) {
      showNotification("Falha ao salvar o produto.");
    }
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    const payload = { ...ruleData, key: ruleData.key.trim().toUpperCase(), points: Number(ruleData.points) };
    if (!payload.key || !payload.label) return showNotification("Informe a chave e o nome da regra.");
    const method = editingRuleId ? 'PUT' : 'POST';
    const url = editingRuleId ? `/api/point-rules/${editingRuleId}` : '/api/point-rules';
    try {
      const res = await apiFetch(url, { method, body: payload });
      const saved = await res.json().catch(() => ({}));
      if (res.ok) {
        setPointRules(editingRuleId ? pointRules.map(r => r.id === editingRuleId ? saved : r) : [...pointRules, saved]);
        setShowRuleForm(false); setEditingRuleId(null); showNotification(editingRuleId ? 'Regra atualizada!' : 'Regra criada!');
      } else {
        showNotification(saved.error || 'Falha ao salvar a regra.');
      }
    } catch {
      showNotification("Falha de rede ao salvar a regra.");
    }
  };

  const validateVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;
    setVoucherResult(null);
    try {
      const res = await apiFetch(`/api/redemptions/validate/${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setVoucherResult(data);
      else setVoucherResult({ valid: false, error: data.error || 'Código não encontrado.' });
    } catch {
      setVoucherResult({ valid: false, error: 'Falha de rede ao validar.' });
    }
  };

  const markVoucherUsed = async (id) => {
    try {
      const res = await apiFetch(`/api/redemptions/${id}/use`, { method: 'PATCH' });
      if (res.ok) {
        const updated = await res.json();
        setVoucherResult(prev => prev ? { ...prev, valid: false, redemption: { ...prev.redemption, ...updated } } : prev);
        showNotification("Voucher marcado como usado.");
      } else throw new Error();
    } catch {
      showNotification("Falha ao atualizar o voucher.");
    }
  };

  const openQr = async (ev) => {
    try {
      const res = await apiFetch(`/api/events/${ev.id}/checkin-code`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setQrEvent({ event: ev, code: data.code });
      else showNotification(data.error || 'Falha ao obter o código.');
    } catch { showNotification('Falha de rede.'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-600/20 to-red-900/20 p-5 rounded-default border border-red-500/20 flex items-center gap-4 shadow-sm">
        <div className="bg-red-500/20 p-3 rounded-full text-red-400"><ShieldCheck className="w-8 h-8"/></div>
        <div>
          <h3 className="font-bold text-xl text-white">Central Admin</h3>
          <p className="text-sm text-text-muted mt-1">Gerenciamento global do sistema.</p>
        </div>
      </div>

      <div className="flex gap-4 border-b border-white/10 mb-4 overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('painel')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'painel' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><BarChart3 className="w-4 h-4"/> Painel</button>
        <button onClick={() => setActiveTab('links')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'links' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><LinkIcon className="w-4 h-4"/> Links</button>
        <button onClick={() => setActiveTab('areas')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'areas' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Briefcase className="w-4 h-4"/> Áreas</button>
        <button onClick={() => setActiveTab('eventos')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'eventos' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Calendar className="w-4 h-4"/> Eventos</button>
        <button onClick={() => setActiveTab('comunicados')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'comunicados' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Megaphone className="w-4 h-4"/> Comunicados</button>
        <button onClick={() => setActiveTab('mural_geral')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'mural_geral' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><MessageSquare className="w-4 h-4"/> Mural Geral</button>
        <button onClick={() => setActiveTab('loja')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'loja' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Gift className="w-4 h-4"/> Loja</button>
        <button onClick={() => setActiveTab('gamificacao')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'gamificacao' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Zap className="w-4 h-4"/> Gamificação</button>
        <button onClick={() => setActiveTab('membros')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'membros' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Users className="w-4 h-4"/> Membros</button>
        {user.role === 'ADMIN' && <button onClick={() => setActiveTab('cargos')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'cargos' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><ShieldCheck className="w-4 h-4"/> Cargos</button>}
        <button onClick={() => setActiveTab('bugs')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === 'bugs' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Bug className="w-4 h-4"/> Bugs</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="animate-in fade-in duration-300">

          {/* ─── CARGOS (PERMISSÕES) ─── */}
          {activeTab === 'cargos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-text-primary">Permissões por Cargo</h3>
                  <p className="text-xs text-text-muted mt-1">Defina o que cada cargo pode fazer. A hierarquia é Membro → Voluntário → Aux. Líder → Líder → Admin. O Admin sempre tem acesso total.</p>
                </div>
                <button onClick={savePermissions} disabled={permSaving || !permData} className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-secondary text-white px-5 py-2.5 rounded-default text-sm font-bold transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  <Save className="w-4 h-4"/> {permSaving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>

              {!permData ? (
                <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
              ) : (
                <div className="bg-surface-card border border-white/5 rounded-default overflow-x-auto shadow-level-2">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Permissão</th>
                        {permData.roles.map(role => (
                          <th key={role} className={`px-3 py-3 text-center text-xs font-bold uppercase tracking-wider ${LOCKED_ROLE(role) ? 'text-red-400' : 'text-text-muted'}`}>{ROLE_LABEL[role] || role}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {permData.permissions.map(p => (
                        <tr key={p.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text-primary">{p.label}</div>
                            <div className="text-xs text-text-muted mt-0.5">{p.description}</div>
                          </td>
                          {permData.roles.map(role => (
                            <td key={role} className="px-3 py-3 text-center">
                              <button
                                onClick={() => !LOCKED_ROLE(role) && togglePerm(p.key, role)}
                                disabled={LOCKED_ROLE(role)}
                                aria-label={`${p.label} — ${ROLE_LABEL[role] || role}`}
                                title={LOCKED_ROLE(role) ? `${ROLE_LABEL[role]} sempre tem acesso total` : (p.matrix[role] ? 'Permitido — clique para bloquear' : 'Bloqueado — clique para permitir')}
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${p.matrix[role] ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-surface-dark border-white/10 text-white/20'} ${LOCKED_ROLE(role) ? 'opacity-60 cursor-not-allowed' : 'hover:border-white/30'}`}
                              >
                                {p.matrix[role] ? <CheckCircle className="w-4 h-4"/> : <X className="w-4 h-4"/>}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-text-muted">O resgate na Loja é livre para todos os usuários. Já a validação/baixa de vouchers é liberada individualmente pela flag "Atendente" na aba Membros.</p>
            </div>
          )}

          {/* ─── BUGS (REPORTES) ─── */}
          {activeTab === 'bugs' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-text-primary">Bugs & Sugestões</h3>
              {bugReports.length === 0 ? (
                <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10 text-sm">Nenhum reporte por enquanto. 🎉</div>
              ) : (
                <div className="space-y-3">
                  {bugReports.map(b => (
                    <div key={b.id} className={`bg-surface-card border rounded-default p-4 ${b.status === 'RESOLVIDO' ? 'border-emerald-500/20' : 'border-white/5'}`}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                            <Bug className="w-4 h-4 text-brand-primary shrink-0"/> {b.title}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold ${b.type === 'SUGESTAO' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-brand-primary/20 text-brand-primary'}`}>{b.type === 'SUGESTAO' ? 'Sugestão' : 'Bug'}</span>
                          </div>
                          <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">{b.description}</p>
                          <div className="text-[11px] text-text-muted mt-2">{b.user?.name || 'Usuário'} • {new Date(b.createdAt).toLocaleString('pt-BR')}</div>
                        </div>
                        <button onClick={() => toggleBugStatus(b.id)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${b.status === 'RESOLVIDO' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30'}`}>
                          {b.status === 'RESOLVIDO' ? 'Resolvido' : 'Aberto'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── PAINEL (MÉTRICAS) ─── */}
          {activeTab === 'painel' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-text-primary">Visão Geral</h3>
              {!stats ? (
                <div className="text-text-muted text-sm">Carregando métricas…</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Membros', value: stats.users, icon: Users },
                    { label: 'Links', value: stats.links, icon: LinkIcon },
                    { label: 'Áreas', value: stats.areas, icon: Briefcase },
                    { label: 'Eventos', value: stats.events, icon: Calendar },
                    { label: 'Grupos de leitura', value: stats.groups, icon: Users },
                    { label: 'Leitores ativos', value: stats.activeReaders, icon: BookOpen },
                    { label: 'Leituras registradas', value: stats.readingLogs, icon: BookOpen },
                    { label: 'Produtos na loja', value: stats.products, icon: Gift },
                    { label: 'Vouchers ativos', value: stats.redemptionsActive, icon: Ticket },
                    { label: 'Vouchers usados', value: stats.redemptionsUsed, icon: Ticket },
                    { label: 'Pontos em circulação', value: stats.pointsInCirculation, icon: Award },
                    { label: 'Pontos gastos (loja)', value: stats.pointsSpent, icon: Award },
                  ].map(c => (
                    <div key={c.label} className="bg-surface-card border border-white/5 rounded-default p-4">
                      <div className="flex items-center gap-2 text-text-muted text-xs"><c.icon className="w-4 h-4 text-brand-primary"/> {c.label}</div>
                      <div className="text-2xl font-display font-bold text-white mt-2">{c.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── LINKS ─── */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Gestão de Links</h3>
                <button onClick={() => { setShowLinkForm(!showLinkForm); setEditingLinkId(null); setLinkData({ name: '', day: 'Sexta', time: '20:00', leaderId: leaders[0]?.id || '', isOnline: false }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showLinkForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showLinkForm ? 'Cancelar' : 'Novo Link'}
                </button>
              </div>

              {showLinkForm && (
                <form onSubmit={handleSaveLink} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">Nome do Link</label><input required type="text" value={linkData.name} onChange={e => setLinkData({...linkData, name: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Líder Responsável</label>
                      <select required value={linkData.leaderId} onChange={e => setLinkData({...linkData, leaderId: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        <option value="">Selecione um líder</option>
                        {leaders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Dia da Semana</label>
                      <select value={linkData.day} onChange={e => setLinkData({...linkData, day: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        {['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-text-muted mb-1 block">Horário</label><input required type="time" value={linkData.time} onChange={e => setLinkData({...linkData, time: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={!linkData.isOnline} onChange={() => setLinkData({...linkData, isOnline: false, locationUrl: ''})} name="ltype"/> Presencial</label>
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={linkData.isOnline} onChange={() => setLinkData({...linkData, isOnline: true, locationUrl: ''})} name="ltype"/> Online</label>
                  </div>
                  <input type="text" value={linkData.locationUrl || ''} onChange={e => setLinkData({...linkData, locationUrl: e.target.value})} placeholder={linkData.isOnline ? "URL da Chamada" : "Endereço Físico"} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/>
                  <textarea value={linkData.description || ''} onChange={e => setLinkData({...linkData, description: e.target.value})} placeholder="Descrição / Público" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">{editingLinkId ? 'Salvar Edição' : 'Criar Link'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {links.map(l => (
                  <div key={l.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white text-lg">{l.name}</div>
                      <div className="text-sm text-text-muted">Líder: {l.leader?.name}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingLinkId(l.id); setLinkData({ name: l.name, day: l.day, time: l.time, leaderId: l.leaderId, isOnline: l.isOnline, description: l.description || '', locationUrl: l.locationUrl || '' }); setShowLinkForm(true); }} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'links', id: l.id, title: 'Excluir Link' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── GESTÃO DE ÁREAS (NOVO) ─── */}
          {activeTab === 'areas' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Gestão de Áreas (Voluntários)</h3>
                <button onClick={() => { setShowAreaForm(!showAreaForm); setEditingAreaId(null); setAreaData({ name: '', description: '', leaderId: leaders[0]?.id || '' }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showAreaForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showAreaForm ? 'Cancelar' : 'Nova Área'}
                </button>
              </div>

              {showAreaForm && (
                <form onSubmit={handleSaveArea} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">Nome da Área</label><input required type="text" value={areaData.name} onChange={e => setAreaData({...areaData, name: e.target.value})} placeholder="Ex: Recepção" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Líder da Área</label>
                      <select required value={areaData.leaderId} onChange={e => setAreaData({...areaData, leaderId: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        <option value="">Selecione um líder</option>
                        {leaders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea value={areaData.description} onChange={e => setAreaData({...areaData, description: e.target.value})} placeholder="Descrição das responsabilidades da área" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">{editingAreaId ? 'Salvar Edição' : 'Criar Área'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {areas.map(a => (
                  <div key={a.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white text-lg">{a.name}</div>
                      <div className="text-sm text-text-muted">Líder: {a.leader?.name || 'Não vinculado'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingAreaId(a.id); setAreaData({ name: a.name, description: a.description || '', leaderId: a.leaderId || '' }); setShowAreaForm(true); }} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'areas', id: a.id, title: 'Excluir Área' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── EVENTOS ─── */}
          {activeTab === 'eventos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Agenda de Eventos</h3>
                <button onClick={() => { setShowEventForm(!showEventForm); setEditingEventId(null); setEventDateStr(''); setEventTimeStr(''); setEventCommonData({ title: '', location: '', type: 'GERAL', recurrence: 'NONE' }); setEventLocationCustom(false); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showEventForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showEventForm ? 'Cancelar' : 'Novo Evento'}
                </button>
              </div>

              {showEventForm && (
                <form onSubmit={handleSaveEvent} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Título do Evento</label><input required type="text" value={eventCommonData.title} onChange={e => setEventCommonData({...eventCommonData, title: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-text-muted mb-1 block">Data</label>
                        <input required type="date" value={eventDateStr} onChange={e => setEventDateStr(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary [color-scheme:dark]"/>
                      </div>
                      <div className="w-1/3">
                        <label className="text-xs text-text-muted mb-1 block">Hora</label>
                        <input required type="time" value={eventTimeStr} onChange={e => setEventTimeStr(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary [color-scheme:dark]"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Público Alvo (Aba)</label>
                      <select value={eventCommonData.type} onChange={e => setEventCommonData({...eventCommonData, type: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        <option value="GERAL">Membros (Geral)</option><option value="VOLUNTARIO">Voluntários</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Recorrência</label>
                      <select value={eventCommonData.recurrence} onChange={e => setEventCommonData({...eventCommonData, recurrence: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        <option value="NONE">Não repete</option>
                        <option value="WEEKLY">Semanal</option>
                        <option value="MONTHLY">Mensal</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Localização</label>
                    <select
                      required={!eventLocationCustom}
                      value={eventLocationCustom ? 'OUTRO' : eventCommonData.location}
                      onChange={e => {
                        if (e.target.value === 'OUTRO') { setEventLocationCustom(true); setEventCommonData({ ...eventCommonData, location: '' }); }
                        else { setEventLocationCustom(false); setEventCommonData({ ...eventCommonData, location: e.target.value }); }
                      }}
                      className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"
                    >
                      <option value="" disabled>Selecione um local</option>
                      {EVENT_LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      <option value="OUTRO">Outro (digitar)</option>
                    </select>
                    {eventLocationCustom && (
                      <input required type="text" autoFocus value={eventCommonData.location} onChange={e => setEventCommonData({ ...eventCommonData, location: e.target.value })} placeholder="Digite o local" className="w-full mt-2 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/>
                    )}
                  </div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">{editingEventId ? 'Salvar Edição' : 'Agendar Evento'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {events.map(e => (
                  <div key={e.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-lg">{e.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold ${e.type === 'VOLUNTARIO' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-primary/20 text-brand-primary'}`}>{e.type}</span>
                        {e.recurrence && e.recurrence !== 'NONE' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-purple-500/20 text-purple-400">{e.recurrence === 'WEEKLY' ? '↻ Semanal' : '↻ Mensal'}</span>
                        )}
                      </div>
                      <div className="text-sm text-text-muted flex items-center gap-2 mt-1">{formatDatePT(e.date)} • {e.location}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openQr(e)} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="QR / Check-in"><QrCode className="w-5 h-5"/></button>
                      <button onClick={() => openEditEvent(e)} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'events', id: e.id, title: 'Excluir Evento' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── COMUNICADOS ─── */}
          {activeTab === 'comunicados' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Mural de Avisos Globais</h3>
                <button onClick={() => { setShowAnnForm(!showAnnForm); setEditingAnnId(null); setAnnData({title: '', content: '', type: 'GERAL'}); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showAnnForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showAnnForm ? 'Cancelar' : 'Novo Aviso'}
                </button>
              </div>

              {showAnnForm && (
                <form onSubmit={handleSaveAnnouncement} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Título / Assunto</label><input required type="text" value={annData.title} onChange={e => setAnnData({...annData, title: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Exibir na Aba:</label>
                    <select value={annData.type} onChange={e => setAnnData({...annData, type: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                      <option value="GERAL">Início (Membros)</option><option value="VOLUNTARIO">Voluntários</option>
                    </select>
                  </div>
                  <div><label className="text-xs text-text-muted mb-1 block">Conteúdo da Mensagem</label><textarea required value={annData.content} onChange={e => setAnnData({...annData, content: e.target.value})} rows="3" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea></div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Save className="w-4 h-4 inline mr-2"/> {editingAnnId ? 'Salvar Edição' : 'Publicar Aviso'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {announcements.map(a => (
                  <div key={a.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-md">{a.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold ${a.type === 'VOLUNTARIO' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-primary/20 text-brand-primary'}`}>{a.type === 'GERAL' ? 'Membros' : 'Voluntários'}</span>
                      </div>
                      <p className="text-sm text-text-muted">{a.content}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditingAnnId(a.id); setAnnData({ title: a.title, content: a.content, type: a.type }); setShowAnnForm(true); }} className="p-2 hover:bg-white/10 text-text-muted hover:text-white rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Edit3 className="w-4 h-4"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'announcements', id: a.id, title: 'Excluir Comunicado' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── MURAL GERAL ─── */}
          {activeTab === 'mural_geral' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Mural da Comunidade (Membros)</h3>
                <button onClick={() => setShowPubForm(!showPubForm)} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showPubForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showPubForm ? 'Cancelar' : 'Nova Publicação'}
                </button>
              </div>

              {showPubForm && (
                <form onSubmit={handleSavePublication} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Conteúdo</label><textarea required value={pubData.content} onChange={e => setPubData({...pubData, content: e.target.value})} rows="4" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">URL da Imagem (Opcional)</label><input type="text" value={pubData.imageUrl} onChange={e => setPubData({...pubData, imageUrl: e.target.value})} placeholder="https://..." className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div><label className="text-xs text-text-muted mb-1 block">URL do Documento (Opcional)</label><input type="text" value={pubData.documentUrl} onChange={e => setPubData({...pubData, documentUrl: e.target.value})} placeholder="https://..." className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                  </div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Save className="w-4 h-4 inline mr-2"/> Publicar no Mural</button>
                </form>
              )}

              <div className="grid gap-3">
                {publications.map(p => (
                  <div key={p.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
                         <span className="font-bold text-white">{p.author?.name}</span> • {formatDatePT(p.createdAt)}
                      </div>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">{p.content}</p>
                      {p.imageUrl && <div className="mt-2 text-xs text-brand-primary font-bold">[Contém Imagem Anexa]</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'publications', id: p.id, title: 'Excluir Publicação' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── LOJA DE RECOMPENSAS ─── */}
          {activeTab === 'loja' && (
            <div className="space-y-6">
              {/* Validador de voucher */}
              <div className="bg-surface-card border border-white/10 p-5 rounded-default shadow-level-2">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2 mb-3"><Ticket className="w-4 h-4 text-brand-primary"/> Validar Voucher</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={voucherCode} onChange={e => { setVoucherCode(e.target.value); setVoucherResult(null); }} placeholder="ZION-XXXXXXXX" className="flex-1 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white font-mono outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary uppercase"/>
                  <button onClick={validateVoucher} className="bg-brand-primary text-white px-5 py-2 rounded-md font-bold text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-brand-secondary">Validar</button>
                </div>
                {voucherResult && (
                  <div className={`mt-3 p-3 rounded-md border text-sm ${voucherResult.valid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    {voucherResult.error ? (
                      <span className="text-red-400 font-semibold flex items-center gap-2"><X className="w-4 h-4"/> {voucherResult.error}</span>
                    ) : voucherResult.valid ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-emerald-300">
                          <div className="font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4"/> Voucher válido</div>
                          <div className="text-xs text-text-muted mt-1">{voucherResult.redemption.productName} • {voucherResult.redemption.user?.name} • {voucherResult.redemption.cost} pts</div>
                        </div>
                        <button onClick={() => markVoucherUsed(voucherResult.redemption.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 shrink-0">Marcar como usado</button>
                      </div>
                    ) : (
                      <span className="text-amber-400 font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Voucher já utilizado{voucherResult.redemption?.productName ? ` (${voucherResult.redemption.productName})` : ''}.</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Produtos da Loja</h3>
                <button onClick={() => { setShowProductForm(!showProductForm); setEditingProductId(null); setProductData({ name: '', category: 'Livros', description: '', cost: 100, imageUrl: '', active: true }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showProductForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showProductForm ? 'Cancelar' : 'Novo Produto'}
                </button>
              </div>

              {showProductForm && (
                <form onSubmit={handleSaveProduct} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">Nome do Produto</label><input required type="text" value={productData.name} onChange={e => setProductData({...productData, name: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div><label className="text-xs text-text-muted mb-1 block">Categoria</label>
                      <select value={productData.category} onChange={e => setProductData({...productData, category: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        {['Livros','Café','Descontos','Produtos','Geral'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-text-muted mb-1 block">Custo (Zion Points)</label><input required type="number" min="1" value={productData.cost} onChange={e => setProductData({...productData, cost: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="checkbox" checked={productData.active} onChange={e => setProductData({...productData, active: e.target.checked})}/> Ativo (visível na loja)</label>
                    </div>
                  </div>
                  <textarea value={productData.description || ''} onChange={e => setProductData({...productData, description: e.target.value})} placeholder="Descrição do produto" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-md bg-surface-dark border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {productData.imageUrl ? <img src={productData.imageUrl} alt="Prévia" className="w-full h-full object-cover"/> : <Tag className="w-6 h-6 text-white/20"/>}
                    </div>
                    <label className="text-sm bg-surface-dark border border-white/10 text-white px-4 py-2 rounded-md hover:border-brand-primary cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                      Enviar foto
                      <input type="file" accept="image/*" className="hidden" onChange={handleProductImageUpload}/>
                    </label>
                  </div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">{editingProductId ? 'Salvar Edição' : 'Cadastrar Produto'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {products.map(p => (
                  <div key={p.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-md bg-surface-dark border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover"/> : <Gift className="w-5 h-5 text-white/20"/>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white truncate">{p.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-brand-primary/20 text-brand-primary">{p.category}</span>
                          {!p.active && <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-white/10 text-text-muted">Inativo</span>}
                        </div>
                        <div className="text-sm text-text-muted mt-0.5">{p.cost} Zion Points</div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditingProductId(p.id); setProductData({ name: p.name, category: p.category, description: p.description || '', cost: p.cost, imageUrl: p.imageUrl || '', active: p.active }); setShowProductForm(true); }} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'products', id: p.id, title: 'Excluir Produto' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── GAMIFICAÇÃO (REGRAS DE PONTOS) ─── */}
          {activeTab === 'gamificacao' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><Zap className="w-5 h-5 text-brand-primary"/> Regras de Pontos</h3>
                  <p className="text-sm text-text-muted mt-1">Defina quantos Zion Points cada ação vale. A <span className="font-mono text-xs">chave</span> conecta a regra a uma ação do app.</p>
                </div>
                <button onClick={() => { setShowRuleForm(!showRuleForm); setEditingRuleId(null); setRuleData({ key: '', label: '', description: '', category: 'Geral', points: 10, active: true }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                  {showRuleForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showRuleForm ? 'Cancelar' : 'Nova Regra'}
                </button>
              </div>

              {showRuleForm && (
                <form onSubmit={handleSaveRule} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Chave (identificador)</label>
                      <input required type="text" value={ruleData.key} onChange={e => setRuleData({...ruleData, key: e.target.value.toUpperCase()})} disabled={!!editingRuleId} placeholder="EX: BIBLE_DAILY_READ" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white font-mono outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary disabled:opacity-50"/>
                    </div>
                    <div><label className="text-xs text-text-muted mb-1 block">Nome / Descrição curta</label><input required type="text" value={ruleData.label} onChange={e => setRuleData({...ruleData, label: e.target.value})} placeholder="Ex: Ler o capítulo do dia" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                    <div><label className="text-xs text-text-muted mb-1 block">Categoria</label>
                      <select value={ruleData.category} onChange={e => setRuleData({...ruleData, category: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                        {['Eventos','Voluntariado','Plano Bíblico','Comunidade','Geral'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-text-muted mb-1 block">Pontos</label><input required type="number" min="0" value={ruleData.points} onChange={e => setRuleData({...ruleData, points: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/></div>
                  </div>
                  <textarea value={ruleData.description || ''} onChange={e => setRuleData({...ruleData, description: e.target.value})} placeholder="Descrição (opcional)" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"></textarea>
                  <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="checkbox" checked={ruleData.active} onChange={e => setRuleData({...ruleData, active: e.target.checked})}/> Ativa</label>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">{editingRuleId ? 'Salvar Edição' : 'Criar Regra'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {pointRules.length === 0 && <div className="text-center text-text-muted py-8 bg-surface-card rounded-default border border-dashed border-white/10 text-sm">Nenhuma regra cadastrada.</div>}
                {pointRules.map(r => (
                  <div key={r.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">{r.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-brand-primary/20 text-brand-primary">{r.category}</span>
                        {!r.active && <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-white/10 text-text-muted">Inativa</span>}
                      </div>
                      <div className="text-xs text-text-muted font-mono mt-0.5 truncate">{r.key}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-display font-bold text-brand-primary flex items-center gap-1 whitespace-nowrap"><Zap className="w-4 h-4"/> {r.points}</span>
                      <button onClick={() => { setEditingRuleId(r.id); setRuleData({ key: r.key, label: r.label, description: r.description || '', category: r.category, points: r.points, active: r.active }); setShowRuleForm(true); }} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'point-rules', id: r.id, title: 'Excluir Regra' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── MEMBROS (ACESSOS + MODO TESTE) ─── */}
          {activeTab === 'membros' && (
            <div className="space-y-4">
               <h3 className="text-lg font-bold text-text-primary">Membros Cadastrados</h3>
               <p className="text-sm text-text-muted mb-4">Defina o nível de acesso de cada membro ou entre no <span className="font-semibold text-amber-400">Modo de Teste</span> para navegar na visão dele.</p>

               <div className="grid gap-3">
                 {allUsers.map(usr => (
                   <div key={usr.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-surface-dark border border-white/10 flex items-center justify-center font-bold text-brand-primary overflow-hidden shrink-0">
                         {usr.profileImage ? <img src={usr.profileImage} alt={usr.name} className="w-full h-full object-cover" /> : (usr.name?.charAt(0) || '?')}
                       </div>
                       <div>
                         <div className="font-bold text-white text-sm">{usr.name}</div>
                         <div className="text-xs text-text-muted">{usr.email}</div>
                       </div>
                     </div>
                     <div className="flex items-center gap-2 sm:justify-end flex-wrap">
                       <button
                         onClick={() => handleRedeemFlagToggle(usr.id, !usr.canRedeem)}
                         title={usr.canRedeem ? 'Pode validar/dar baixa em vouchers — clique para remover' : 'Não valida vouchers — clique para liberar como atendente'}
                         className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${usr.canRedeem ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20' : 'text-text-muted bg-surface-dark border-white/10 hover:text-white'}`}
                       >
                         <QrCode className="w-3.5 h-3.5"/> {usr.canRedeem ? 'Atendente ✓' : 'Atendente'}
                       </button>
                       {LOCKED_ROLE(user.role) && (
                       <div className="flex items-center gap-1 bg-surface-dark border border-white/10 rounded-md p-1" title="Acesso administrativo por módulo">
                         <button
                           onClick={() => handleModuleAccessToggle(usr.id, 'links', !usr.canManageLinks)}
                           title={usr.canManageLinks ? 'Gerencia Links — clique para remover' : 'Não gerencia Links — clique para conceder'}
                           className={`p-1.5 rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${usr.canManageLinks ? 'text-brand-primary bg-brand-primary/10' : 'text-text-muted hover:text-white'}`}
                         ><LinkIcon className="w-3.5 h-3.5"/></button>
                         <button
                           onClick={() => handleModuleAccessToggle(usr.id, 'areas', !usr.canManageAreas)}
                           title={usr.canManageAreas ? 'Gerencia Voluntários — clique para remover' : 'Não gerencia Voluntários — clique para conceder'}
                           className={`p-1.5 rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${usr.canManageAreas ? 'text-brand-primary bg-brand-primary/10' : 'text-text-muted hover:text-white'}`}
                         ><Briefcase className="w-3.5 h-3.5"/></button>
                         <button
                           onClick={() => handleModuleAccessToggle(usr.id, 'store', !usr.canManageStore)}
                           title={usr.canManageStore ? 'Gerencia Loja — clique para remover' : 'Não gerencia Loja — clique para conceder'}
                           className={`p-1.5 rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${usr.canManageStore ? 'text-brand-primary bg-brand-primary/10' : 'text-text-muted hover:text-white'}`}
                         ><Gift className="w-3.5 h-3.5"/></button>
                       </div>
                       )}
                       {user.role === 'ADMIN' && (
                       <button
                         onClick={() => handleSimulateUser?.(usr)}
                         disabled={usr.id === user.id}
                         title={usr.id === user.id ? 'Você não pode simular a si mesmo' : `Testar como ${usr.name}`}
                         className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-md hover:bg-amber-500/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-40 disabled:cursor-not-allowed"
                       >
                         <Eye className="w-3.5 h-3.5"/> Testar
                       </button>
                       )}
                       <select
                         value={usr.role}
                         disabled={usr.id === user.id} // Impede alterar o próprio acesso
                         onChange={(e) => handleRoleChange(usr.id, e.target.value)}
                         className={`bg-surface-dark border rounded-md px-3 py-1.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-50 ${(usr.role === 'ADMIN' || usr.role === 'PASTOR') ? 'text-red-400 border-red-500/30' : (usr.role === 'LIDER' || usr.role === 'AUXILIAR_LIDER') ? 'text-brand-primary border-brand-primary/30' : 'text-text-muted border-white/10'}`}
                       >
                         <option value="MEMBRO">Membro</option>
                         <option value="VOLUNTARIO">Voluntário</option>
                         <option value="AUXILIAR_LIDER">Auxiliar de Líder</option>
                         <option value="LIDER">Líder</option>
                         {/* Só o Admin pode conceder Pastor/Admin */}
                         {user.role === 'ADMIN' && <option value="PASTOR">Pastor</option>}
                         {user.role === 'ADMIN' && <option value="ADMIN">Administrador</option>}
                         {/* Mostra o cargo atual mesmo que o editor não possa concedê-lo */}
                         {usr.role === 'PASTOR' && user.role !== 'ADMIN' && <option value="PASTOR">Pastor</option>}
                         {usr.role === 'ADMIN' && user.role !== 'ADMIN' && <option value="ADMIN">Administrador</option>}
                       </select>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}

      {qrEvent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70" onClick={() => setQrEvent(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><QrCode className="w-5 h-5 text-brand-primary"/> Check-in</h3>
              <button onClick={() => setQrEvent(null)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-4">{qrEvent.event.title}</p>
            <div className="bg-white rounded-xl p-3 inline-block mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${window.location.origin}/?checkin=${qrEvent.event.id}&code=${qrEvent.code}`)}`} alt="QR de check-in" width="220" height="220" />
            </div>
            <p className="text-xs text-text-muted mb-1">Código de check-in (alternativa manual)</p>
            <p className="font-mono text-2xl font-bold text-brand-primary tracking-widest">{qrEvent.code}</p>
            <p className="text-[11px] text-text-muted mt-3">Exiba este QR no local. Ao escanear com a câmera, o membro confirma presença automaticamente. O código abaixo serve como alternativa manual.</p>
          </div>
        </div>
      )}

      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' })}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-red-400"><div className="bg-red-500/10 p-3 rounded-full"><AlertTriangle className="w-8 h-8" /></div></div>
            <h3 className="text-xl font-bold text-text-primary text-center mb-2">{deleteConfirm.title}?</h3>
            <p className="text-text-muted text-center mb-6 text-sm">Tem certeza que deseja apagar este item permanentemente? Esta ação é irreversível.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' })} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Voltar</button>
              <button onClick={executeConfirmDelete} className="flex-1 px-4 py-2.5 rounded-default bg-red-500 hover:bg-red-600 text-white font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminModule;