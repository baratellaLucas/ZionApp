import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Trash2, Edit3, Save, X, Calendar, Megaphone, Link as LinkIcon, MessageSquare, AlertTriangle, Users, Eye, Briefcase } from 'lucide-react';

const AdminModule = ({ user, showNotification, handleSimulateUser }) => {
  const [activeTab, setActiveTab] = useState('links');
  
  const [allUsers, setAllUsers] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [links, setLinks] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [publications, setPublications] = useState([]);
  const [areas, setAreas] = useState([]); 
  
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
  
  const [eventDateStr, setEventDateStr] = useState(''); 
  const [eventTimeStr, setEventTimeStr] = useState(''); 
  const [eventCommonData, setEventCommonData] = useState({ title: '', location: '', type: 'GERAL' });

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      const [resUsers, resLinks, resEvents, resAnn, resPubs, resAreas] = await Promise.all([
        fetch('http://localhost:3000/api/users').catch(() => null),
        fetch('http://localhost:3000/api/links').catch(() => null),
        fetch('http://localhost:3000/api/events').catch(() => null),
        fetch('http://localhost:3000/api/announcements').catch(() => null),
        fetch('http://localhost:3000/api/publications').catch(() => null),
        fetch('http://localhost:3000/api/areas').catch(() => null)
      ]);

      if (resUsers?.ok) {
        const u = await resUsers.json();
        setAllUsers(u);
        const l = u.filter(usr => ['LIDER', 'ADMIN'].includes(usr.role));
        setLeaders(l);
        if (l.length > 0) setLinkData(p => ({ ...p, leaderId: l[0].id }));
      }
      if (resLinks?.ok) setLinks(await resLinks.json());
      if (resEvents?.ok) setEvents(await resEvents.json());
      if (resAnn?.ok) setAnnouncements(await resAnn.json());
      if (resPubs?.ok) setPublications(await resPubs.json());
      if (resAreas?.ok) setAreas(await resAreas.json());

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
      await fetch(`http://localhost:3000/api/${type}/${id}`, { method: 'DELETE' }).catch(() => null);
      if (type === 'links') setLinks(links.filter(i => i.id !== id));
      if (type === 'events') setEvents(events.filter(i => i.id !== id));
      if (type === 'announcements') setAnnouncements(announcements.filter(i => i.id !== id));
      if (type === 'publications') setPublications(publications.filter(i => i.id !== id));
      if (type === 'areas') setAreas(areas.filter(i => i.id !== id));
      showNotification("Removido com sucesso.");
    } catch (e) {
      if (type === 'links') setLinks(links.filter(i => i.id !== id));
      if (type === 'events') setEvents(events.filter(i => i.id !== id));
      if (type === 'announcements') setAnnouncements(announcements.filter(i => i.id !== id));
      if (type === 'publications') setPublications(publications.filter(i => i.id !== id));
      if (type === 'areas') setAreas(areas.filter(i => i.id !== id));
      showNotification("Removido (Offline).");
    } finally {
      setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' });
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`http://localhost:3000/api/users/${userId}/role`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setAllUsers(allUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
        if (['LIDER', 'ADMIN'].includes(newRole)) {
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

  const handleSaveLink = async (e) => {
    e.preventDefault();
    const method = editingLinkId ? 'PUT' : 'POST';
    const url = editingLinkId ? `http://localhost:3000/api/links/${editingLinkId}` : 'http://localhost:3000/api/links';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(linkData) });
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
    const parts = eventDateStr.split('/');
    if (parts.length !== 3 || parts[2].length !== 4) return showNotification("Formato de data inválido. Use DD/MM/AAAA.");
    const isoDateString = `${parts[2]}-${parts[1]}-${parts[0]}T${eventTimeStr}:00`;
    const payload = { ...eventCommonData, date: new Date(isoDateString).toISOString() };
    const method = editingEventId ? 'PUT' : 'POST';
    const url = editingEventId ? `http://localhost:3000/api/events/${editingEventId}` : 'http://localhost:3000/api/events';
    
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
    setEventDateStr(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    setEventTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setEventCommonData({ title: ev.title, location: ev.location || '', type: ev.type });
    setShowEventForm(true);
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    const method = editingAnnId ? 'PUT' : 'POST';
    const url = editingAnnId ? `http://localhost:3000/api/announcements/${editingAnnId}` : 'http://localhost:3000/api/announcements';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(annData) });
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
      const res = await fetch('http://localhost:3000/api/publications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...pubData, authorId: user.id})
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
    const url = editingAreaId ? `http://localhost:3000/api/areas/${editingAreaId}` : 'http://localhost:3000/api/areas';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(areaData) });
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
        <button onClick={() => setActiveTab('links')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'links' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><LinkIcon className="w-4 h-4"/> Links</button>
        <button onClick={() => setActiveTab('areas')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'areas' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Briefcase className="w-4 h-4"/> Áreas</button>
        <button onClick={() => setActiveTab('eventos')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'eventos' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Calendar className="w-4 h-4"/> Eventos</button>
        <button onClick={() => setActiveTab('comunicados')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'comunicados' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Megaphone className="w-4 h-4"/> Comunicados</button>
        <button onClick={() => setActiveTab('mural_geral')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'mural_geral' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><MessageSquare className="w-4 h-4"/> Mural Geral</button>
        <button onClick={() => setActiveTab('membros')} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none ${activeTab === 'membros' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><Users className="w-4 h-4"/> Membros</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="animate-in fade-in duration-300">
          
          {/* ─── LINKS ─── */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-primary">Gestão de Links</h3>
                <button onClick={() => { setShowLinkForm(!showLinkForm); setEditingLinkId(null); setLinkData({ name: '', day: 'Sexta', time: '20:00', leaderId: leaders[0]?.id || '', isOnline: false }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none">
                  {showLinkForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showLinkForm ? 'Cancelar' : 'Novo Link'}
                </button>
              </div>

              {showLinkForm && (
                <form onSubmit={handleSaveLink} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">Nome do Link</label><input required type="text" value={linkData.name} onChange={e => setLinkData({...linkData, name: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Líder Responsável</label>
                      <select required value={linkData.leaderId} onChange={e => setLinkData({...linkData, leaderId: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary">
                        <option value="">Selecione um líder</option>
                        {leaders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Dia da Semana</label>
                      <select value={linkData.day} onChange={e => setLinkData({...linkData, day: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary">
                        {['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-text-muted mb-1 block">Horário</label><input required type="time" value={linkData.time} onChange={e => setLinkData({...linkData, time: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={!linkData.isOnline} onChange={() => setLinkData({...linkData, isOnline: false, locationUrl: ''})} name="ltype"/> Presencial</label>
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={linkData.isOnline} onChange={() => setLinkData({...linkData, isOnline: true, locationUrl: ''})} name="ltype"/> Online</label>
                  </div>
                  <input type="text" value={linkData.locationUrl || ''} onChange={e => setLinkData({...linkData, locationUrl: e.target.value})} placeholder={linkData.isOnline ? "URL da Chamada" : "Endereço Físico"} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/>
                  <textarea value={linkData.description || ''} onChange={e => setLinkData({...linkData, description: e.target.value})} placeholder="Descrição / Público" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"></textarea>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none">{editingLinkId ? 'Salvar Edição' : 'Criar Link'}</button>
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
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'links', id: l.id, title: 'Excluir Link' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none"><Trash2 className="w-5 h-5"/></button>
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
                <button onClick={() => { setShowAreaForm(!showAreaForm); setEditingAreaId(null); setAreaData({ name: '', description: '', leaderId: leaders[0]?.id || '' }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none">
                  {showAreaForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showAreaForm ? 'Cancelar' : 'Nova Área'}
                </button>
              </div>

              {showAreaForm && (
                <form onSubmit={handleSaveArea} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">Nome da Área</label><input required type="text" value={areaData.name} onChange={e => setAreaData({...areaData, name: e.target.value})} placeholder="Ex: Recepção" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Líder da Área</label>
                      <select required value={areaData.leaderId} onChange={e => setAreaData({...areaData, leaderId: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary">
                        <option value="">Selecione um líder</option>
                        {leaders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea value={areaData.description} onChange={e => setAreaData({...areaData, description: e.target.value})} placeholder="Descrição das responsabilidades da área" rows="2" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"></textarea>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none">{editingAreaId ? 'Salvar Edição' : 'Criar Área'}</button>
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
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'areas', id: a.id, title: 'Excluir Área' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none"><Trash2 className="w-5 h-5"/></button>
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
                <button onClick={() => { setShowEventForm(!showEventForm); setEditingEventId(null); setEventDateStr(''); setEventTimeStr(''); setEventCommonData({ title: '', location: '', type: 'GERAL' }); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex gap-2 items-center outline-none">
                  {showEventForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showEventForm ? 'Cancelar' : 'Novo Evento'}
                </button>
              </div>

              {showEventForm && (
                <form onSubmit={handleSaveEvent} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Título do Evento</label><input required type="text" value={eventCommonData.title} onChange={e => setEventCommonData({...eventCommonData, title: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-text-muted mb-1 block">Data (DD/MM/AAAA)</label>
                        <input required type="text" placeholder="DD/MM/AAAA" pattern="\d{2}/\d{2}/\d{4}" value={eventDateStr} onChange={e => setEventDateStr(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/>
                      </div>
                      <div className="w-1/3">
                        <label className="text-xs text-text-muted mb-1 block">Hora</label>
                        <input required type="time" value={eventTimeStr} onChange={e => setEventTimeStr(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Público Alvo (Aba)</label>
                      <select value={eventCommonData.type} onChange={e => setEventCommonData({...eventCommonData, type: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary">
                        <option value="GERAL">Membros (Geral)</option><option value="VOLUNTARIO">Voluntários</option>
                      </select>
                    </div>
                  </div>
                  <div><label className="text-xs text-text-muted mb-1 block">Localização</label><input required type="text" value={eventCommonData.location} onChange={e => setEventCommonData({...eventCommonData, location: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none">{editingEventId ? 'Salvar Edição' : 'Agendar Evento'}</button>
                </form>
              )}

              <div className="grid gap-3">
                {events.map(e => (
                  <div key={e.id} className="bg-surface-card border border-white/5 p-4 rounded-default flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-lg">{e.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold ${e.type === 'VOLUNTARIO' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-primary/20 text-brand-primary'}`}>{e.type}</span>
                      </div>
                      <div className="text-sm text-text-muted flex items-center gap-2 mt-1">{formatDatePT(e.date)} • {e.location}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditEvent(e)} className="p-2 hover:bg-white/10 rounded-md text-brand-primary" title="Editar"><Edit3 className="w-5 h-5"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'events', id: e.id, title: 'Excluir Evento' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none"><Trash2 className="w-5 h-5"/></button>
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
                <button onClick={() => { setShowAnnForm(!showAnnForm); setEditingAnnId(null); setAnnData({title: '', content: '', type: 'GERAL'}); }} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 outline-none">
                  {showAnnForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showAnnForm ? 'Cancelar' : 'Novo Aviso'}
                </button>
              </div>

              {showAnnForm && (
                <form onSubmit={handleSaveAnnouncement} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Título / Assunto</label><input required type="text" value={annData.title} onChange={e => setAnnData({...annData, title: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Exibir na Aba:</label>
                    <select value={annData.type} onChange={e => setAnnData({...annData, type: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary">
                      <option value="GERAL">Início (Membros)</option><option value="VOLUNTARIO">Voluntários</option>
                    </select>
                  </div>
                  <div><label className="text-xs text-text-muted mb-1 block">Conteúdo da Mensagem</label><textarea required value={annData.content} onChange={e => setAnnData({...annData, content: e.target.value})} rows="3" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"></textarea></div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none"><Save className="w-4 h-4 inline mr-2"/> {editingAnnId ? 'Salvar Edição' : 'Publicar Aviso'}</button>
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
                      <button onClick={() => { setEditingAnnId(a.id); setAnnData({ title: a.title, content: a.content, type: a.type }); setShowAnnForm(true); }} className="p-2 hover:bg-white/10 text-text-muted hover:text-white rounded-md outline-none"><Edit3 className="w-4 h-4"/></button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'announcements', id: a.id, title: 'Excluir Comunicado' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none"><Trash2 className="w-4 h-4"/></button>
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
                <button onClick={() => setShowPubForm(!showPubForm)} className="bg-brand-primary text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 outline-none">
                  {showPubForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>} {showPubForm ? 'Cancelar' : 'Nova Publicação'}
                </button>
              </div>

              {showPubForm && (
                <form onSubmit={handleSavePublication} className="bg-surface-card border border-white/10 p-5 rounded-default space-y-4 shadow-level-2">
                  <div><label className="text-xs text-text-muted mb-1 block">Conteúdo</label><textarea required value={pubData.content} onChange={e => setPubData({...pubData, content: e.target.value})} rows="4" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"></textarea></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs text-text-muted mb-1 block">URL da Imagem (Opcional)</label><input type="text" value={pubData.imageUrl} onChange={e => setPubData({...pubData, imageUrl: e.target.value})} placeholder="https://..." className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                    <div><label className="text-xs text-text-muted mb-1 block">URL do Documento (Opcional)</label><input type="text" value={pubData.documentUrl} onChange={e => setPubData({...pubData, documentUrl: e.target.value})} placeholder="https://..." className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus:border-brand-primary"/></div>
                  </div>
                  <button type="submit" className="w-full bg-brand-primary text-white py-2 rounded-md font-bold outline-none"><Save className="w-4 h-4 inline mr-2"/> Publicar no Mural</button>
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
                      <button onClick={() => setDeleteConfirm({ isOpen: true, type: 'publications', id: p.id, title: 'Excluir Publicação' })} className="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-md outline-none"><Trash2 className="w-4 h-4"/></button>
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
                     <div className="flex items-center gap-2 sm:justify-end">
                       <button
                         onClick={() => handleSimulateUser?.(usr)}
                         disabled={usr.id === user.id}
                         title={usr.id === user.id ? 'Você não pode simular a si mesmo' : `Testar como ${usr.name}`}
                         className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-md hover:bg-amber-500/20 transition-colors outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                       >
                         <Eye className="w-3.5 h-3.5"/> Testar
                       </button>
                       <select
                         value={usr.role}
                         disabled={usr.id === user.id} // Impede alterar o próprio acesso
                         onChange={(e) => handleRoleChange(usr.id, e.target.value)}
                         className={`bg-surface-dark border rounded-md px-3 py-1.5 text-xs font-bold outline-none disabled:opacity-50 ${usr.role === 'ADMIN' ? 'text-red-400 border-red-500/30' : usr.role === 'LIDER' ? 'text-brand-primary border-brand-primary/30' : 'text-text-muted border-white/10'}`}
                       >
                         <option value="MEMBRO">Membro</option>
                         <option value="VOLUNTARIO">Voluntário</option>
                         <option value="LIDER">Líder</option>
                         <option value="ADMIN">Administrador</option>
                       </select>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}

      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' })}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-red-400"><div className="bg-red-500/10 p-3 rounded-full"><AlertTriangle className="w-8 h-8" /></div></div>
            <h3 className="text-xl font-bold text-text-primary text-center mb-2">{deleteConfirm.title}?</h3>
            <p className="text-text-muted text-center mb-6 text-sm">Tem certeza que deseja apagar este item permanentemente? Esta ação é irreversível.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: null, title: '' })} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none">Voltar</button>
              <button onClick={executeConfirmDelete} className="flex-1 px-4 py-2.5 rounded-default bg-red-500 hover:bg-red-600 text-white font-semibold transition-all outline-none">Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminModule;