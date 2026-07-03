import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import Avatar from '../components/Avatar';
import { Users, Clock, Video, MapPin, MessageSquare, Edit3, X, CheckCircle, Pin, Trash2, Send, Megaphone, FileText, Quote, Lightbulb, AlertTriangle, ExternalLink, ShieldCheck, Save, Eye, BarChart3, Smile, Plus } from 'lucide-react';

const REACTION_EMOJIS = ['🔥', '❤️', '🙏', '👏', '😂', '🙌'];

const MAX_LINKS_PER_PERSON = 2;

export const TIMELINE_CATEGORIES = [
  { id: 'RESUMO', label: 'Resumo', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { id: 'AVISO', label: 'Aviso', icon: Megaphone, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { id: 'TESTEMUNHO', label: 'Testemunho', icon: Quote, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { id: 'OBSERVACAO', label: 'Observação', icon: Lightbulb, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
];

const LinksModule = ({ user, showNotification }) => {
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('meus_links'); 
  
  const [selectedLink, setSelectedLink] = useState(null); 
  const [activeModalTab, setActiveModalTab] = useState('info'); 
  const [selectedLinkMembers, setSelectedLinkMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const [linkMessages, setLinkMessages] = useState([]);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);
  const [newMsgContent, setNewMsgContent] = useState('');
  const [newMsgCategory, setNewMsgCategory] = useState('RESUMO');
  const [isPostingMsg, setIsPostingMsg] = useState(false);
  const [isPoll, setIsPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);

  const [editingLink, setEditingLink] = useState(null);
  const [formData, setFormData] = useState({});
  const [linkRequests, setLinkRequests] = useState({});
  const [linkToCancel, setLinkToCancel] = useState(null);
  const [myParticipations, setMyParticipations] = useState({});

  // Mapeia o nome do dia (PT) para o índice de getDay() (0=Domingo … 6=Sábado)
  const DAY_TO_NUM = { 'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6 };

  // Link online "ao vivo": entre 15 min antes e 2h30 depois do horário marcado, no dia da semana do Link.
  const isLinkLive = (link) => {
    if (!link?.isOnline || !link.day || !link.time) return false;
    const target = DAY_TO_NUM[link.day];
    if (target === undefined) return false;
    const now = new Date();
    if (now.getDay() !== target) return false;
    const [h, m] = link.time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    const start = new Date(now);
    start.setHours(h, m, 0, 0);
    const open  = start.getTime() - 15 * 60 * 1000;   // 15 min antes
    const close = start.getTime() + 150 * 60 * 1000;  // 2h30 depois
    const t = now.getTime();
    return t >= open && t <= close;
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((Date.now() - date) / 1000);
    if (diffInSeconds < 60) return 'agora mesmo';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min atrás`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h atrás`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const fetchMessagesForLink = async (linkId) => {
    if (!linkId) return;
    setIsFetchingMessages(true);
    try {
      const res = await apiFetch(`/api/links/${linkId}/messages`).catch(() => null);
      if (res && res.ok) setLinkMessages(await res.json());
    } catch (e) {
    } finally {
      setIsFetchingMessages(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const resLinks = await apiFetch('/api/links').catch(() => null);
        if (resLinks && resLinks.ok) setLinks(await resLinks.json());

        if (user?.id) {
          const resMine = await apiFetch(`/api/links/my-participations?userId=${user.id}`).catch(() => null);
          if (resMine && resMine.ok) {
            const dataMine = await resMine.json();
            const map = {};
            dataMine.forEach(p => { map[p.linkId] = p.status; });
            setMyParticipations(map);
          }
        }
      } catch (error) {} finally { setIsLoading(false); }
    };
    fetchData();
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'meus_links' && user?.id) {
      const ledLinks = links.filter(l => l.leaderId === user.id);
      ledLinks.forEach(async (link) => {
        try {
          const res = await apiFetch(`/api/links/${link.id}/participations`).catch(() => null);
          if (res && res.ok) {
            const parts = await res.json();
            setLinkRequests(prev => ({ ...prev, [link.id]: parts.filter(p => p.status === 'PENDENTE') }));
          }
        } catch (e) {}
      });
    }
  }, [activeTab, links, user?.id]);

  const activeParticipationsCount = Object.values(myParticipations).filter(s => s === 'PENDENTE' || s === 'APROVADO').length;
  const reachedLimit = activeParticipationsCount >= MAX_LINKS_PER_PERSON;
  const myActiveLinks = links.filter(l => l.leaderId === user?.id || myParticipations[l.id] === 'APROVADO');

  const handleRequestParticipation = async (link) => {
    if (myParticipations[link.id] || reachedLimit || !user?.id) return;
    
    setMyParticipations(prev => ({ ...prev, [link.id]: 'PENDENTE' }));
    
    try {
      const res = await apiFetch(`/api/links/${link.id}/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        showNotification(`Solicitação enviada para "${link.name}"!`);
      } else throw new Error("Offline");
    } catch (error) { 
      showNotification(`Solicitação registada localmente para "${link.name}".`); 
    }
  };

  const requestCancelParticipation = (link) => setLinkToCancel(link);

  const executeCancelParticipation = async () => {
    if (!linkToCancel || !user?.id) return;
    const link = linkToCancel; 
    setLinkToCancel(null);
    const prevStatus = myParticipations[link.id];
    
    if (prevStatus === 'APROVADO') {
       showNotification(`Foi enviada uma notificação ao líder do "${link.name}" para conversar sobre a sua saída.`);
       setSelectedLink(null);
       return; 
    }

    setMyParticipations(prev => { const next={...prev}; delete next[link.id]; return next; });
    setSelectedLink(null);
    
    try {
      await apiFetch(`/api/links/${link.id}/request`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id })
      });
      showNotification(`Ação confirmada.`);
    } catch (error) { 
      showNotification(`Ação confirmada (Modo Offline).`); 
    }
  };

  const handleApproveReject = async (participationId, linkId, status) => {
    try {
      const res = await apiFetch(`/api/links/participations/${participationId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, leaderUserId: user.id })
      });
      if (res.ok) {
        showNotification(`Membro ${status.toLowerCase()}!`);
        setLinkRequests(prev => ({ ...prev, [linkId]: prev[linkId].filter(p => p.id !== participationId) }));
      }
    } catch (e) {
      showNotification(`Falha na rede ao aprovar.`);
    }
  };

  const handleSaveLinkEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`/api/links/${editingLink.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      if (res.ok) {
        const updated = await res.json();
        setLinks(links.map(l => l.id === updated.id ? updated : l));
        setEditingLink(null);
        showNotification("Link atualizado!");
      } else throw new Error('Falhou');
    } catch (e) {
      setLinks(links.map(l => l.id === editingLink.id ? { ...l, ...formData } : l));
      setEditingLink(null); 
      showNotification("Link atualizado (Modo Offline)!");
    }
  };

  const openModal = async (link, defaultTab = 'info') => {
    setSelectedLink(link);
    setActiveModalTab(defaultTab);
    setIsLoadingMembers(true);
    try {
      const res = await apiFetch(`/api/links/${link.id}/participations`);
      if (res.ok) {
        const parts = await res.json();
        setSelectedLinkMembers(parts.filter(p => p.status === 'APROVADO'));
      }
    } catch(e) {}
    setIsLoadingMembers(false);
    fetchMessagesForLink(link.id);
  };

  const resetComposer = () => { setNewMsgContent(''); setIsPoll(false); setPollOptions(['', '']); };

  const handlePostMessage = async (e) => {
    e.preventDefault();
    if (!newMsgContent.trim() || !user?.id) return;
    const cleanOptions = pollOptions.map(o => o.trim()).filter(Boolean);
    if (isPoll && cleanOptions.length < 2) { showNotification("Uma enquete precisa de pelo menos 2 opções."); return; }
    setIsPostingMsg(true);
    const payload = { content: newMsgContent, category: newMsgCategory };
    if (isPoll) payload.pollOptions = cleanOptions;
    try {
      const res = await apiFetch(`/api/links/${selectedLink.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        resetComposer();
        showNotification(isPoll ? "Enquete publicada!" : "Publicado no mural!");
        fetchMessagesForLink(selectedLink.id);
      } else throw new Error('Offline');
    } catch (err) {
      const mockMsg = {
         id: Date.now().toString(), content: newMsgContent, category: newMsgCategory, isPinned: false,
         authorId: user?.id, author: { name: user?.name }, createdAt: new Date().toISOString(),
         reactions: [], poll: isPoll ? { options: cleanOptions.map(text => ({ text, count: 0 })), totalVotes: 0, myVote: null } : null
      };
      setLinkMessages([mockMsg, ...linkMessages]);
      resetComposer();
      showNotification("Publicado no mural (Modo Local)!");
    } finally { setIsPostingMsg(false); }
  };

  const handleReact = async (msgId, emoji) => {
    setLinkMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (idx >= 0) {
        const r = reactions[idx];
        if (r.mine) { const count = r.count - 1; if (count <= 0) reactions.splice(idx, 1); else reactions[idx] = { ...r, count, mine: false }; }
        else reactions[idx] = { ...r, count: r.count + 1, mine: true };
      } else reactions.push({ emoji, count: 1, mine: true });
      return { ...m, reactions };
    }));
    try {
      await apiFetch(`/api/links/messages/${msgId}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
    } catch (e) {}
  };

  const handleVote = async (msgId, optionIndex) => {
    setLinkMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.poll) return m;
      const prevVote = m.poll.myVote;
      if (prevVote === optionIndex) return m;
      const options = m.poll.options.map((o, i) => {
        let count = o.count;
        if (i === optionIndex) count++;
        if (i === prevVote) count--;
        return { ...o, count };
      });
      const totalVotes = prevVote === null || prevVote === undefined ? (m.poll.totalVotes || 0) + 1 : m.poll.totalVotes;
      return { ...m, poll: { ...m.poll, options, myVote: optionIndex, totalVotes } };
    }));
    try {
      await apiFetch(`/api/links/messages/${msgId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionIndex }) });
    } catch (e) {}
  };

  const renderPoll = (msg) => {
    if (!msg.poll) return null;
    const total = msg.poll.totalVotes || 0;
    return (
      <div className="mt-3 space-y-2">
        {msg.poll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
          const mine = msg.poll.myVote === i;
          return (
            <button key={i} type="button" onClick={() => handleVote(msg.id, i)} className={`relative w-full text-left rounded-md border overflow-hidden transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${mine ? 'border-brand-primary' : 'border-white/10 hover:border-white/20'}`}>
              <div className="absolute inset-y-0 left-0 bg-brand-primary/20 transition-all" style={{ width: `${pct}%` }}></div>
              <div className="relative flex justify-between items-center px-3 py-2 text-sm gap-2">
                <span className={`font-medium ${mine ? 'text-brand-primary' : 'text-text-primary'}`}>{mine ? '✓ ' : ''}{opt.text}</span>
                <span className="text-xs text-text-muted shrink-0">{pct}% · {opt.count}</span>
              </div>
            </button>
          );
        })}
        <div className="text-[10px] text-text-muted">{total} voto{total !== 1 ? 's' : ''}</div>
      </div>
    );
  };

  const renderReactions = (msg) => (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {(msg.reactions || []).map(r => (
        <button key={r.emoji} type="button" onClick={() => handleReact(msg.id, r.emoji)} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${r.mine ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary' : 'bg-surface-card border-white/10 text-text-muted hover:border-white/20'}`}>
          <span>{r.emoji}</span><span className="font-semibold">{r.count}</span>
        </button>
      ))}
      <div className="relative group/react">
        <button type="button" aria-label="Reagir" className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-card border border-white/10 text-text-muted hover:text-white hover:border-white/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Smile className="w-3.5 h-3.5" /></button>
        <div className="absolute z-10 bottom-full left-0 mb-1 hidden group-hover/react:flex group-focus-within/react:flex gap-1 bg-surface-card border border-white/10 rounded-full px-2 py-1 shadow-lg">
          {REACTION_EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => handleReact(msg.id, e)} className="hover:scale-125 transition-transform text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded">{e}</button>
          ))}
        </div>
      </div>
    </div>
  );

  const handleTogglePin = async (msgId) => {
    try {
      const res = await apiFetch(`/api/links/messages/${msgId}/pin`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaderUserId: user.id })
      });
      if (res.ok) fetchMessagesForLink(selectedLink.id);
    } catch (err) {}
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await apiFetch(`/api/links/messages/${msgId}`, { method: 'DELETE' }).catch(() => null);
      setLinkMessages(prev => prev.filter(m => m.id !== msgId));
      showNotification("Mensagem apagada com sucesso.");
    } catch(err) { 
      setLinkMessages(prev => prev.filter(m => m.id !== msgId)); 
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-text-primary">Diretório de Links</h2>
        <p className="text-sm text-text-muted mt-1">Conecte-se com pequenos grupos.</p>
      </div>

      <div className="flex gap-4 border-b border-white/10 mb-4">
        <button onClick={() => setActiveTab('meus_links')} className={`pb-2 text-sm font-semibold transition-colors ${activeTab === 'meus_links' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>Meus Links</button>
        <button onClick={() => setActiveTab('explorar')} className={`pb-2 text-sm font-semibold transition-colors ${activeTab === 'explorar' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>Explorar Links</button>
      </div>

      {activeTab === 'meus_links' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
           {editingLink ? (
              <div className="bg-surface-card p-5 rounded-default border border-brand-primary/30 shadow-level-2">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-text-primary flex items-center gap-2"><Edit3 className="w-5 h-5 text-brand-primary"/> Editar Link</h3>
                  <button onClick={() => setEditingLink(null)} className="p-1 hover:bg-white/5 rounded-full"><X className="w-5 h-5 text-text-muted"/></button>
                </div>
                <form onSubmit={handleSaveLinkEdit} className="space-y-4">
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Nome do Link" className="w-full bg-surface-dark border border-white/10 rounded-default px-4 py-3 text-text-primary focus:border-brand-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                  <div className="grid grid-cols-2 gap-4">
                    <select value={formData.day} onChange={(e) => setFormData({...formData, day: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-default px-4 py-3 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                      {['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input required type="time" value={formData.time} onChange={(e) => setFormData({...formData, time: e.target.value})} className="w-full bg-surface-dark border border-white/10 rounded-default px-4 py-3 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={!formData.isOnline} onChange={() => setFormData({...formData, isOnline: false, locationUrl: ''})} name="type"/> Presencial</label>
                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer"><input type="radio" checked={formData.isOnline} onChange={() => setFormData({...formData, isOnline: true, locationUrl: ''})} name="type"/> Online</label>
                  </div>
                  <input type="text" value={formData.locationUrl || ''} onChange={(e) => setFormData({...formData, locationUrl: e.target.value})} placeholder={formData.isOnline ? "Link do Meet/Zoom" : "Endereço Físico"} className="w-full bg-surface-dark border border-white/10 rounded-default px-4 py-3 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                  <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Descrição do grupo / Público alvo" rows="3" className="w-full bg-surface-dark border border-white/10 rounded-default px-4 py-3 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                  <button type="submit" className="w-full bg-brand-primary text-white py-3 rounded-default font-bold hover:bg-brand-secondary transition-all flex items-center justify-center gap-2">
                    <Save className="w-4 h-4"/> Guardar Alterações
                  </button>
                </form>
              </div>
           ) : myActiveLinks.length === 0 ? (
             <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Você ainda não participa de nenhum Link. Explore as opções e conecte-se!</div>
           ) : (
             myActiveLinks.map(link => {
                const isLeader = link.leaderId === user?.id;
                const pending = linkRequests[link.id] || [];
                
                return (
                  <div key={link.id} className="bg-surface-card rounded-default border border-white/10 overflow-hidden shadow-level-2">
                    <div className="p-5 flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div>
                        <h3 className="font-display font-bold text-xl text-text-primary flex items-center gap-2">
                          {link.name} {isLeader && <span className="text-[9px] bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Líder</span>}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-text-muted">
                          <span className="flex items-center gap-1 bg-surface-dark px-2 py-1 rounded-md"><Clock className="w-3.5 h-3.5 text-brand-primary"/> {link.day}, {link.time}</span>
                          <span className="flex items-center gap-1 bg-surface-dark px-2 py-1 rounded-md">{link.isOnline ? <Video className="w-3.5 h-3.5 text-brand-primary"/> : <MapPin className="w-3.5 h-3.5 text-brand-primary"/>} {link.isOnline ? 'Online' : 'Presencial'}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {isLinkLive(link) && (
                          <a href={link.locationUrl || '#'} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-400 px-3 py-2 rounded-default transition-colors animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.55)]"><Video className="w-3.5 h-3.5"/> Entrar Agora</a>
                        )}
                        <button onClick={() => openModal(link, 'info')} className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-emerald-400 hover:text-white bg-emerald-500/10 px-3 py-2 rounded-default transition-colors"><Eye className="w-3.5 h-3.5"/> Detalhes</button>
                        <button onClick={() => openModal(link, 'mural')} className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-blue-400 hover:text-white bg-blue-500/10 px-3 py-2 rounded-default transition-colors"><MessageSquare className="w-3.5 h-3.5"/> Mural</button>
                        {isLeader && (
                          <button onClick={() => { setEditingLink(link); setFormData({...link}); }} className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-brand-primary hover:text-white bg-brand-primary/10 px-3 py-2 rounded-default transition-colors"><Edit3 className="w-3.5 h-3.5"/> Editar</button>
                        )}
                      </div>
                    </div>
                    
                    {isLeader && (
                      <div className="p-5 border-t border-white/5 bg-surface-dark/30">
                        <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Users className="w-4 h-4"/> Solicitações de Entrada ({pending.length})</h4>
                        {pending.length === 0 ? (
                          <p className="text-xs text-text-muted italic">Não há pedidos pendentes no momento.</p>
                        ) : (
                          <div className="space-y-2">
                            {pending.map(req => (
                              <div key={req.id} className="flex justify-between items-center bg-surface-card p-3 rounded-md border border-white/5">
                                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Avatar name={req.user?.name} src={req.user?.profileImage} size={28} /> {req.user?.name || 'Utilizador'}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => handleApproveReject(req.id, link.id, 'RECUSADO')} className="p-2 rounded-md hover:bg-red-500/20 text-red-400 transition-colors"><X className="w-4 h-4"/></button>
                                  <button onClick={() => handleApproveReject(req.id, link.id, 'APROVADO')} className="p-2 rounded-md hover:bg-green-500/20 text-green-400 transition-colors"><CheckCircle className="w-4 h-4"/></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
             })
           )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-default border text-sm ${reachedLimit ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-surface-card border-white/5 text-text-muted'}`}>
            <span>Você participa de <span className="font-bold text-text-primary">{activeParticipationsCount}</span> de <span className="font-bold text-text-primary">{MAX_LINKS_PER_PERSON}</span> Links.</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
          ) : links.length === 0 ? (
            <div className="bg-surface-card p-10 rounded-default border border-white/5 text-center text-text-muted">Nenhum Link cadastrado na plataforma ainda.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {links.map(link => {
                const status = myParticipations[link.id];
                const isApproved = status === 'APROVADO';
                const isPending = status === 'PENDENTE';
                const isLeader = link.leaderId === user?.id;
                const disableRequest = reachedLimit && !status;

                if (isApproved || isLeader) return null;

                return (
                  <div key={link.id} className="bg-surface-card p-3 rounded-default border border-white/5 shadow-level-2 flex flex-col gap-2 hover:border-brand-primary/30 transition-colors">
                    <h3 className="font-display font-bold text-sm text-text-primary leading-tight line-clamp-2">{link.name}</h3>
                    <div className="text-[11px] text-text-muted truncate">Líder: {link.leader?.name || 'Sem líder'}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted bg-surface-dark/50 px-2 py-1 rounded-md border border-white/5">
                      <Clock className="w-3 h-3 text-brand-primary shrink-0"/> <span className="truncate">{link.day}, {link.time}</span>
                    </div>

                    {isPending ? (
                      <div className="flex items-center gap-1 mt-auto">
                        <span className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold bg-surface-dark border border-amber-500/30 text-amber-400"><Clock className="w-3 h-3 shrink-0"/> Pendente</span>
                        <button onClick={() => requestCancelParticipation(link)} title="Cancelar solicitação" className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-3.5 h-3.5"/></button>
                      </div>
                    ) : (
                      <button onClick={() => handleRequestParticipation(link)} disabled={disableRequest} className={`w-full mt-auto py-1.5 rounded-md text-[11px] font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${disableRequest ? 'bg-surface-dark border border-white/5 text-text-muted/50 cursor-not-allowed' : 'bg-surface-dark border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-white'}`}>Solicitar</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedLink && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedLink(null)}>
          <div className="bg-surface-card border border-white/10 rounded-default shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 bg-gradient-to-b from-brand-primary/10 to-transparent shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-display font-bold text-2xl text-white mb-1">{selectedLink.name}</h3>
                  <p className="text-sm text-brand-primary font-semibold flex items-center gap-1"><Users className="w-4 h-4"/> Líder: {selectedLink.leader?.name}</p>
                </div>
                <button onClick={() => setSelectedLink(null)} className="p-1 hover:bg-white/10 rounded-full text-text-muted hover:text-white transition-colors"><X className="w-5 h-5"/></button>
              </div>
              <div className="flex gap-4 mt-6 border-b border-white/10">
                <button onClick={() => setActiveModalTab('info')} className={`pb-2 text-sm font-semibold transition-colors ${activeModalTab === 'info' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>Detalhes</button>
                <button onClick={() => { setActiveModalTab('mural'); fetchMessagesForLink(selectedLink.id); }} className={`pb-2 text-sm font-semibold transition-colors flex items-center gap-1.5 ${activeModalTab === 'mural' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}><MessageSquare className="w-4 h-4"/> Mural / Timeline</button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto">
              {activeModalTab === 'info' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {selectedLink.description && (
                    <div><h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Sobre o Link</h4><p className="text-sm text-text-primary leading-relaxed bg-surface-dark p-3 rounded-md border border-white/5">{selectedLink.description}</p></div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Local / Acesso</h4>
                    {selectedLink.isOnline ? (
                      <a href={selectedLink.locationUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-default transition-colors"><Video className="w-5 h-5"/> Entrar na Chamada (Meet) <ExternalLink className="w-4 h-4 ml-1 opacity-70"/></a>
                    ) : (
                      <div className="flex items-center gap-3 bg-surface-dark p-3 rounded-md border border-white/5 text-sm text-text-primary"><MapPin className="w-5 h-5 text-brand-primary shrink-0"/><span>{selectedLink.locationUrl || 'Endereço não informado.'}</span></div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2">Membros do Grupo {isLoadingMembers && <span className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></span>}</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedLinkMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-surface-dark border border-white/5 px-3 py-1.5 rounded-full text-xs font-semibold text-text-primary" title={m.user?.name || ''}>
                          <Avatar name={m.user?.name} src={m.user?.profileImage} size={20} />{m.user?.name?.split(' ')[0] || 'Usuário'}
                        </div>
                      ))}
                      {selectedLinkMembers.length === 0 && !isLoadingMembers && <span className="text-xs text-text-muted italic">Nenhum membro aprovado ainda.</span>}
                    </div>
                  </div>
                  
                  {selectedLink.leaderId !== user?.id && myParticipations[selectedLink.id] === 'APROVADO' && (
                    <div className="pt-6 flex justify-center">
                      <button onClick={() => setLinkToCancel(selectedLink)} className="text-xs text-text-muted hover:text-text-primary underline decoration-white/20 underline-offset-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Solicitar desligamento do grupo</button>
                    </div>
                  )}
                </div>
              )}

              {activeModalTab === 'mural' && (
                <div className="space-y-8 animate-in fade-in duration-200">
                  <form onSubmit={handlePostMessage} className="bg-surface-dark border border-white/10 rounded-default p-4 shadow-sm">
                    <textarea value={newMsgContent} onChange={(e) => setNewMsgContent(e.target.value)} placeholder={isPoll ? "Qual é a pergunta da enquete?" : "O que deseja partilhar com o Link?"} className="w-full bg-surface-card border border-white/5 rounded-md px-4 py-3 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary transition-colors resize-none min-h-[80px]" required />

                    {isPoll && (
                      <div className="mt-3 space-y-2 animate-in fade-in duration-200">
                        {pollOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="text" value={opt} onChange={(e) => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))} placeholder={`Opção ${i + 1}`} maxLength={80} className="flex-1 bg-surface-card border border-white/5 rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary transition-colors" />
                            {pollOptions.length > 2 && (
                              <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} aria-label="Remover opção" className="p-2 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"><X className="w-4 h-4" /></button>
                            )}
                          </div>
                        ))}
                        {pollOptions.length < 6 && (
                          <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])} className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-secondary transition-colors"><Plus className="w-3.5 h-3.5" /> Adicionar opção</button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
                      <div className="flex flex-wrap gap-2">
                        {TIMELINE_CATEGORIES.map(cat => {
                          const isSelected = newMsgCategory === cat.id; const Icon = cat.icon;
                          return (
                            <button key={cat.id} type="button" onClick={() => setNewMsgCategory(cat.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${isSelected ? `${cat.bg} ${cat.border} ${cat.color} border ring-1 ring-current` : 'bg-surface-card border border-white/5 text-text-muted hover:text-white'}`}>
                              <Icon className="w-3.5 h-3.5" /> {cat.label}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setIsPoll(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${isPoll ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary border ring-1 ring-current' : 'bg-surface-card border border-white/5 text-text-muted hover:text-white'}`}>
                          <BarChart3 className="w-3.5 h-3.5" /> Enquete
                        </button>
                      </div>
                      <button type="submit" disabled={!newMsgContent.trim() || isPostingMsg} className="flex items-center gap-2 bg-brand-primary text-white px-5 py-2 rounded-default text-sm font-bold hover:bg-brand-secondary transition-all disabled:opacity-50 w-full sm:w-auto justify-center">
                        {isPostingMsg ? 'A publicar...' : <><Send className="w-4 h-4" /> Partilhar</>}
                      </button>
                    </div>
                  </form>

                  <div>
                    {isFetchingMessages ? (
                       <div className="flex justify-center py-5"><div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
                    ) : linkMessages.length === 0 ? (
                       <div className="text-center text-text-muted py-10 bg-surface-dark rounded-default border border-dashed border-white/10">O mural está vazio. Seja o primeiro a publicar!</div>
                    ) : (
                      <div className="space-y-0">
                        {linkMessages.filter(m => m.isPinned).length > 0 && (
                          <div className="mb-6 relative">
                            <div className="flex items-center gap-2 mb-4 text-amber-400"><Pin className="w-4 h-4" /><h3 className="text-[10px] font-bold uppercase tracking-wider">Fixadas pelo Líder</h3></div>
                            {linkMessages.filter(m => m.isPinned).map(msg => {
                              const isLeader = selectedLink.leaderId === user?.id; const isAuthor = msg.authorId === user?.id;
                              const catInfo = TIMELINE_CATEGORIES.find(c => c.id === msg.category) || TIMELINE_CATEGORIES[3]; const Icon = catInfo.icon;
                              return (
                                <div key={msg.id} className="relative pl-8 pb-4 group mb-2">
                                  <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center border ${catInfo.border} ${catInfo.bg} ring-2 ring-amber-400/30`}><Icon className={`w-4 h-4 ${catInfo.color}`} /></div>
                                  <div className="bg-gradient-to-br from-surface-dark to-amber-500/5 border border-amber-500/30 rounded-default p-4 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-2"><span className="font-bold text-text-primary text-sm">{msg.author?.name || 'Membro'}</span>{msg.authorId === selectedLink.leaderId && <span className="flex items-center gap-1 bg-brand-primary/10 text-brand-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase"><ShieldCheck className="w-2.5 h-2.5" /> Líder</span>}<span className="text-text-muted text-[10px]">• {formatTimeAgo(msg.createdAt)}</span></div>
                                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        {isLeader && <button onClick={() => handleTogglePin(msg.id)} title="Desafixar" className="p-1.5 rounded-md text-amber-400 hover:bg-white/10 transition-colors"><Pin className="w-4 h-4" /></button>}
                                        {(isLeader || isAuthor) && <button onClick={() => handleDeleteMessage(msg.id)} title="Excluir mensagem" className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                                      </div>
                                    </div>
                                    <div className="mb-2"><span className={`text-[9px] font-bold uppercase tracking-wider ${catInfo.color}`}>{catInfo.label}</span></div>
                                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    {renderPoll(msg)}
                                    {renderReactions(msg)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {linkMessages.filter(m => !m.isPinned).map((msg, index, arr) => {
                          const isLeader = selectedLink.leaderId === user?.id; const isAuthor = msg.authorId === user?.id;
                          const catInfo = TIMELINE_CATEGORIES.find(c => c.id === msg.category) || TIMELINE_CATEGORIES[3]; const Icon = catInfo.icon; const isLast = index === arr.length - 1;
                          return (
                            <div key={msg.id} className="relative pl-8 pb-8 group">
                              {!isLast && <div className="absolute top-8 bottom-0 left-[15px] w-[2px] bg-white/5"></div>}
                              <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center border ${catInfo.border} ${catInfo.bg}`}><Icon className={`w-4 h-4 ${catInfo.color}`} /></div>
                              <div className="bg-surface-dark border border-white/5 rounded-default p-4 shadow-sm hover:border-white/10 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2"><span className="font-bold text-text-primary text-sm">{msg.author?.name || 'Membro'}</span>{msg.authorId === selectedLink.leaderId && <span className="flex items-center gap-1 bg-brand-primary/10 text-brand-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase"><ShieldCheck className="w-2.5 h-2.5" /> Líder</span>}<span className="text-text-muted text-[10px]">• {formatTimeAgo(msg.createdAt)}</span></div>
                                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    {isLeader && <button onClick={() => handleTogglePin(msg.id)} title="Fixar no topo" className="p-1.5 rounded-md text-text-muted hover:text-amber-400 hover:bg-white/10 transition-colors"><Pin className="w-4 h-4" /></button>}
                                    {(isLeader || isAuthor) && <button onClick={() => handleDeleteMessage(msg.id)} title="Excluir mensagem" className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                                  </div>
                                </div>
                                <div className="mb-2"><span className={`text-[9px] font-bold uppercase tracking-wider ${catInfo.color}`}>{catInfo.label}</span></div>
                                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                {renderPoll(msg)}
                                {renderReactions(msg)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {linkToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setLinkToCancel(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-amber-400"><div className="bg-amber-500/10 p-3 rounded-full"><AlertTriangle className="w-8 h-8" /></div></div>
            <h3 className="text-xl font-bold text-text-primary text-center mb-2">{myParticipations[linkToCancel.id] === 'APROVADO' ? 'Deseja sair do grupo?' : 'Cancelar Solicitação?'}</h3>
            <p className="text-text-muted text-center mb-6 text-sm">
              {myParticipations[linkToCancel.id] === 'APROVADO' 
                ? `Antes de sair, é importante conversar com o líder. Enviaremos uma notificação para que ele possa acolher você nesse processo.` 
                : `Tem certeza que deseja cancelar sua solicitação para participar do Link "${linkToCancel.name}"?`}
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setLinkToCancel(null)} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Voltar</button>
              <button onClick={executeCancelParticipation} className="flex-1 px-4 py-2.5 rounded-default bg-red-500 hover:bg-red-600 text-white font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinksModule;