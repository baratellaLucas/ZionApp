import React, { useState, useEffect, Suspense, lazy } from 'react';
import { apiFetch } from '../api';
import Avatar from '../components/Avatar';
import { getAreaIconComponent } from '../utils/areaIcons';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { extractCheckinCode } from '../utils/qrCheckin';
const QrScanner = lazy(() => import('../components/QrScanner'));
import {
  CalendarDays, Smile, Megaphone, Briefcase, Clock,
  CheckCircle, GraduationCap, Users, MessageSquare, ShieldCheck,
  Award, Gift, X, BookOpen, Trash2, AlertTriangle, Heart,
  Send, Pin, BarChart3, Plus, Loader2, Eye, Camera
} from 'lucide-react';

// Categorias e emojis do mural da área (mesma lógica do mural de Links)
const AREA_MURAL_CATS = [
  { id: 'AVISO', label: 'Aviso', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { id: 'ESCALA', label: 'Escala', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { id: 'TREINO', label: 'Treino', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 'GERAL', label: 'Geral', color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/20' },
];
const MURAL_EMOJIS = ['🔥', '❤️', '🙏', '👏', '😂', '🙌'];


// Área de intercessão: detecta pelo nome normalizado (sem acentos)
const isIntercessionName = (name) => {
  const n = (name || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
  return n.includes('interce') || n.includes('interse');
};

// Ícone vem de area.icon (escolhido no Admin); a cor ainda cicla por índice para variar visualmente.
const AREA_COLOR_STYLES = [
  { color: 'text-amber-500',   bg: 'bg-amber-500/10' },
  { color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { color: 'text-purple-500',  bg: 'bg-purple-500/10' },
  { color: 'text-blue-500',    bg: 'bg-blue-500/10' },
];
const DEFAULT_AREA_STYLE = { Icon: Briefcase, color: 'text-brand-primary', bg: 'bg-brand-primary/10' };

const MAX_AREAS_PER_PERSON = 2;

// Horários pré-definidos (de 30 em 30 min) para a criação de escala — evita digitação livre de hora
const SHIFT_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

// Admin/Pastor ou quem recebeu acesso administrativo de Voluntários (Admin > Membros) vê/gerencia
// qualquer área sem precisar participar dela.
const isAreaStaff = (u) => u?.role === 'ADMIN' || u?.role === 'PASTOR' || !!u?.canManageAreas;

const VoluntariosModule = ({ user, setUser, showNotification, intent, onIntentHandled }) => {
  const [activeTab,        setActiveTab]        = useState('minhas_areas');
  // areas: catálogo vindo do backend (GET /api/areas)
  const [areas,            setAreas]            = useState([]);
  // myAreas: participações do utilizador (status PENDENTE ou APROVADO), vindas do backend
  const [myAreas,          setMyAreas]          = useState([]);
  const [selectedAreaId,   setSelectedAreaId]   = useState(null);
  const [modalTab,         setModalTab]         = useState('escalas');
  const [availability,     setAvailability]     = useState({});
  const [trainingProgress, setTrainingProgress] = useState(40);
  const [areaToCancel,     setAreaToCancel]     = useState(null); // controla modal de confirmação interno

  const [shifts,           setShifts]           = useState([]);
  const [announcements,    setAnnouncements]    = useState([]);
  const [areaRequests,     setAreaRequests]     = useState({}); // { areaId: [participações PENDENTE] }
  const [areaLeaveRequests,setAreaLeaveRequests]= useState({}); // { areaId: [participações SAIDA_PENDENTE] }
  const [areaApproved,     setAreaApproved]     = useState({}); // { areaId: [membros aprovados] }
  const [areaShifts,       setAreaShifts]       = useState({}); // { areaId: [escalas] }
  const [shiftDrafts,      setShiftDrafts]      = useState({}); // { areaId: { date, volunteerId, positionId } }
  const [areaPositions,    setAreaPositions]    = useState({}); // { areaId: [AreaPosition] }
  const [newPositionName,  setNewPositionName]  = useState({}); // { areaId: string }
  const [events,           setEvents]           = useState([]);
  const [eventRsvps,       setEventRsvps]       = useState([]); // refIds de eventos VOLUNTARIO com RSVP feito
  const [eventCheckins,    setEventCheckins]    = useState([]); // refIds com check-in real (pontos só aqui)
  const [checkinEvent,     setCheckinEvent]     = useState(null); // ocorrência em check-in
  const [checkinCode,      setCheckinCode]      = useState('');
  const [checkingInEvent,  setCheckingInEvent]  = useState(false);
  const [showQrScanner,    setShowQrScanner]    = useState(false);
  const [scheduleEventId,  setScheduleEventId]  = useState({}); // { areaId: eventId }
  const [availableForEvent,setAvailableForEvent]= useState({}); // { areaId: [userId] }
  const [isLoading,        setIsLoading]        = useState(true);
  // Pedidos de oração (equipe de intercessão)
  const [canViewPrayers,   setCanViewPrayers]   = useState(false);
  const [prayers,          setPrayers]          = useState([]);
  // Mural da área
  const [muralMsgs,        setMuralMsgs]        = useState([]);
  const [muralContent,     setMuralContent]     = useState('');
  const [muralCat,         setMuralCat]         = useState('AVISO');
  const [muralPoll,        setMuralPoll]        = useState(false);
  const [muralOptions,     setMuralOptions]     = useState(['', '']);
  const [muralPosting,     setMuralPosting]     = useState(false);
  const [muralLoading,     setMuralLoading]     = useState(false);

  const loadMural = async (areaId) => {
    if (!areaId) return;
    setMuralLoading(true);
    try {
      const res = await apiFetch(`/api/areas/${areaId}/messages`).catch(() => null);
      if (res && res.ok) setMuralMsgs(await res.json());
    } catch { /* ignora */ } finally { setMuralLoading(false); }
  };
  const handlePostMural = async (e) => {
    e.preventDefault();
    if (!muralContent.trim() || !selectedAreaId) return;
    const opts = muralOptions.map(o => o.trim()).filter(Boolean);
    if (muralPoll && opts.length < 2) { showNotification('Uma enquete precisa de pelo menos 2 opções.'); return; }
    setMuralPosting(true);
    const body = { content: muralContent.trim(), category: muralCat };
    if (muralPoll) body.pollOptions = opts;
    try {
      const res = await apiFetch(`/api/areas/${selectedAreaId}/messages`, { method: 'POST', body });
      if (res.ok) {
        setMuralContent(''); setMuralPoll(false); setMuralOptions(['', '']);
        showNotification(muralPoll ? 'Enquete publicada!' : 'Publicado no mural!');
        loadMural(selectedAreaId);
      } else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Não foi possível publicar.'); }
    } catch { showNotification('Falha de rede ao publicar.'); }
    finally { setMuralPosting(false); }
  };
  const handleMuralDelete = async (id) => {
    try { await apiFetch(`/api/areas/messages/${id}`, { method: 'DELETE' }); setMuralMsgs(prev => prev.filter(m => m.id !== id)); showNotification('Mensagem apagada.'); }
    catch { showNotification('Falha ao apagar.'); }
  };
  const handleMuralPin = async (id) => {
    try { const res = await apiFetch(`/api/areas/messages/${id}/pin`, { method: 'PATCH' }); if (res.ok) loadMural(selectedAreaId); }
    catch { showNotification('Falha ao fixar.'); }
  };
  const handleMuralReact = async (id, emoji) => {
    setMuralMsgs(prev => prev.map(m => {
      if (m.id !== id) return m;
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (idx >= 0) { const r = reactions[idx]; if (r.mine) { const c = r.count - 1; if (c <= 0) reactions.splice(idx, 1); else reactions[idx] = { ...r, count: c, mine: false }; } else reactions[idx] = { ...r, count: r.count + 1, mine: true }; }
      else reactions.push({ emoji, count: 1, mine: true });
      return { ...m, reactions };
    }));
    try { await apiFetch(`/api/areas/messages/${id}/react`, { method: 'POST', body: { emoji } }); } catch { /* ignora */ }
  };
  const handleMuralVote = async (id, optionIndex) => {
    setMuralMsgs(prev => prev.map(m => {
      if (m.id !== id || !m.poll) return m;
      const prevVote = m.poll.myVote;
      if (prevVote === optionIndex) return m;
      const options = m.poll.options.map((o, i) => { let c = o.count; if (i === optionIndex) c++; if (i === prevVote) c--; return { ...o, count: c }; });
      const totalVotes = prevVote === null || prevVote === undefined ? (m.poll.totalVotes || 0) + 1 : m.poll.totalVotes;
      return { ...m, poll: { ...m.poll, options, myVote: optionIndex, totalVotes } };
    }));
    try { await apiFetch(`/api/areas/messages/${id}/vote`, { method: 'POST', body: { optionIndex } }); } catch { /* ignora */ }
  };

  const loadPrayers = async () => {
    try {
      const res = await apiFetch('/api/prayer-requests').catch(() => null);
      if (res && res.ok) setPrayers(await res.json());
    } catch { /* ignora */ }
  };
  const togglePrayer = async (id) => {
    try {
      const res = await apiFetch(`/api/prayer-requests/${id}`, { method: 'PATCH' });
      if (res.ok) { const p = await res.json(); setPrayers(prev => prev.map(x => x.id === id ? { ...x, status: p.status } : x)); }
    } catch { showNotification('Falha ao atualizar.'); }
  };

  // Lista de pedidos de oração (usada na aba Intercessão e no modal da área)
  const renderPrayerList = () => (
    prayers.length === 0 ? (
      <div className="text-center text-text-muted py-10 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Nenhum pedido de oração no momento. 🙏</div>
    ) : (
      <div className="space-y-3">
        {prayers.map(p => (
          <div key={p.id} className={`bg-surface-dark border rounded-default p-4 ${p.status === 'ORADO' ? 'border-emerald-500/20' : 'border-white/5'}`}>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Avatar name={p.user?.name} src={p.user?.profileImage} size={24}/> {p.user?.name || 'Membro'}</div>
                <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{p.content}</p>
                <div className="text-[11px] text-text-muted mt-2">{new Date(p.createdAt).toLocaleString('pt-BR')}</div>
              </div>
              <button onClick={() => togglePrayer(p.id)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${p.status === 'ORADO' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-pink-400 bg-pink-500/10 border-pink-500/30'}`}>
                {p.status === 'ORADO' ? '✓ Orado' : 'Marcar orado'}
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  );

  // Helpers do mural da área (reações + enquete)
  const renderMuralPoll = (m) => {
    if (!m.poll) return null;
    const total = m.poll.totalVotes || 0;
    return (
      <div className="mt-3 space-y-2">
        {m.poll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
          const mine = m.poll.myVote === i;
          return (
            <button key={i} type="button" onClick={() => handleMuralVote(m.id, i)} className={`relative w-full text-left rounded-md border overflow-hidden transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${mine ? 'border-brand-primary' : 'border-white/10 hover:border-white/20'}`}>
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
  const renderMuralReactions = (m) => (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {(m.reactions || []).map(r => (
        <button key={r.emoji} type="button" onClick={() => handleMuralReact(m.id, r.emoji)} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${r.mine ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary' : 'bg-surface-card border-white/10 text-text-muted hover:border-white/20'}`}>
          <span>{r.emoji}</span><span className="font-semibold">{r.count}</span>
        </button>
      ))}
      <div className="relative group/react">
        <button type="button" aria-label="Reagir" className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-card border border-white/10 text-text-muted hover:text-white hover:border-white/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Smile className="w-3.5 h-3.5" /></button>
        <div className="absolute z-10 bottom-full left-0 mb-1 hidden group-hover/react:flex group-focus-within/react:flex gap-1 bg-surface-card border border-white/10 rounded-full px-2 py-1 shadow-lg">
          {MURAL_EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => handleMuralReact(m.id, e)} className="hover:scale-125 transition-transform text-sm outline-none rounded">{e}</button>
          ))}
        </div>
      </div>
    </div>
  );

  // Ação vinda de uma notificação (ex: "Você foi escalado") → garante a aba "Minhas Áreas"
  useEffect(() => {
    if (!intent) return;
    if (intent === 'escala') setActiveTab('minhas_areas');
    onIntentHandled?.();
  }, [intent]);

  // ─── fetch de áreas, participações, escalas e comunicados ─────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const query = user?.id ? `?userId=${user.id}` : '';
        const [resAreas, resMine, resShifts, resAnn, resPoints, resPray, resEvents, resEventParts] = await Promise.all([
          apiFetch(`/api/areas`).catch(() => null),
          user?.id ? apiFetch(`/api/areas/my-participations?userId=${user.id}`).catch(() => null) : null,
          apiFetch(`/api/shifts${query}`).catch(() => null),
          apiFetch(`/api/announcements?type=VOLUNTARIO`).catch(() => null),
          apiFetch(`/api/points/mine`).catch(() => null),
          apiFetch(`/api/prayer-requests/access`).catch(() => null),
          apiFetch(`/api/events`).catch(() => null),
          apiFetch(`/api/events/my-participations`).catch(() => null),
        ]);
        if (resAreas && resAreas.ok) setAreas(await resAreas.json());
        if (resMine && resMine.ok) setMyAreas(await resMine.json());
        if (resShifts && resShifts.ok) setShifts(await resShifts.json());
        if (resAnn && resAnn.ok) setAnnouncements(await resAnn.json());
        if (resEvents && resEvents.ok) setEvents(await resEvents.json());
        if (resEventParts && resEventParts.ok) {
          const parts = await resEventParts.json();
          setEventRsvps(parts.map(p => p.refId));
          setEventCheckins(parts.filter(p => p.checkedInAt).map(p => p.refId));
        }
        if (resPoints && resPoints.ok) {
          const awards = await resPoints.json();
          if (awards.some(a => a.ruleKey === 'TRAINING_COMPLETION')) setTrainingProgress(100);
        }
        if (resPray && resPray.ok) {
          const { canView } = await resPray.json();
          setCanViewPrayers(!!canView);
          if (canView) loadPrayers();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  // Busca solicitações, membros aprovados e escalas das áreas que o usuário lidera
  const loadLeaderArea = async (areaId) => {
    try {
      const [resP, resS] = await Promise.all([
        apiFetch(`/api/areas/${areaId}/participations`).catch(() => null),
        apiFetch(`/api/areas/${areaId}/shifts`).catch(() => null),
      ]);
      if (resP && resP.ok) {
        const parts = await resP.json();
        setAreaRequests(prev => ({ ...prev, [areaId]: parts.filter(p => p.status === 'PENDENTE') }));
        setAreaLeaveRequests(prev => ({ ...prev, [areaId]: parts.filter(p => p.status === 'SAIDA_PENDENTE') }));
        setAreaApproved(prev => ({ ...prev, [areaId]: parts.filter(p => p.status === 'APROVADO' || p.status === 'SAIDA_PENDENTE').map(p => p.user).filter(Boolean) }));
      }
      if (resS && resS.ok) { const s = await resS.json(); setAreaShifts(prev => ({ ...prev, [areaId]: s })); }
    } catch { /* ignora */ }
  };
  useEffect(() => {
    if (activeTab !== 'minhas_areas' || !user?.id) return;
    areas.filter(a => a.leaderId === user.id).forEach(a => { loadLeaderArea(a.id); loadAreaPositions(a.id); });
  }, [activeTab, areas, user?.id]);

  // Aprovar / recusar solicitação de participação na área
  const handleApproveRejectArea = async (participationId, areaId, status) => {
    try {
      const res = await apiFetch(`/api/areas/participations/${participationId}`, { method: 'PATCH', body: { status } });
      if (res.ok) {
        showNotification(`Voluntário ${status === 'APROVADO' ? 'aprovado' : 'recusado'}!`);
        setAreaRequests(prev => ({ ...prev, [areaId]: (prev[areaId] || []).filter(p => p.id !== participationId) }));
        if (status === 'APROVADO') loadLeaderArea(areaId); // atualiza lista de aprovados p/ escalar
      } else throw new Error();
    } catch {
      showNotification('Falha ao processar a solicitação.');
    }
  };

  // Aprovar (confirma saída) / recusar (mantém na equipe) um pedido de saída da área
  const handleLeaveRequest = async (participationId, areaId, userId, approveLeave) => {
    try {
      const res = await apiFetch(`/api/areas/participations/${participationId}`, { method: 'PATCH', body: { status: approveLeave ? 'APROVADO' : 'RECUSADO' } });
      if (res.ok) {
        showNotification(approveLeave ? 'Saída confirmada.' : 'Pedido de saída recusado — voluntário mantido na equipe.');
        setAreaLeaveRequests(prev => ({ ...prev, [areaId]: (prev[areaId] || []).filter(p => p.id !== participationId) }));
        if (approveLeave) setAreaApproved(prev => ({ ...prev, [areaId]: (prev[areaId] || []).filter(u => u.id !== userId) }));
      } else throw new Error();
    } catch {
      showNotification('Falha ao processar o pedido de saída.');
    }
  };

  const setDraft = (areaId, patch) => setShiftDrafts(prev => ({ ...prev, [areaId]: { ...(prev[areaId] || {}), ...patch } }));
  const handleCreateShift = async (areaId) => {
    const d = shiftDrafts[areaId] || {};
    if (!d.dateOnly || !d.timeOnly) return showNotification('Informe a data e o horário da escala.');
    const when = new Date(`${d.dateOnly}T${d.timeOnly}`);
    if (isNaN(when.getTime())) return showNotification('Data/horário inválidos.');
    try {
      const res = await apiFetch(`/api/areas/${areaId}/shifts`, { method: 'POST', body: { date: when.toISOString(), volunteerId: d.volunteerId || null, positionId: d.positionId || null } });
      if (res.ok) { setShiftDrafts(prev => ({ ...prev, [areaId]: { dateOnly: '', timeOnly: '', volunteerId: '', positionId: '' } })); loadLeaderArea(areaId); showNotification('Escala criada!'); }
      else { const e = await res.json().catch(() => ({})); showNotification(e.error || 'Falha ao criar escala.'); }
    } catch { showNotification('Falha de rede.'); }
  };
  const handleDeleteShift = async (shiftId, areaId) => {
    try {
      const res = await apiFetch(`/api/shifts/${shiftId}`, { method: 'DELETE' });
      if (res.ok) setAreaShifts(prev => ({ ...prev, [areaId]: (prev[areaId] || []).filter(s => s.id !== shiftId) }));
    } catch { showNotification('Falha de rede.'); }
  };

  // Só comunicados do tipo VOLUNTARIO aparecem aqui
  const volAnnouncement = announcements.filter(a => a.type === 'VOLUNTARIO')[0] || null;

  // ─── derived ─────────────────────────────────────────────────────────────
  // Estilo (ícone/cor) de uma área pelo seu índice no catálogo; fallback padrão.
  const styleForAreaId = (areaId) => {
    const idx = areas.findIndex(a => a.id === areaId);
    if (idx === -1) return DEFAULT_AREA_STYLE;
    return { Icon: getAreaIconComponent(areas[idx].icon), ...AREA_COLOR_STYLES[idx % AREA_COLOR_STYLES.length] };
  };

  const activeAreaDetails = selectedAreaId ? areas.find(a => a.id === selectedAreaId) : null;
  const activeAreaStyle   = activeAreaDetails ? styleForAreaId(activeAreaDetails.id) : DEFAULT_AREA_STYLE;
  const AreaIcon          = activeAreaStyle.Icon;
  const isModalLeader     = !!activeAreaDetails && (activeAreaDetails.leaderId === user?.id || isAreaStaff(user));

  const activeAreaCount   = myAreas.filter(p => p.status === 'PENDENTE' || p.status === 'APROVADO').length;
  const reachedAreaLimit  = activeAreaCount >= MAX_AREAS_PER_PERSON;

  // Áreas que o usuário lidera (entra direto em "Minhas Áreas", sem solicitar)
  const ledAreas = areas.filter(a => a.leaderId === user?.id);
  // Itens de "Minhas Áreas": áreas lideradas + participações (sem duplicar as lideradas)
  const myAreaItems = [
    ...ledAreas.map(a => ({ id: `lead-${a.id}`, areaId: a.id, area: a, status: 'APROVADO', role: 'Líder da Área', isLeader: true })),
    ...myAreas.filter(p => !ledAreas.some(a => a.id === p.areaId)),
  ];

  const futureShifts = shifts.filter(s => new Date(s.date) >= new Date());
  const myFutureShifts = futureShifts.filter(s => s.volunteerId === user?.id);
  const openFutureShifts = futureShifts.filter(s => !s.volunteerId);

  const formatData = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    const weekdayAndTime = date.toLocaleDateString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace('-feira', '');
    const shortDate      = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const commaIndex     = weekdayAndTime.indexOf(',');
    if (commaIndex === -1) return `${weekdayAndTime} (${shortDate})`;
    return `${weekdayAndTime.slice(0, commaIndex)}, ${shortDate}${weekdayAndTime.slice(commaIndex)}`;
  };

  // ─── handlers ────────────────────────────────────────────────────────────

  const handleConfirmShift = async (shiftId) => {
    try {
      const res = await apiFetch(`/api/shifts/${shiftId}/confirm`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'Confirmado' } : s));
        setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
        showNotification(data.awarded ? `Escala confirmada! Você ganhou +${data.awarded} Zion Points! 🎉` : 'Escala confirmada!');
      } else throw new Error();
    } catch {
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'Confirmado' } : s));
      showNotification('Escala confirmada (Modo Offline)!');
    }
  };

  // Aceitar uma vaga em aberto — some da lista de "abertas" para todos assim que alguém aceita
  const handleClaimShift = async (shiftId) => {
    try {
      const res = await apiFetch(`/api/shifts/${shiftId}/claim`, { method: 'PATCH' });
      if (res.ok) {
        const updated = await res.json();
        setShifts(prev => prev.map(s => s.id === shiftId ? updated : s));
        showNotification('Vaga aceita! Você está escalado.');
      } else { const e = await res.json().catch(() => ({})); showNotification(e.error || 'Falha ao aceitar a vaga.'); }
    } catch { showNotification('Falha de rede.'); }
  };

  // RSVP em evento de Voluntário (ex.: Escola ZAO) — mesmo endpoint usado no Início.
  // Sem pontos ainda: depois de confirmado, o botão vira "Check-in" (pontos só no check-in real).
  const handleParticipateEvent = async (occ) => {
    if (eventRsvps.includes(occ.occId)) return;
    setEventRsvps(prev => [...prev, occ.occId]); // otimista
    try {
      const res = await apiFetch(`/api/events/${occ.id}/participate`, { method: 'POST', body: { refId: occ.occId } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showNotification(data.already ? 'Presença já confirmada neste evento.' : 'Presença confirmada! Faça o check-in no evento para ganhar seus Zion Points. 🎉');
      } else {
        setEventRsvps(prev => prev.filter(id => id !== occ.occId));
        showNotification(data.error || 'Não foi possível confirmar presença.');
      }
    } catch {
      setEventRsvps(prev => prev.filter(id => id !== occ.occId));
      showNotification('Falha de rede ao confirmar presença.');
    }
  };

  // Check-in real no evento de Voluntário (via código exibido no local) — credita os pontos
  const handleEventCheckin = async (codeOverride) => {
    const code = (codeOverride || checkinCode).trim();
    if (!code || !checkinEvent) return;
    setCheckingInEvent(true);
    try {
      const res = await apiFetch(`/api/events/${checkinEvent.id}/checkin`, { method: 'POST', body: { code, refId: checkinEvent.occId } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEventRsvps(prev => prev.includes(checkinEvent.occId) ? prev : [...prev, checkinEvent.occId]);
        setEventCheckins(prev => prev.includes(checkinEvent.occId) ? prev : [...prev, checkinEvent.occId]);
        setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
        setCheckinEvent(null); setCheckinCode('');
        if (data.already) showNotification('Você já fez check-in neste evento.');
        else showNotification(`Check-in confirmado! +${data.awarded} Zion Points! 🎉`);
      } else showNotification(data.error || 'Código de check-in inválido.');
    } catch { showNotification('Falha de rede no check-in.'); }
    finally { setCheckingInEvent(false); }
  };

  // Solicitar entrada (PENDENTE) — persiste via POST /api/areas/:id/request
  const handleRequestArea = async (areaId) => {
    if (!user?.id) return;
    if (myAreas.some(p => p.areaId === areaId)) {
      showNotification('Você já tem uma solicitação ativa para esta área.');
      return;
    }
    if (reachedAreaLimit) {
      showNotification(`Limite de ${MAX_AREAS_PER_PERSON} áreas atingido.`);
      return;
    }
    const area = areas.find(a => a.id === areaId);
    const tempId = `tmp-${areaId}`; // único por área (1 participação por área)
    // Otimista: mostra como pendente imediatamente
    setMyAreas(prev => [...prev, { id: tempId, areaId, status: 'PENDENTE', role: 'Aguardando Avaliação', area }]);
    try {
      const res = await apiFetch(`/api/areas/${areaId}/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        const saved = await res.json();
        setMyAreas(prev => prev.map(p => p.id === tempId ? { ...p, id: saved.id, status: saved.status } : p));
        showNotification('Solicitação enviada! Aguarde a aprovação do líder.');
      } else throw new Error('offline');
    } catch {
      showNotification('Solicitação registada localmente (Offline).');
    }
  };

  // Abre modal de confirmação interno (sem window.confirm)
  const requestCancelArea = (participation) => setAreaToCancel(participation);

  // Cancelar solicitação pendente (remove) OU pedir saída de área aprovada (vira SAIDA_PENDENTE p/ o líder aprovar)
  const executeCancelArea = async () => {
    if (!areaToCancel) return;
    const participation = areaToCancel;
    const isLeaving = participation.status === 'APROVADO';
    setAreaToCancel(null);
    if (isLeaving) {
      setMyAreas(prev => prev.map(p => p.id === participation.id ? { ...p, status: 'SAIDA_PENDENTE', role: 'Pedido de saída enviado' } : p));
    } else {
      setMyAreas(prev => prev.filter(p => p.id !== participation.id));
    }
    try {
      const res = await apiFetch(`/api/areas/${participation.areaId}/request`, { method: 'DELETE' });
      showNotification(isLeaving ? 'Pedido de saída enviado! Aguarde a aprovação do líder.' : 'Solicitação cancelada.');
      if (isLeaving && res.ok) {
        const updated = await res.json().catch(() => null);
        if (updated?.id) setMyAreas(prev => prev.map(p => p.id === participation.id ? { ...p, id: updated.id, status: updated.status } : p));
      }
    } catch {
      showNotification(isLeaving ? 'Pedido de saída registrado (Offline).' : 'Solicitação cancelada (Offline).');
    }
  };

  const openAreaModal = (areaId, tab = 'escalas') => {
    setSelectedAreaId(areaId);
    setModalTab(tab);
    setMuralMsgs([]);
    // Carrega a equipe real (membros aprovados) para a aba "Equipe"
    loadAreaTeam(areaId);
    loadMyAvailability(areaId);
    loadAreaPositions(areaId);
    const areaObj = areas.find(a => a.id === areaId);
    if (areaObj && (areaObj.leaderId === user?.id || isAreaStaff(user))) loadLeaderArea(areaId);
  };

  // Solicitações de entrada (PENDENTE) e saída (SAIDA_PENDENTE) — reaproveitado na tela e na aba Liderança
  const renderMembershipRequests = (areaId) => {
    const pending = areaRequests[areaId] || [];
    const leaving = areaLeaveRequests[areaId] || [];
    if (pending.length === 0 && leaving.length === 0) {
      return <p className="text-xs text-text-muted italic">Não há solicitações pendentes no momento.</p>;
    }
    return (
      <div className="space-y-2">
        {pending.map(req => (
          <div key={req.id} className="flex justify-between items-center bg-surface-card p-3 rounded-md border border-white/5">
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Avatar name={req.user?.name} src={req.user?.profileImage} size={28} /> {req.user?.name || 'Voluntário'}
              <span className="text-[9px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">Entrada</span>
            </span>
            <div className="flex gap-2">
              <button onClick={() => handleApproveRejectArea(req.id, areaId, 'RECUSADO')} title="Recusar" className="p-2 rounded-md hover:bg-red-500/20 text-red-400 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-4 h-4"/></button>
              <button onClick={() => handleApproveRejectArea(req.id, areaId, 'APROVADO')} title="Aprovar" className="p-2 rounded-md hover:bg-green-500/20 text-green-400 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><CheckCircle className="w-4 h-4"/></button>
            </div>
          </div>
        ))}
        {leaving.map(req => (
          <div key={req.id} className="flex justify-between items-center bg-surface-card p-3 rounded-md border border-amber-500/20">
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Avatar name={req.user?.name} src={req.user?.profileImage} size={28} /> {req.user?.name || 'Voluntário'}
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">Pedido de Saída</span>
            </span>
            <div className="flex gap-2">
              <button onClick={() => handleLeaveRequest(req.id, areaId, req.userId, false)} title="Manter na equipe" className="p-2 rounded-md hover:bg-red-500/20 text-red-400 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-4 h-4"/></button>
              <button onClick={() => handleLeaveRequest(req.id, areaId, req.userId, true)} title="Confirmar saída" className="p-2 rounded-md hover:bg-green-500/20 text-green-400 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><CheckCircle className="w-4 h-4"/></button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── disponibilidade semanal (dia + período) ───────────────────────────────
  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const WEEKDAY_NUM = { 'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6 };
  const PERIOD_KEY = { M: 'MANHA', T: 'TARDE', N: 'NOITE' };
  const PERIOD_LETTER = { MANHA: 'M', TARDE: 'T', NOITE: 'N' };
  const periodFromHour = (h) => (h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE');

  const loadMyAvailability = async (areaId) => {
    try {
      const res = await apiFetch(`/api/areas/${areaId}/availability/mine`).catch(() => null);
      if (!res || !res.ok) return;
      const rows = await res.json();
      const next = {};
      rows.forEach(r => {
        const dia = Object.keys(WEEKDAY_NUM).find(k => WEEKDAY_NUM[k] === r.weekday);
        const letra = PERIOD_LETTER[r.period];
        if (!dia || !letra) return;
        next[dia] = { ...(next[dia] || {}), [letra]: true };
      });
      setAvailability(next);
    } catch { /* ignora */ }
  };

  const toggleAvailability = async (areaId, dia, periodo) => {
    const current = availability[dia] || { M: false, T: false, N: false };
    const wasChecked = !!current[periodo];
    setAvailability(prev => ({ ...prev, [dia]: { ...current, [periodo]: !wasChecked } }));
    try {
      const res = await apiFetch(`/api/areas/${areaId}/availability`, { method: 'POST', body: { weekday: WEEKDAY_NUM[dia], period: PERIOD_KEY[periodo] } });
      if (!res.ok) throw new Error();
    } catch {
      setAvailability(prev => ({ ...prev, [dia]: { ...current, [periodo]: wasChecked } }));
      showNotification('Falha ao salvar disponibilidade.');
    }
  };

  // ─── posições da área (ex.: Balcão, Forno, Barista) — só líder/staff ─────
  const loadAreaPositions = async (areaId) => {
    try {
      const res = await apiFetch(`/api/areas/${areaId}/positions`).catch(() => null);
      if (res && res.ok) { const rows = await res.json(); setAreaPositions(prev => ({ ...prev, [areaId]: rows })); }
    } catch { /* ignora */ }
  };
  const handleAddPosition = async (areaId) => {
    const name = (newPositionName[areaId] || '').trim();
    if (!name) return;
    try {
      const res = await apiFetch(`/api/areas/${areaId}/positions`, { method: 'POST', body: { name } });
      if (res.ok) { setNewPositionName(prev => ({ ...prev, [areaId]: '' })); loadAreaPositions(areaId); }
      else { const e = await res.json().catch(() => ({})); showNotification(e.error || 'Falha ao criar posição.'); }
    } catch { showNotification('Falha de rede.'); }
  };
  const handleDeletePosition = async (positionId, areaId) => {
    try {
      const res = await apiFetch(`/api/areas/positions/${positionId}`, { method: 'DELETE' });
      if (res.ok) setAreaPositions(prev => ({ ...prev, [areaId]: (prev[areaId] || []).filter(p => p.id !== positionId) }));
    } catch { showNotification('Falha de rede.'); }
  };

  // ─── filtro de escala por evento existente (dia/período do evento → voluntários disponíveis) ─
  const handleScheduleEventFilter = async (areaId, eventId) => {
    setScheduleEventId(prev => ({ ...prev, [areaId]: eventId }));
    if (!eventId) { setAvailableForEvent(prev => ({ ...prev, [areaId]: null })); return; }
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const d = new Date(ev.date);
    const weekday = d.getDay();
    const period = periodFromHour(d.getHours());
    // Pré-preenche data e horário da escala com os do evento selecionado
    const dateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const roundedMinutes = d.getMinutes() < 30 ? '00' : '30';
    const timeOnly = `${String(d.getHours()).padStart(2, '0')}:${roundedMinutes}`;
    setDraft(areaId, { dateOnly, timeOnly });
    try {
      const res = await apiFetch(`/api/areas/${areaId}/availability?weekday=${weekday}&period=${period}`).catch(() => null);
      if (res && res.ok) {
        const rows = await res.json();
        setAvailableForEvent(prev => ({ ...prev, [areaId]: rows.map(r => r.user).filter(Boolean) }));
      }
    } catch { /* ignora */ }
  };

  const loadAreaTeam = async (areaId) => {
    try {
      const res = await apiFetch(`/api/areas/${areaId}/participations`).catch(() => null);
      if (res && res.ok) {
        const parts = await res.json();
        setAreaApproved(prev => ({ ...prev, [areaId]: parts.filter(p => p.status === 'APROVADO').map(p => ({ ...p.user, role: p.role })).filter(Boolean) }));
      }
    } catch { /* ignora */ }
  };

  // ─── render ──────────────────────────────────────────────────────────────

  // Eventos de Voluntário (ex.: Escola ZAO) — em destaque no topo da tela
  const volunteerEventOccurrences = getEventOccurrences(events.filter(e => e.type === 'VOLUNTARIO'));

  return (
    <div className="space-y-6">
      {volunteerEventOccurrences.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 to-brand-primary/15 border border-amber-500/30 rounded-default p-4 space-y-3">
          <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 uppercase tracking-wide"><CalendarDays className="w-4 h-4"/> Eventos de Voluntariado</h3>
          <div className="space-y-2">
            {volunteerEventOccurrences.map(occ => {
              const hasRsvp = eventRsvps.includes(occ.occId);
              const hasCheckedIn = eventCheckins.includes(occ.occId);
              return (
                <div key={occ.occId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-card border border-white/10 rounded-md p-3">
                  <div>
                    <div className="font-bold text-text-primary">{occ.title}</div>
                    <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5 capitalize"><Clock className="w-3 h-3 text-brand-primary"/> {formatData(occ.occIso)}{occ.location ? ` • ${occ.location}` : ''}</div>
                  </div>
                  {hasCheckedIn ? (
                    <span className="flex items-center justify-center gap-1.5 text-brand-primary text-sm font-bold bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-default shrink-0"><CheckCircle className="w-4 h-4"/> Confirmado</span>
                  ) : hasRsvp ? (
                    <button onClick={() => { setCheckinCode(''); setCheckinEvent(occ); }} className="flex items-center justify-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 shrink-0"><Clock className="w-4 h-4"/> Check-in</button>
                  ) : (
                    <button onClick={() => handleParticipateEvent(occ)} className="flex items-center justify-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 shrink-0"><CheckCircle className="w-4 h-4"/> Participar</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-display font-bold text-text-primary">Voluntariado</h2>
        <p className="text-sm text-text-muted mt-1">Sirva a casa e desenvolva seus dons.</p>
      </div>

      <div className="flex gap-4 border-b border-white/10 mb-4 overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('minhas_areas')} className={`pb-2 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === 'minhas_areas' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>Minhas Áreas</button>
        <button onClick={() => setActiveTab('explorar')}     className={`pb-2 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === 'explorar'     ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>Explorar Áreas</button>
      </div>

      {/* ── ABA: EXPLORAR ─────────────────────────────────────────────────── */}
      {activeTab === 'explorar' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-default border text-sm ${reachedAreaLimit ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-surface-card border-white/5 text-text-muted'}`}>
            <span>Você serve em <span className="font-bold text-text-primary">{activeAreaCount}</span> de <span className="font-bold text-text-primary">{MAX_AREAS_PER_PERSON}</span> áreas permitidas.</span>
            {reachedAreaLimit && <span className="text-xs font-semibold whitespace-nowrap">Limite atingido</span>}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
          ) : areas.length === 0 ? (
            <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Nenhuma área cadastrada ainda. Peça ao Admin para criar áreas de voluntariado.</div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {areas.map(area => {
              // Líder não solicita entrada na própria área (já aparece em "Minhas Áreas")
              if (area.leaderId === user?.id) return null;
              const { Icon, color, bg } = styleForAreaId(area.id);
              const myParticipation = myAreas.find(m => m.areaId === area.id);
              const disableRequest  = reachedAreaLimit && !myParticipation;
              return (
                <div key={area.id} className="bg-surface-card p-3 rounded-default border border-white/5 shadow-level-2 flex flex-col gap-2 hover:border-brand-primary/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bg} ${color}`}><Icon className="w-4 h-4"/></div>
                    <h3 className="font-display font-bold text-sm text-text-primary leading-tight line-clamp-2">{area.name}</h3>
                  </div>
                  {area.description && <p className="text-[11px] text-text-muted line-clamp-2">{area.description}</p>}

                  {myParticipation ? (
                    <div className="flex items-center gap-1 mt-auto pt-1">
                      <span className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold bg-surface-dark border border-white/5 text-text-muted/70 text-center">
                        <CheckCircle className="w-3 h-3 shrink-0"/> {myParticipation.status === 'APROVADO' ? 'Participando' : 'Pendente'}
                      </span>
                      {isAreaStaff(user) && (
                        <button onClick={() => openAreaModal(area.id)} title="Ver detalhes (acesso administrativo)" className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Eye className="w-3.5 h-3.5"/></button>
                      )}
                      <button
                        onClick={() => requestCancelArea(myParticipation)}
                        title="Cancelar solicitação"
                        className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
                      >
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-auto pt-1">
                      {isAreaStaff(user) && (
                        <button onClick={() => openAreaModal(area.id)} title="Ver detalhes (acesso administrativo)" className="shrink-0 p-1.5 rounded-md border border-white/10 text-text-muted hover:text-brand-primary hover:bg-brand-primary/10 hover:border-brand-primary/30 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Eye className="w-3.5 h-3.5"/></button>
                      )}
                      <button
                        onClick={() => handleRequestArea(area.id)}
                        disabled={disableRequest}
                        title={disableRequest ? `Limite de ${MAX_AREAS_PER_PERSON} áreas atingido` : undefined}
                        className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 bg-surface-dark border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Solicitar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ── ABA: MINHAS ÁREAS ─────────────────────────────────────────────── */}
      {activeTab === 'minhas_areas' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {volAnnouncement && (
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 p-4 rounded-default shadow-sm">
              <div className="flex items-start gap-3">
                <div className="bg-blue-500/20 p-2 rounded-full text-blue-400 mt-1 shrink-0"><Megaphone className="w-5 h-5"/></div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">{volAnnouncement.title} <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold">Voluntários</span></h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">{volAnnouncement.content}</p>
                </div>
              </div>
            </div>
          )}

          {myAreaItems.length === 0 ? (
            <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Você ainda não faz parte de nenhuma área. Explore as opções!</div>
          ) : (
            <div className="space-y-3">
              {myAreaItems.map((myArea) => {
                const areaDetails = myArea.area || areas.find(a => a.id === myArea.areaId);
                if (!areaDetails) return null;
                const { Icon, color, bg } = styleForAreaId(myArea.areaId);
                const isLeader = myArea.isLeader;
                const isApproved = myArea.status === 'APROVADO';
                const isLeavingArea = myArea.status === 'SAIDA_PENDENTE';
                const pending = isLeader ? (areaRequests[areaDetails.id] || []) : [];
                return (
                  <div key={myArea.id} className={`bg-surface-card rounded-default border overflow-hidden shadow-level-2 ${(isApproved || isLeavingArea || isLeader) ? 'border-brand-primary/30' : 'border-white/5'}`}>
                    <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${bg} ${color}`}><Icon className="w-6 h-6"/></div>
                        <div>
                          <h3 className="font-display font-bold text-lg text-text-primary flex items-center gap-2">
                            {areaDetails.name}
                            {isLeader && <span className="text-[9px] bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Líder</span>}
                          </h3>
                          <div className="text-sm text-text-muted font-medium flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3.5 h-3.5"/> Posição: <span className="text-white/80">{myArea.role}</span>
                          </div>
                        </div>
                      </div>

                      {isLeader ? (
                        <button onClick={() => openAreaModal(areaDetails.id)} className="w-full sm:w-auto bg-surface-dark border border-brand-primary/30 text-brand-primary px-6 py-2.5 rounded-default text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                          Acessar Área
                        </button>
                      ) : isApproved ? (
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                          <button onClick={() => openAreaModal(areaDetails.id)} className="w-full sm:w-auto bg-surface-dark border border-brand-primary/30 text-brand-primary px-6 py-2.5 rounded-default text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                            Acessar Área
                          </button>
                          <button onClick={() => requestCancelArea(myArea)} className="text-xs text-text-muted hover:text-red-400 underline decoration-white/10 hover:decoration-red-400/30 underline-offset-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
                            Sair da área
                          </button>
                        </div>
                      ) : isLeavingArea ? (
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                          <button onClick={() => openAreaModal(areaDetails.id)} className="w-full sm:w-auto bg-surface-dark border border-brand-primary/30 text-brand-primary px-6 py-2.5 rounded-default text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                            Acessar Área
                          </button>
                          <span className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-semibold"><Clock className="w-3.5 h-3.5"/> Aguardando aprovação de saída</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                          <span className="flex items-center justify-center gap-1.5 text-amber-400 text-sm font-bold bg-amber-500/10 border border-amber-500/20 px-5 py-2.5 rounded-default">
                            <Clock className="w-4 h-4"/> Avaliação Pendente
                          </span>
                          <button onClick={() => requestCancelArea(myArea)} className="text-xs text-text-muted hover:text-red-400 underline decoration-white/10 hover:decoration-red-400/30 underline-offset-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
                            Cancelar solicitação
                          </button>
                        </div>
                      )}
                    </div>

                    {isLeader && (
                      <div className="p-4 border-t border-white/5 bg-surface-dark/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-text-primary flex items-center gap-2"><Users className="w-4 h-4"/> Solicitações de Entrada/Saída ({pending.length + (areaLeaveRequests[areaDetails.id] || []).length})</h4>
                          <button onClick={() => openAreaModal(areaDetails.id, 'lideranca')} className="text-xs text-brand-primary hover:underline font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Gerenciar em Liderança →</button>
                        </div>
                        {renderMembershipRequests(areaDetails.id)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DA ÁREA ─────────────────────────────────────────────────── */}
      {selectedAreaId && activeAreaDetails && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedAreaId(null)}>
          <div className="bg-surface-card border border-white/10 rounded-default shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

            {/* Header do modal */}
            <div className="p-6 border-b border-white/10 bg-surface-dark shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${activeAreaStyle.bg} ${activeAreaStyle.color}`}>
                    <AreaIcon className="w-6 h-6"/>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-2xl text-white">{activeAreaDetails.name}</h3>
                    <p className="text-sm text-text-muted">{activeAreaDetails.description}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAreaId(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-text-muted hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
              </div>
              <div className="flex gap-4 mt-6 border-b border-white/10 overflow-x-auto no-scrollbar">
                {[
                  { id: 'escalas',      label: 'Escalas & Disp.' },
                  ...(isModalLeader ? [{ id: 'lideranca', label: '⭐ Liderança' }] : []),
                  { id: 'treinamentos', label: 'Treinamentos' },
                  { id: 'equipe',       label: 'Equipe' },
                  { id: 'mural',        label: 'Mural' },
                  // Pedidos de oração: só na área de Intercessão e para quem pode ver
                  ...(isIntercessionName(activeAreaDetails.name) && canViewPrayers ? [{ id: 'oracoes', label: '🙏 Pedidos de Oração' }] : []),
                ].map(t => (
                  <button key={t.id} onClick={() => { setModalTab(t.id); if (t.id === 'oracoes') loadPrayers(); if (t.id === 'mural') loadMural(selectedAreaId); }} className={`pb-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${modalTab === t.id ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conteúdo do modal */}
            <div className="p-6 overflow-y-auto">

              {/* TAB: PEDIDOS DE ORAÇÃO (área de Intercessão) */}
              {modalTab === 'oracoes' && canViewPrayers && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 bg-pink-500/10 border border-pink-500/20 rounded-default px-4 py-3 text-sm text-pink-200">
                    <Heart className="w-4 h-4 shrink-0"/> Pedidos de oração da comunidade. Ore por cada um e marque como orado.
                  </div>
                  {renderPrayerList()}
                </div>
              )}

              {/* TAB: ESCALAS & DISPONIBILIDADE */}
              {modalTab === 'escalas' && (() => {
                const areaMyShifts = myFutureShifts.filter(s => s.areaId === selectedAreaId);
                const areaOpenShifts = openFutureShifts.filter(s => s.areaId === selectedAreaId);
                return (
                <div className="space-y-8 animate-in fade-in">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-brand-primary"/> Próximos Turnos (Sua Escala)
                    </h4>
                    {isLoading ? (
                      <div className="flex justify-center py-5"><div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
                    ) : areaMyShifts.length === 0 ? (
                      <div className="text-center text-text-muted py-8 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Não há escalas agendadas para os próximos dias.</div>
                    ) : (
                      <div className="space-y-3">
                        {areaMyShifts.map(shift => (
                          <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-dark rounded-default border border-white/5 gap-4">
                            <div>
                              <div className="font-bold text-text-primary">{shift.department}{shift.position?.name ? ` • ${shift.position.name}` : ''}</div>
                              <div className="text-sm text-text-muted font-medium capitalize mt-1">
                                <Clock className="w-3.5 h-3.5 inline mr-1 text-brand-primary"/>{formatData(shift.date)}
                              </div>
                            </div>
                            {/* FIX: handleConfirmShift declarado e funcional */}
                            {shift.status.toUpperCase() === 'CONFIRMADO' ? (
                              <span className="flex items-center justify-center gap-1.5 text-brand-primary text-sm font-bold bg-brand-primary/10 border border-brand-primary/20 px-5 py-2 rounded-default">
                                <CheckCircle className="w-4 h-4"/> Confirmado
                              </span>
                            ) : (
                              <button onClick={() => handleConfirmShift(shift.id)} className="w-full sm:w-auto bg-brand-primary text-white px-6 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-all">
                                Confirmar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-8">
                    <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-primary"/> Vagas em Aberto
                    </h4>
                    {areaOpenShifts.length === 0 ? (
                      <div className="text-center text-text-muted py-6 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Nenhuma vaga em aberto no momento.</div>
                    ) : (
                      <div className="space-y-3">
                        {areaOpenShifts.map(shift => (
                          <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-dark rounded-default border border-dashed border-brand-primary/30 gap-4">
                            <div>
                              <div className="font-bold text-text-primary">{shift.department}{shift.position?.name ? ` • ${shift.position.name}` : ''}</div>
                              <div className="text-sm text-text-muted font-medium capitalize mt-1">
                                <Clock className="w-3.5 h-3.5 inline mr-1 text-brand-primary"/>{formatData(shift.date)}
                              </div>
                            </div>
                            <button onClick={() => handleClaimShift(shift.id)} className="w-full sm:w-auto bg-brand-primary text-white px-6 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-all">
                              Aceitar vaga
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary flex items-center gap-2"><Clock className="w-4 h-4 text-brand-primary"/> Disponibilidade Semanal</h4>
                        <p className="text-xs text-text-muted mt-1">Toque para marcar/desmarcar — salva automaticamente.</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto border border-white/10 rounded-md">
                      <table className="w-full text-sm text-left border-collapse bg-surface-dark">
                        <thead>
                          <tr className="border-b border-white/10 bg-surface-card">
                            <th className="py-3 px-3 text-text-muted font-semibold w-1/4">Dia</th>
                            <th className="py-3 px-2 text-center text-text-muted font-semibold w-1/4">Manhã</th>
                            <th className="py-3 px-2 text-center text-text-muted font-semibold w-1/4">Tarde</th>
                            <th className="py-3 px-2 text-center text-text-muted font-semibold w-1/4">Noite</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(dia => (
                            <tr key={dia} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-3 font-medium text-text-primary">{dia}</td>
                              {['M','T','N'].map(periodo => {
                                const isChecked = availability[dia]?.[periodo] || false;
                                return (
                                  <td key={periodo} className="py-3 text-center">
                                    <button
                                      onClick={() => toggleAvailability(selectedAreaId, dia, periodo)}
                                      className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${isChecked ? 'bg-brand-primary border-brand-primary text-white shadow-[0_0_8px_rgba(0,184,169,0.5)]' : 'bg-surface-card border-white/20 text-transparent hover:border-brand-primary/50'}`}
                                    ><CheckCircle className="w-4 h-4"/></button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* TAB: LIDERANÇA — posições, criação de escala e solicitações de entrada/saída */}
              {modalTab === 'lideranca' && isModalLeader && (() => {
                const areaId = activeAreaDetails.id;
                const positions = areaPositions[areaId] || [];
                const posDraft = newPositionName[areaId] || '';
                const sh = areaShifts[areaId] || [];
                const approved = areaApproved[areaId] || [];
                const draft = shiftDrafts[areaId] || {};
                const selEventId = scheduleEventId[areaId] || '';
                const matches = availableForEvent[areaId];
                const recurringEvents = events.filter(e => e.type === 'VOLUNTARIO' || e.recurrence !== 'NONE');
                return (
                  <div className="space-y-8 animate-in fade-in">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-brand-primary"/> Solicitações de Entrada/Saída</h4>
                      {renderMembershipRequests(areaId)}
                    </div>

                    <div className="border-t border-white/5 pt-8">
                      <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4 text-brand-primary"/> Posições da Área ({positions.length})</h4>
                      {positions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {positions.map(p => (
                            <span key={p.id} className="flex items-center gap-1.5 bg-surface-dark border border-white/10 text-white text-xs px-2.5 py-1.5 rounded-full">
                              {p.name}
                              <button onClick={() => handleDeletePosition(p.id, areaId)} title="Remover posição" className="text-text-muted hover:text-red-400 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-3 h-3"/></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="text" value={posDraft} onChange={e => setNewPositionName(prev => ({ ...prev, [areaId]: e.target.value }))} placeholder="Nova posição (ex: Barista)" maxLength={60} className="flex-1 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                        <button onClick={() => handleAddPosition(areaId)} className="bg-surface-dark border border-white/10 hover:border-brand-primary text-white px-4 py-2 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Adicionar</button>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-8">
                      <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-brand-primary"/> Criar Escala ({sh.length} criadas)</h4>
                      <div className="space-y-2 mb-4">
                        {sh.length === 0 ? <p className="text-xs text-text-muted italic">Nenhuma escala criada.</p> : sh.map(s => (
                          <div key={s.id} className="flex justify-between items-center bg-surface-dark p-2.5 rounded-md border border-white/5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={s.user?.name || '?'} src={s.user?.profileImage} size={26} />
                              <div className="min-w-0">
                                <div className="text-white truncate">{s.user?.name || 'Vaga aberta'}{s.position?.name ? ` • ${s.position.name}` : ''}</div>
                                <div className="text-xs text-text-muted">{new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {s.status}</div>
                              </div>
                            </div>
                            <button onClick={() => handleDeleteShift(s.id, areaId)} title="Remover" className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        ))}
                      </div>

                      {recurringEvents.length > 0 && (
                        <div className="mb-4 bg-surface-dark border border-white/10 rounded-md p-3">
                          <label className="text-xs text-text-muted mb-1.5 block">Filtrar disponíveis por evento (dia/período)</label>
                          <select value={selEventId} onChange={e => handleScheduleEventFilter(areaId, e.target.value)} className="w-full bg-surface-card border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                            <option value="">Selecione um evento...</option>
                            {recurringEvents.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                          </select>
                          {selEventId && (
                            <div className="mt-2 text-xs text-text-muted">
                              {matches === undefined ? null : matches === null ? null : matches.length === 0 ? 'Nenhum voluntário marcou disponibilidade nesse dia/período.' : (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {matches.map(u => (
                                    <button key={u.id} onClick={() => setDraft(areaId, { volunteerId: u.id })} className="flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs px-2 py-1 rounded-full hover:bg-brand-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                                      <Avatar name={u.name} src={u.profileImage} size={16} /> {u.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-surface-dark border border-white/10 rounded-md p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-text-muted mb-1 block">Data</label>
                            <input type="date" value={draft.dateOnly || ''} onChange={e => setDraft(areaId, { dateOnly: e.target.value })} className="w-full bg-surface-card border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 [color-scheme:dark]" />
                          </div>
                          <div>
                            <label className="text-xs text-text-muted mb-1 block">Horário</label>
                            <select value={draft.timeOnly || ''} onChange={e => setDraft(areaId, { timeOnly: e.target.value })} className="w-full bg-surface-card border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                              <option value="">Selecione...</option>
                              {SHIFT_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <select value={draft.volunteerId || ''} onChange={e => setDraft(areaId, { volunteerId: e.target.value })} className="bg-surface-card border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                            <option value="">Vaga aberta (visível a todos até alguém aceitar)</option>
                            {approved.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          {positions.length > 0 && (
                            <select value={draft.positionId || ''} onChange={e => setDraft(areaId, { positionId: e.target.value })} className="bg-surface-card border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                              <option value="">Sem posição</option>
                              {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </div>
                        <button onClick={() => handleCreateShift(areaId)} className="w-full bg-brand-primary text-white px-4 py-2.5 rounded-md font-bold text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-brand-secondary transition-colors">Criar Escala</button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TAB: TREINAMENTOS — FIX: BookOpen importado, sem tela preta */}
              {modalTab === 'treinamentos' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="bg-surface-dark p-6 rounded-default border border-brand-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <div className="text-sm text-text-muted mb-1">Seu Progresso na Trilha</div>
                      <div className="text-3xl font-display font-bold text-white flex items-baseline gap-1 justify-center sm:justify-start">
                        {trainingProgress}% <span className="text-xs font-sans font-normal text-brand-primary uppercase tracking-wider ml-1">Concluído</span>
                      </div>
                    </div>
                    <div className="bg-brand-primary/10 p-3 rounded-full"><Award className="w-10 h-10 text-brand-primary"/></div>
                  </div>

                  <div className="space-y-3">
                    {/* Módulo 1: Concluído */}
                    <div className="bg-surface-dark border border-brand-primary/30 p-4 rounded-default opacity-60">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-text-primary flex items-center gap-2"><CheckCircle className="w-4 h-4 text-brand-primary"/> Integração {activeAreaDetails.name}</h4>
                        <span className="text-xs font-bold bg-brand-primary/20 text-brand-primary px-2 py-1 rounded-md">Concluído</span>
                      </div>
                      <p className="text-xs text-text-muted">Visão, valores e regras de ouro do nosso ministério.</p>
                    </div>

                    {/* Módulo 2: Em andamento */}
                    <div className="bg-surface-card border border-white/10 hover:border-brand-primary/30 p-4 rounded-default transition-all shadow-level-2">
                      <div className="flex justify-between items-center mb-2">
                        {/* FIX: BookOpen agora importado corretamente */}
                        <h4 className="font-bold text-text-primary flex items-center gap-2"><BookOpen className="w-4 h-4 text-brand-primary"/> Técnica Operacional</h4>
                        {trainingProgress === 100 ? (
                          <span className="text-xs font-bold bg-brand-primary/20 text-brand-primary px-2 py-1 rounded-md">Concluído</span>
                        ) : (
                          <button
                            onClick={async () => {
                              try {
                                const res = await apiFetch('/api/training/complete', { method: 'POST', body: { moduleId: 'TECNICA_OPERACIONAL' } });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok) {
                                  setTrainingProgress(100);
                                  setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
                                  showNotification(data.awarded ? `Treinamento Concluído! Você ganhou +${data.awarded} Zion Points! 🎯` : 'Treinamento concluído!');
                                } else showNotification(data.error || 'Falha ao concluir treinamento.');
                              } catch { showNotification('Falha de rede ao concluir treinamento.'); }
                            }}
                            className="text-xs font-bold bg-brand-primary text-white hover:bg-brand-secondary transition-colors px-4 py-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 flex items-center gap-1"
                          >
                            Concluir <Gift className="w-3 h-3"/>
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">Aprenda a operar os equipamentos básicos e rotinas de abertura.</p>
                    </div>

                    {/* Módulo 3: Bloqueado */}
                    <div className="bg-surface-card border border-white/5 p-4 rounded-default opacity-50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-text-primary flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-text-muted"/> Liderança em Treinamento</h4>
                        <span className="text-xs font-bold text-text-muted flex items-center gap-1"><Clock className="w-3 h-3"/> Bloqueado</span>
                      </div>
                      <p className="text-xs text-text-muted">Disponível após conclusão do Nível 1 e indicação pastoral.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: EQUIPE */}
              {modalTab === 'equipe' && (() => {
                const team = (areaApproved[selectedAreaId] || []).filter(m => m.id !== activeAreaDetails.leaderId);
                return (
                  <div className="animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Líder real da área */}
                      <div className="bg-surface-dark border border-brand-primary/20 p-3 rounded-md flex items-center gap-3">
                        <Avatar name={activeAreaDetails.leader?.name} src={activeAreaDetails.leader?.profileImage} size={40} />
                        <div className="min-w-0">
                          <div className="font-bold text-text-primary text-sm truncate">{activeAreaDetails.leader?.name || 'Líder'}</div>
                          <div className="text-[10px] text-brand-primary font-bold mt-0.5 uppercase">Líder da Área</div>
                        </div>
                      </div>
                      {/* Voluntários aprovados */}
                      {team.map(m => (
                        <div key={m.id} className="bg-surface-dark border border-white/5 p-3 rounded-md flex items-center gap-3 hover:border-white/10 transition-colors">
                          <Avatar name={m.name} src={m.profileImage} size={40} />
                          <div className="min-w-0">
                            <div className="font-bold text-text-primary text-sm truncate">{m.name}</div>
                            <div className="text-[10px] text-text-muted mt-0.5">{m.role || 'Voluntário'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {team.length === 0 && (
                      <p className="text-center text-text-muted text-sm py-6">Ainda não há outros voluntários aprovados nesta área.</p>
                    )}
                  </div>
                );
              })()}

              {/* TAB: MURAL */}
              {modalTab === 'mural' && (() => {
                const isLeader = activeAreaDetails.leaderId === user?.id || isAreaStaff(user);
                const pinned = muralMsgs.filter(m => m.isPinned);
                const normal = muralMsgs.filter(m => !m.isPinned);
                const catInfo = (c) => AREA_MURAL_CATS.find(x => x.id === c) || AREA_MURAL_CATS[3];
                const MsgCard = (m) => {
                  const ci = catInfo(m.category);
                  const canManage = isLeader || m.authorId === user?.id;
                  return (
                    <div key={m.id} className={`bg-surface-dark border rounded-default p-4 ${m.isPinned ? 'border-amber-500/30' : 'border-white/5'}`}>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={m.author?.name} src={m.author?.profileImage} size={24} />
                          <span className="font-bold text-text-primary text-sm truncate">{m.author?.name || 'Membro'}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${ci.bg} ${ci.color}`}>{ci.label}</span>
                          {m.isPinned && <Pin className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isLeader && <button onClick={() => handleMuralPin(m.id)} title={m.isPinned ? 'Desafixar' : 'Fixar'} className="p-1 rounded text-text-muted hover:text-amber-400 hover:bg-white/5 transition-colors"><Pin className="w-4 h-4" /></button>}
                          {canManage && <button onClick={() => handleMuralDelete(m.id)} title="Excluir" className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{m.content}</p>
                      {renderMuralPoll(m)}
                      {renderMuralReactions(m)}
                      <div className="text-[10px] text-text-muted mt-2">{new Date(m.createdAt).toLocaleString('pt-BR')}</div>
                    </div>
                  );
                };
                return (
                  <div className="space-y-5 animate-in fade-in">
                    {/* Compositor */}
                    <form onSubmit={handlePostMural} className="bg-surface-dark border border-white/10 rounded-default p-4">
                      <textarea value={muralContent} onChange={e => setMuralContent(e.target.value)} rows="2" placeholder={muralPoll ? 'Qual é a pergunta da enquete?' : 'Compartilhe um aviso, escala ou recado com a equipe...'} className="w-full bg-surface-card border border-white/5 rounded-md px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary resize-none" required />
                      {muralPoll && (
                        <div className="mt-3 space-y-2">
                          {muralOptions.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input type="text" value={opt} onChange={e => setMuralOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))} placeholder={`Opção ${i + 1}`} maxLength={80} className="flex-1 bg-surface-card border border-white/5 rounded-md px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" />
                              {muralOptions.length > 2 && <button type="button" onClick={() => setMuralOptions(prev => prev.filter((_, idx) => idx !== i))} aria-label="Remover" className="p-2 rounded text-text-muted hover:text-red-400"><X className="w-4 h-4" /></button>}
                            </div>
                          ))}
                          {muralOptions.length < 6 && <button type="button" onClick={() => setMuralOptions(prev => [...prev, ''])} className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-secondary"><Plus className="w-3.5 h-3.5" /> Adicionar opção</button>}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-3 gap-3">
                        <div className="flex flex-wrap gap-2">
                          {AREA_MURAL_CATS.map(c => (
                            <button key={c.id} type="button" onClick={() => setMuralCat(c.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${muralCat === c.id ? `${c.bg} ${c.border} ${c.color} border ring-1 ring-current` : 'bg-surface-card border border-white/5 text-text-muted hover:text-white'}`}>{c.label}</button>
                          ))}
                          <button type="button" onClick={() => setMuralPoll(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${muralPoll ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary border ring-1 ring-current' : 'bg-surface-card border border-white/5 text-text-muted hover:text-white'}`}><BarChart3 className="w-3.5 h-3.5" /> Enquete</button>
                        </div>
                        <button type="submit" disabled={!muralContent.trim() || muralPosting} className="flex items-center gap-2 bg-brand-primary text-white px-5 py-2 rounded-default text-sm font-bold hover:bg-brand-secondary transition-all disabled:opacity-50 w-full sm:w-auto justify-center">
                          {muralPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Publicar</>}
                        </button>
                      </div>
                    </form>

                    {/* Lista */}
                    {muralLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
                    ) : muralMsgs.length === 0 ? (
                      <div className="text-center text-text-muted py-10 bg-surface-dark rounded-default border border-dashed border-white/10">
                        <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">O mural está vazio.</p>
                        <p className="text-xs mt-1 opacity-60">Seja o primeiro a publicar um aviso para a equipe.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pinned.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-wider"><Pin className="w-3.5 h-3.5" /> Fixadas</div>
                            {pinned.map(MsgCard)}
                          </div>
                        )}
                        {normal.map(MsgCard)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CHECK-IN DE EVENTO DE VOLUNTÁRIO (código exibido no local) */}
      {checkinEvent && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => !checkingInEvent && setCheckinEvent(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><CheckCircle className="w-5 h-5 text-brand-primary"/> Check-in</h3>
              <button onClick={() => setCheckinEvent(null)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-4"><span className="text-white font-semibold">{checkinEvent.title}</span> — escaneie o QR Code do evento ou digite o código exibido no local para ganhar seus pontos.</p>
            <button onClick={() => setShowQrScanner(true)} className="w-full bg-surface-dark border border-brand-primary/30 text-brand-primary py-2.5 rounded-default font-semibold flex items-center justify-center gap-2 mb-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-brand-primary/10 transition-colors">
              <Camera className="w-4 h-4"/> Escanear QR Code
            </button>
            <div className="flex items-center gap-2 mb-3"><div className="flex-1 h-px bg-white/10"/><span className="text-xs text-text-muted">ou</span><div className="flex-1 h-px bg-white/10"/></div>
            <input value={checkinCode} onChange={e => setCheckinCode(e.target.value.toUpperCase())} placeholder="Código (ex: ZION01)" className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2.5 text-white font-mono text-center tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary mb-4" />
            <button onClick={() => handleEventCheckin()} disabled={!checkinCode.trim() || checkingInEvent} className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
              {checkingInEvent ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>} Confirmar presença
            </button>
          </div>
        </div>
      )}

      {showQrScanner && (
        <Suspense fallback={null}>
          <QrScanner
            onClose={() => setShowQrScanner(false)}
            onResult={(raw) => {
              const code = extractCheckinCode(raw);
              setCheckinCode(code);
              setShowQrScanner(false);
              handleEventCheckin(code);
            }}
          />
        </Suspense>
      )}

      {/* ── MODAL DE CONFIRMAÇÃO DE CANCELAMENTO DE ÁREA (sem window.confirm) */}
      {areaToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setAreaToCancel(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-amber-400"><div className="bg-amber-500/10 p-3 rounded-full"><AlertTriangle className="w-8 h-8"/></div></div>
            <h3 className="text-xl font-bold text-text-primary text-center mb-2">
              {areaToCancel.status === 'APROVADO' ? 'Pedir saída da área?' : 'Cancelar Solicitação?'}
            </h3>
            <p className="text-text-muted text-center mb-6 text-sm">
              {areaToCancel.status === 'APROVADO'
                ? 'Seu pedido de saída será enviado ao líder da área para aprovação. Você continua na equipe até lá.'
                : 'Tem certeza que deseja cancelar sua solicitação de entrada nesta área?'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAreaToCancel(null)} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Voltar</button>
              <button onClick={executeCancelArea} className="flex-1 px-4 py-2.5 rounded-default bg-red-500 hover:bg-red-600 text-white font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoluntariosModule;