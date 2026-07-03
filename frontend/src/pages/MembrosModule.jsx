import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { Award, BookOpen, Calendar, Clock, CheckCircle, ChevronLeft, ChevronRight, CalendarDays, Megaphone, Heart, MessageSquare, Flame, Camera, X, Loader2, Trophy } from 'lucide-react';
import GroupsPanel from './GroupsPanel';
import { compressImage, fileToDataUrl } from '../utils/image';
import { getEventOccurrences } from '../utils/eventOccurrences';

const MembrosModule = ({ user, setUser, showNotification, intent, onIntentHandled }) => {
  const [events, setEvents] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [publications, setPublications] = useState([]);
  const [reading, setReading] = useState(null); // { count, todayDay, todayReference, todayDone, milestones }
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(null);
  const [checking, setChecking] = useState(false);
  const [shareGroupIds, setShareGroupIds] = useState([]); // grupos p/ compartilhar a leitura
  const [readingComment, setReadingComment] = useState('');
  const [checkinEvent, setCheckinEvent] = useState(null); // ocorrência em check-in
  const [checkinCode, setCheckinCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [bibleText, setBibleText] = useState(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [rsvpEvents, setRsvpEvents] = useState([]); // refIds com presença confirmada (RSVP)
  const [checkedInEvents, setCheckedInEvents] = useState([]); // refIds com check-in real feito
  // Pedido de oração
  const [prayerOpen, setPrayerOpen] = useState(false);
  const [prayerText, setPrayerText] = useState('');
  const [prayerSending, setPrayerSending] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [resEvents, resShifts, resAnn, resPubs, resReading, resParts] = await Promise.all([
          apiFetch('/api/events?type=GERAL').catch(() => null),
          apiFetch(`/api/shifts?userId=${user?.id}`).catch(() => null),
          apiFetch('/api/announcements?type=GERAL').catch(() => null),
          apiFetch('/api/publications').catch(() => null),
          apiFetch('/api/reading/me').catch(() => null),
          apiFetch('/api/events/my-participations').catch(() => null)
        ]);
        if (resEvents && resEvents.ok) setEvents(await resEvents.json());
        if (resShifts && resShifts.ok) setShifts(await resShifts.json());
        if (resAnn && resAnn.ok) setAnnouncements(await resAnn.json());
        if (resPubs && resPubs.ok) setPublications(await resPubs.json());
        if (resReading && resReading.ok) setReading(await resReading.json());
        if (resParts && resParts.ok) {
          const parts = await resParts.json();
          setRsvpEvents(parts.map(p => p.refId));
          setCheckedInEvents(parts.filter(p => p.checkedInAt).map(p => p.refId));
        }
      } catch (error) {} finally { setIsLoading(false); }
    };
    fetchDashboardData();
  }, [user?.id]); // Re-fetch se simular outro usuário

  const today = new Date();
  const currentMonth = calendarDate.getMonth();
  const currentYear = calendarDate.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  
  const calendarDays = Array(firstDayOfMonth).fill(null).concat(Array.from({length: daysInMonth}, (_, i) => i + 1));

  // ── Recorrência: mostra só a PRÓXIMA ocorrência (a atual some quando termina) ──
  const RECURRENCE_LABEL = { WEEKLY: 'Semanal', MONTHLY: 'Mensal' };
  const eventOccurrences = getEventOccurrences(events);

  const checkDayAgenda = (day) => {
    if (!day) return { event: false, shift: false };
    const checkDateStr = new Date(currentYear, currentMonth, day).toDateString();
    const hasShift = shifts.some(s => s.status.toUpperCase() === 'CONFIRMADO' && new Date(s.date).toDateString() === checkDateStr);
    const hasEvent = eventOccurrences.some(o => rsvpEvents.includes(o.occId) && new Date(o.occIso).toDateString() === checkDateStr);
    return { event: hasEvent, shift: hasShift };
  };

  // Nível de fogo = quantos marcos já foram atingidos (0..5)
  const fireLevel = reading ? (reading.milestones || []).filter(m => reading.count >= m).length : 0;

  const handleReadingPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { setReadingPhoto(await compressImage(file, 1000, 0.72)); }
    catch { setReadingPhoto(await fileToDataUrl(file).catch(() => null)); }
  };

  const handleCheckReading = async (withPhoto) => {
    if (withPhoto && !readingPhoto) return showNotification('Envie uma foto ou confirme sem foto.');
    // Comentário só é publicado nos grupos selecionados — exige ao menos um grupo marcado
    if (readingComment.trim() && shareGroupIds.length === 0) return showNotification('Selecione ao menos um grupo para enviar o comentário.');
    setChecking(true);
    try {
      const body = { groupIds: shareGroupIds };
      if (withPhoto) body.photoUrl = readingPhoto;
      if (readingComment.trim()) body.comment = readingComment.trim();
      const res = await apiFetch('/api/reading/check', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReading(prev => ({ ...(prev || {}), count: data.count, todayDone: true }));
        setUser(prev => ({ ...prev, points: data.user?.points ?? prev.points, bibleStreak: data.count }));
        setShowReadingModal(false); setReadingPhoto(null);
        if (data.milestoneReached) showNotification(`🔥 Marco de ${data.milestoneReached} dias! +${data.pointsEarned} Zion Points!`);
        else showNotification(`Leitura registrada! +${data.pointsEarned} Zion Points! 🙌`);
      } else {
        showNotification(data.error || 'Não foi possível registrar a leitura.');
      }
    } catch {
      showNotification('Falha de rede ao registrar a leitura.');
    } finally { setChecking(false); }
  };

  const openReadingModal = async () => {
    setReadingPhoto(null);
    setReadingComment('');
    setShareGroupIds((reading?.groups || []).map(g => g.id)); // pré-seleciona todos os grupos
    setShowReadingModal(true);
    // Rebusca os dados (inclui a lista de grupos atual) para refletir grupos criados nesta sessão
    try {
      const res = await apiFetch('/api/reading/me').catch(() => null);
      if (res && res.ok) {
        const fresh = await res.json();
        setReading(fresh);
        setShareGroupIds((fresh?.groups || []).map(g => g.id));
      }
    } catch (e) {}
  };
  const toggleShareGroup = (id) => setShareGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  // Confirma presença via código (usado pelo check-in por QR) e atualiza card + calendário + pontos
  const checkinByCode = async (eventId, code) => {
    try {
      const res = await apiFetch(`/api/events/${eventId}/checkin`, { method: 'POST', body: { code } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.refId) {
          setRsvpEvents(prev => prev.includes(data.refId) ? prev : [...prev, data.refId]);
          setCheckedInEvents(prev => prev.includes(data.refId) ? prev : [...prev, data.refId]);
        }
        setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
        showNotification(data.already ? 'Presença já confirmada neste evento.' : `Presença confirmada! +${data.awarded} Zion Points! 🎉`);
      } else showNotification(data.error || 'Código de check-in inválido.');
    } catch { showNotification('Falha de rede no check-in.'); }
  };

  const handleSendPrayer = async () => {
    if (!prayerText.trim()) return;
    setPrayerSending(true);
    try {
      const res = await apiFetch('/api/prayer-requests', { method: 'POST', body: { content: prayerText.trim() } });
      if (res.ok) {
        setPrayerOpen(false); setPrayerText('');
        showNotification('Recebemos seu pedido. Nossa equipe de intercessão vai orar por você. 🙏');
      } else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Não foi possível enviar o pedido.'); }
    } catch { showNotification('Falha de rede ao enviar o pedido.'); }
    finally { setPrayerSending(false); }
  };

  // Ação vinda de uma notificação ou do QR: leitura / grupos / check-in de evento
  useEffect(() => {
    if (!intent) return;
    if (intent === 'reading') openReadingText();
    else if (intent === 'groups') setShowGroups(true);
    else if (intent.startsWith('checkin:')) {
      const [, eventId, code] = intent.split(':');
      if (eventId && code) checkinByCode(eventId, code);
    }
    onIntentHandled?.();
  }, [intent]);

  const handleCheckin = async () => {
    if (!checkinCode.trim() || !checkinEvent) return;
    setCheckingIn(true);
    try {
      const res = await apiFetch(`/api/events/${checkinEvent.id}/checkin`, { method: 'POST', body: { code: checkinCode.trim(), refId: checkinEvent.occId } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRsvpEvents(prev => prev.includes(checkinEvent.occId) ? prev : [...prev, checkinEvent.occId]);
        setCheckedInEvents(prev => prev.includes(checkinEvent.occId) ? prev : [...prev, checkinEvent.occId]);
        setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
        setCheckinEvent(null); setCheckinCode('');
        if (data.already) showNotification('Você já fez check-in neste evento.');
        else showNotification(`Check-in confirmado! +${data.awarded} Zion Points! 🎉`);
      } else showNotification(data.error || 'Código de check-in inválido.');
    } catch { showNotification('Falha de rede no check-in.'); }
    finally { setCheckingIn(false); }
  };

  // Participar (RSVP): confirma presença sem código — marca no calendário e credita pontos.
  // Depois de confirmado, o botão vira "Check-in" (confirmação real de presença no local).
  const handleParticipate = async (ev) => {
    if (rsvpEvents.includes(ev.occId)) return;
    setRsvpEvents(prev => [...prev, ev.occId]); // otimista
    try {
      const res = await apiFetch(`/api/events/${ev.id}/participate`, { method: 'POST', body: { refId: ev.occId } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser(prev => ({ ...prev, points: data.points ?? prev.points }));
        if (data.already) showNotification('Presença já confirmada neste evento.');
        else showNotification(`Presença confirmada! +${data.awarded} Zion Points! 🎉`);
      } else {
        setRsvpEvents(prev => prev.filter(id => id !== ev.occId)); // desfaz otimista
        showNotification(data.error || 'Não foi possível confirmar presença.');
      }
    } catch {
      setRsvpEvents(prev => prev.filter(id => id !== ev.occId));
      showNotification('Falha de rede ao confirmar presença.');
    }
  };

  const openReadingText = async () => {
    setShowTextModal(true);
    if (bibleText) return; // já carregado nesta sessão
    setTextLoading(true); setTextError('');
    try {
      const res = await apiFetch('/api/reading/text');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setBibleText(data);
      else setTextError(data.error || 'Não foi possível carregar o texto.');
    } catch {
      setTextError('Falha de rede ao carregar o texto.');
    } finally { setTextLoading(false); }
  };

  const formatData = (dateString) => {
    const date = new Date(dateString);
    return isNaN(date) ? dateString : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  };

  // já contém só a próxima ocorrência de cada evento (em andamento ou futura), ordenada
  const futureEvents = eventOccurrences;
  // Só comunicados do tipo GERAL aparecem aqui (Início/Membros)
  const generalAnnouncement = announcements.filter(a => a.type === 'GERAL')[0] || null;

  return (
    <div className="space-y-6">
      
      {generalAnnouncement && (
        <div className="bg-surface-card bg-gradient-to-r from-brand-secondary/20 to-brand-primary/20 border border-brand-primary/30 p-4 rounded-default shadow-sm mb-6">
          <div className="flex items-start gap-3">
            <div className="bg-brand-primary/20 p-2 rounded-full text-brand-primary mt-1 shrink-0"><Megaphone className="w-5 h-5" /></div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">{generalAnnouncement.title}</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{generalAnnouncement.content}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-brand-secondary to-brand-primary p-6 rounded-default shadow-level-2 text-white relative overflow-hidden">
        <div className="flex justify-between items-center mb-5 relative z-10">
          <div>
            <h2 className="text-xl font-display font-bold">Meu Engajamento</h2>
            <p className="text-white/80 text-sm mt-1">Continue participando para subir de nível!</p>
          </div>
          <div className="bg-black/20 p-3 rounded-full"><Award className="text-yellow-400 w-8 h-8" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-black/30 p-4 rounded-default border border-white/10 hover:bg-black/40 transition-colors">
            <div className="text-white/60 text-[10px] uppercase font-bold tracking-widest mb-1">Zion Points</div>
            <div className="text-3xl font-display font-bold text-white transition-all duration-500">{user?.points || 0}</div>
          </div>
          <div className="bg-black/30 p-4 rounded-default border border-white/10 hover:bg-black/40 transition-colors flex flex-col justify-between relative overflow-hidden group">
            <div className="relative z-10">
              <div className="text-white/60 text-[10px] uppercase font-bold tracking-widest mb-1">Plano Bíblico</div>
              <div className="text-3xl font-display font-bold text-white">{user?.bibleStreak || 0} <span className="text-sm font-sans font-normal opacity-70">dias</span></div>
            </div>
            <BookOpen className="text-white w-24 h-24 absolute -right-4 -bottom-4 opacity-10 transform -rotate-12 group-hover:scale-110 transition-transform duration-500" />
          </div>
        </div>
      </div>

      {/* ── PLANO BÍBLICO ── */}
      <div className="bg-surface-card bg-gradient-to-br from-orange-600/20 to-red-600/10 border border-orange-500/30 p-5 rounded-default shadow-level-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-orange-400"/> Plano Bíblico 2026</h3>
            {reading ? (
              <>
                <p className="text-sm text-text-muted mt-1">Dia {reading.todayDay} • <span className="text-white font-semibold">{reading.todayReference}</span></p>
                <p className="text-xs text-text-muted mt-1">
                  {reading.count} {reading.count === 1 ? 'dia lido' : 'dias lidos'}
                  {(() => { const next = (reading.milestones || []).find(m => reading.count < m); return next ? ` • faltam ${next - reading.count} para o marco de ${next} dias 🔥` : ' • todos os marcos atingidos! 🔥'; })()}
                </p>
              </>
            ) : <p className="text-sm text-text-muted mt-1">Carregando…</p>}
          </div>
          <div className="flex items-end gap-0.5 shrink-0" title={`${fireLevel} marco(s) atingido(s)`}>
            {fireLevel === 0
              ? <Flame className="w-6 h-6 text-white/15" />
              : Array.from({ length: fireLevel }).map((_, i) => (
                  <Flame key={i} className="text-orange-400" style={{ width: 16 + i * 5, height: 16 + i * 5 }} />
                ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          {reading?.todayDone ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-emerald-400 text-sm font-bold bg-emerald-500/10 border border-emerald-500/20 py-2.5 rounded-default"><CheckCircle className="w-4 h-4"/> Leitura de hoje concluída</div>
          ) : (
            <button onClick={openReadingModal} disabled={!reading} className="flex-1 bg-orange-500 hover:bg-orange-400 text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-50"><Flame className="w-4 h-4"/> Marcar leitura de hoje</button>
          )}
          <button onClick={openReadingText} className="sm:w-auto bg-surface-dark border border-white/10 text-white py-2.5 px-4 rounded-default font-bold flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-white/5"><BookOpen className="w-4 h-4"/> Ler agora</button>
          <button onClick={() => setShowGroups(true)} className="sm:w-auto bg-surface-dark border border-orange-500/30 text-orange-300 py-2.5 px-4 rounded-default font-bold flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-orange-500/10"><Trophy className="w-4 h-4"/> Grupos</button>
        </div>
      </div>

      <div className="bg-surface-card p-4 rounded-default border border-white/5 shadow-level-2">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setCalendarDate(new Date(currentYear, currentMonth - 1, 1))} className="p-1 rounded-md text-text-muted hover:text-white hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCalendarDate(new Date())} className="font-display font-bold text-sm text-text-primary capitalize flex items-center gap-1 hover:text-brand-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
            <Calendar className="w-4 h-4 text-brand-primary"/> {monthNames[currentMonth]} {currentYear}
          </button>
          <button onClick={() => setCalendarDate(new Date(currentYear, currentMonth + 1, 1))} className="p-1 rounded-md text-text-muted hover:text-white hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const { event, shift } = checkDayAgenda(day);
              const both = event && shift;
              const isToday = currentMonth === today.getMonth() && currentYear === today.getFullYear() && day === today.getDate();
              let cellClasses = 'border border-white/5 text-text-secondary hover:border-white/15 hover:bg-surface-dark';
              let cellStyle = {};
              if (both) { cellStyle = { background: 'linear-gradient(135deg, #00B8A9 0%, #00B8A9 49%, #3b82f6 51%, #3b82f6 100%)' }; cellClasses = 'border border-white/10 text-white font-bold shadow-[0_0_8px_rgba(0,184,169,0.4)]'; } 
              else if (event) { cellClasses = 'border border-white/10 bg-brand-primary text-white font-bold shadow-[0_0_8px_rgba(0,184,169,0.4)]'; } 
              else if (shift) { cellClasses = 'border border-white/10 bg-blue-500 text-white font-bold shadow-[0_0_8px_rgba(59,130,246,0.4)]'; } 
              else if (isToday) { cellClasses = 'border border-brand-primary/50 bg-brand-primary/10 text-brand-primary'; }
              return <div key={idx} style={cellStyle} className={`h-8 rounded-md flex items-center justify-center text-[12px] transition-colors ${cellClasses} ${!day && 'invisible'} ${isToday && (event || shift) ? 'ring-2 ring-white/40' : ''}`}>{day}</div>;
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-xs sm:text-sm font-bold text-white justify-center border-t border-white/5 pt-4">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Escala</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-brand-primary"></span> Evento</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #00B8A9 0%, #00B8A9 49%, #3b82f6 51%, #3b82f6 100%)' }}></span> Ambos</div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-display font-bold mb-4 flex items-center gap-2 text-text-primary">Próximos Eventos</h3>
        {futureEvents.some(o => o.isNow) && (
          <div className="mb-3 flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-default px-4 py-2.5 text-sm font-bold animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></span>
            Acontecendo agora: {futureEvents.filter(o => o.isNow).map(o => o.title).join(', ')}
          </div>
        )}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-5"><div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
          ) : futureEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-surface-dark border border-dashed border-white/10 rounded-default">
              <div className="bg-white/5 p-4 rounded-full mb-4"><CalendarDays className="w-8 h-8 text-text-muted" /></div>
              <h4 className="text-lg font-bold text-white mb-1">Nenhum evento próximo</h4>
              <p className="text-sm text-text-muted text-center max-w-sm">Aproveite para focar no seu Plano Bíblico ou confira a aba de Voluntários.</p>
            </div>
          ) : (
            futureEvents.map(ev => {
              const hasRsvp = rsvpEvents.includes(ev.occId);
              const hasCheckedIn = checkedInEvents.includes(ev.occId);
              const recurring = ev.recurrence && ev.recurrence !== 'NONE';
              return (
                <div key={ev.occId} className={`bg-surface-card p-4 rounded-default shadow-sm border ${hasRsvp ? 'border-brand-primary/30' : 'border-white/5'} flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all duration-300`}>
                  <div>
                    <div className="font-bold text-text-primary flex items-center gap-2">
                      {ev.title}
                      {recurring && <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold bg-purple-500/20 text-purple-400">↻ {RECURRENCE_LABEL[ev.recurrence]}</span>}
                    </div>
                    <div className="text-sm text-text-muted flex items-center gap-1 mt-1 capitalize"><Clock className="w-3 h-3 text-brand-primary"/> {formatData(ev.occIso)}</div>
                  </div>
                  {hasCheckedIn ? (
                    <span className="flex items-center justify-center gap-1 text-brand-primary text-sm font-bold bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-default shrink-0"><CheckCircle className="w-4 h-4"/> Confirmado</span>
                  ) : hasRsvp ? (
                    <button onClick={() => { setCheckinCode(''); setCheckinEvent(ev); }} className="flex items-center justify-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 shrink-0"><Clock className="w-4 h-4"/> Check-in</button>
                  ) : (
                    <button onClick={() => handleParticipate(ev)} className="flex items-center justify-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 shrink-0"><CheckCircle className="w-4 h-4"/> Participar</button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-6 border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-bold flex items-center gap-2 text-text-primary">
            <MessageSquare className="w-5 h-5 text-brand-primary"/> Mural da Comunidade
          </h3>
          <button onClick={() => { setPrayerText(''); setPrayerOpen(true); }} className="flex items-center gap-1.5 text-xs font-bold text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 px-3 py-1.5 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
            <Heart className="w-3.5 h-3.5"/> Pedir Oração
          </button>
        </div>

        <div className="space-y-4">
          {publications.length === 0 && !isLoading ? (
            <div className="text-center text-text-muted py-8 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Nenhuma publicação no mural ainda.</div>
          ) : (
            publications.map(pub => (
              <div key={pub.id} className="bg-surface-card border border-white/5 rounded-default p-4 shadow-sm">
                 <div className="flex items-center gap-2 mb-3">
                   <div className="w-8 h-8 rounded-full bg-brand-primary/20 text-brand-primary flex items-center justify-center font-bold text-xs">{pub.author?.name?.charAt(0) || 'A'}</div>
                   <div>
                     <div className="text-sm font-bold text-white">{pub.author?.name || 'Admin'}</div>
                     <div className="text-[10px] text-text-muted">{new Date(pub.createdAt).toLocaleDateString('pt-BR')}</div>
                   </div>
                 </div>
                 <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{pub.content}</p>
                 {pub.imageUrl && <img src={pub.imageUrl} alt="Publicação" className="mt-3 rounded-md w-full max-h-64 object-cover border border-white/10" />}
                 {pub.documentUrl && <a href={pub.documentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-2 rounded-md hover:bg-blue-500/20 transition-colors">Ver Anexo</a>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: pedido de oração */}
      {prayerOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => !prayerSending && setPrayerOpen(false)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><Heart className="w-5 h-5 text-pink-400"/> Pedir Oração</h3>
              <button onClick={() => setPrayerOpen(false)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-3">Compartilhe seu motivo de oração. Nossa equipe de intercessão vai orar por você. 🙏</p>
            <textarea value={prayerText} onChange={e => setPrayerText(e.target.value)} rows="4" maxLength={2000} placeholder="Escreva aqui seu pedido..." className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary resize-none mb-4" />
            <button onClick={handleSendPrayer} disabled={!prayerText.trim() || prayerSending} className="w-full bg-pink-500 hover:bg-pink-400 text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              {prayerSending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Heart className="w-4 h-4"/>} Enviar pedido
            </button>
          </div>
        </div>
      )}

      {/* Modal: comprovar leitura do dia */}
      {showReadingModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => !checking && setShowReadingModal(false)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><BookOpen className="w-5 h-5 text-orange-400"/> Leitura de hoje</h3>
              <button onClick={() => setShowReadingModal(false)} className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-3">Dia {reading?.todayDay}: <span className="text-white font-semibold">{reading?.todayReference}</span>.</p>
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 mb-4 text-xs text-amber-300">
              <Camera className="w-4 h-4 shrink-0 mt-0.5"/>
              <span>Enviar uma foto de comprovação vale <span className="font-bold">+{reading?.pointsWithPhoto ?? 15} pts</span>. Sem foto você ainda registra a leitura, mas ganha só <span className="font-bold">+{reading?.pointsNoPhoto ?? 5} pts</span>.</span>
            </div>
            <div className="flex flex-col items-center mb-4">
              <div className="w-full h-40 rounded-md border border-white/10 bg-surface-dark flex items-center justify-center overflow-hidden mb-2">
                {readingPhoto ? <img src={readingPhoto} alt="Comprovação" className="w-full h-full object-cover"/> : <Camera className="w-8 h-8 text-white/20"/>}
              </div>
              <label className="text-sm bg-surface-dark border border-white/10 text-white px-4 py-2 rounded-md hover:border-orange-500 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                {readingPhoto ? 'Trocar foto' : 'Enviar foto (opcional)'}
                <input type="file" accept="image/*" className="hidden" onChange={handleReadingPhoto}/>
              </label>
            </div>

            {reading?.groups && reading.groups.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-text-muted mb-2">Compartilhar no chat de qual(is) grupo(s)?</p>
                <div className="flex flex-wrap gap-2">
                  {reading.groups.map(g => {
                    const on = shareGroupIds.includes(g.id);
                    return (
                      <button key={g.id} type="button" onClick={() => toggleShareGroup(g.id)} className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${on ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary' : 'bg-surface-dark border-white/10 text-text-muted'}`}>
                        {on ? <CheckCircle className="w-3.5 h-3.5"/> : <Trophy className="w-3.5 h-3.5"/>} {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {reading?.groups && reading.groups.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-text-muted mb-1">Comentário para o grupo (opcional)</p>
                <textarea value={readingComment} onChange={e => setReadingComment(e.target.value)} rows="2" placeholder="Ex: Que leitura poderosa hoje! 🙌" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary resize-none" />
                {readingComment.trim() && shareGroupIds.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">Selecione ao menos um grupo acima para o comentário ser enviado.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button onClick={() => handleCheckReading(true)} disabled={!readingPhoto || checking} className="w-full bg-orange-500 hover:bg-orange-400 text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
                {checking ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>} Confirmar com foto (+{reading?.pointsWithPhoto ?? 15})
              </button>
              <button onClick={() => handleCheckReading(false)} disabled={checking} className="w-full bg-surface-dark border border-white/10 text-text-muted hover:text-white py-2 rounded-default text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
                Confirmar sem foto (+{reading?.pointsNoPhoto ?? 5})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: texto da leitura do dia */}
      {showTextModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-200" onClick={() => setShowTextModal(false)}>
          <div className="bg-surface-card border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display font-bold text-lg text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-orange-400"/> {reading?.todayReference || 'Leitura de hoje'}</h3>
                {bibleText && <p className="text-[11px] text-text-muted mt-0.5">{bibleText.translation}</p>}
              </div>
              <button onClick={() => setShowTextModal(false)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
            </div>

            <div className="p-5 overflow-y-auto leading-relaxed">
              {textLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-text-muted"><Loader2 className="w-7 h-7 animate-spin text-brand-primary"/><span className="text-sm">Carregando o texto…</span></div>
              ) : textError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-text-muted mb-3">{textError}</p>
                  <button onClick={() => { setBibleText(null); openReadingText(); }} className="text-sm font-bold text-brand-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Tentar novamente</button>
                </div>
              ) : bibleText ? (
                <div className="space-y-6">
                  {bibleText.passages.map(p => (
                    <div key={p.chapter}>
                      <h4 className="font-display font-bold text-brand-primary mb-2">Capítulo {p.chapter}</h4>
                      <p className="text-text-secondary text-[15px] leading-7 text-justify">
                        {p.verses.map(v => (
                          <span key={v.verse}><sup className="text-brand-primary/70 font-bold mr-0.5">{v.verse}</sup>{v.text}{' '}</span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {!reading?.todayDone && (
              <div className="p-4 border-t border-white/10 shrink-0">
                <button onClick={() => { setShowTextModal(false); openReadingModal(); }} className="w-full bg-orange-500 hover:bg-orange-400 text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Flame className="w-4 h-4"/> Marcar como lido</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: check-in de evento por código */}
      {checkinEvent && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => !checkingIn && setCheckinEvent(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><CheckCircle className="w-5 h-5 text-brand-primary"/> Check-in</h3>
              <button onClick={() => setCheckinEvent(null)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-4"><span className="text-white font-semibold">{checkinEvent.title}</span> — digite o código exibido no local (QR) para confirmar sua presença.</p>
            <input value={checkinCode} onChange={e => setCheckinCode(e.target.value.toUpperCase())} placeholder="Código (ex: ZION01)" className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2.5 text-white font-mono text-center tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary mb-4" />
            <button onClick={handleCheckin} disabled={!checkinCode.trim() || checkingIn} className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-colors">
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>} Confirmar presença
            </button>
          </div>
        </div>
      )}

      {showGroups && <GroupsPanel user={user} showNotification={showNotification} onClose={() => setShowGroups(false)} />}
    </div>
  );
};

export default MembrosModule;