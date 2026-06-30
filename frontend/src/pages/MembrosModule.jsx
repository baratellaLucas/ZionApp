import React, { useState, useEffect } from 'react';
import { Award, BookOpen, Calendar, Clock, CheckCircle, ChevronLeft, ChevronRight, CalendarDays, Megaphone, Heart, MessageSquare } from 'lucide-react';

const MembrosModule = ({ user, setUser, showNotification }) => {
  const [events, setEvents] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [publications, setPublications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [participatingEvents, setParticipatingEvents] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [resEvents, resShifts, resAnn, resPubs] = await Promise.all([
          fetch('http://localhost:3000/api/events?type=GERAL').catch(() => null),
          fetch(`http://localhost:3000/api/shifts?userId=${user?.id}`).catch(() => null),
          fetch('http://localhost:3000/api/announcements?type=GERAL').catch(() => null),
          fetch('http://localhost:3000/api/publications').catch(() => null)
        ]);
        if (resEvents && resEvents.ok) setEvents(await resEvents.json());
        if (resShifts && resShifts.ok) setShifts(await resShifts.json());
        if (resAnn && resAnn.ok) setAnnouncements(await resAnn.json());
        if (resPubs && resPubs.ok) setPublications(await resPubs.json());
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

  const checkDayAgenda = (day) => {
    if (!day) return { event: false, shift: false };
    const checkDateStr = new Date(currentYear, currentMonth, day).toDateString();
    const hasShift = shifts.some(s => s.status.toUpperCase() === 'CONFIRMADO' && new Date(s.date).toDateString() === checkDateStr);
    const hasEvent = events.some(e => participatingEvents.includes(e.id) && new Date(e.date).toDateString() === checkDateStr);
    return { event: hasEvent, shift: hasShift };
  };

  const handleParticipate = (eventId) => {
    if (!participatingEvents.includes(eventId)) {
      setParticipatingEvents([...participatingEvents, eventId]);
      setUser(prev => ({ ...prev, points: prev.points + 20 }));
      showNotification("Presença confirmada! Você ganhou +20 Zion Points! 🎉");
    }
  };

  const formatData = (dateString) => {
    const date = new Date(dateString);
    return isNaN(date) ? dateString : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  };

  const futureEvents = events.filter(e => new Date(e.date) >= new Date());
  // Só comunicados do tipo GERAL aparecem aqui (Início/Membros)
  const generalAnnouncement = announcements.filter(a => a.type === 'GERAL')[0] || null;

  return (
    <div className="space-y-6">
      
      {generalAnnouncement && (
        <div className="bg-gradient-to-r from-brand-secondary/20 to-brand-primary/20 border border-brand-primary/30 p-4 rounded-default shadow-sm mb-6">
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
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex justify-between items-center mb-5 relative z-10">
          <div>
            <h2 className="text-xl font-display font-bold">Meu Engajamento</h2>
            <p className="text-white/80 text-sm mt-1">Continue participando para subir de nível!</p>
          </div>
          <div className="bg-black/20 p-3 rounded-full backdrop-blur-md"><Award className="text-yellow-400 w-8 h-8" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-black/30 backdrop-blur-md p-4 rounded-default border border-white/10 hover:bg-black/40 transition-colors">
            <div className="text-white/60 text-[10px] uppercase font-bold tracking-widest mb-1">Zion Points</div>
            <div className="text-3xl font-display font-bold text-white transition-all duration-500">{user?.points || 0}</div>
          </div>
          <div className="bg-black/30 backdrop-blur-md p-4 rounded-default border border-white/10 hover:bg-black/40 transition-colors flex flex-col justify-between relative overflow-hidden group">
            <div className="relative z-10">
              <div className="text-white/60 text-[10px] uppercase font-bold tracking-widest mb-1">Plano Bíblico</div>
              <div className="text-3xl font-display font-bold text-white">{user?.bibleStreak || 0} <span className="text-sm font-sans font-normal opacity-70">dias</span></div>
            </div>
            <BookOpen className="text-white w-24 h-24 absolute -right-4 -bottom-4 opacity-10 transform -rotate-12 group-hover:scale-110 transition-transform duration-500" />
          </div>
        </div>
      </div>

      <div className="bg-surface-card p-4 rounded-default border border-white/5 shadow-level-2">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setCalendarDate(new Date(currentYear, currentMonth - 1, 1))} className="p-1 rounded-md text-text-muted hover:text-white hover:bg-white/5 transition-colors outline-none"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCalendarDate(new Date())} className="font-display font-bold text-sm text-text-primary capitalize flex items-center gap-1 hover:text-brand-primary transition-colors outline-none">
            <Calendar className="w-4 h-4 text-brand-primary"/> {monthNames[currentMonth]} {currentYear}
          </button>
          <button onClick={() => setCalendarDate(new Date(currentYear, currentMonth + 1, 1))} className="p-1 rounded-md text-text-muted hover:text-white hover:bg-white/5 transition-colors outline-none"><ChevronRight className="w-4 h-4" /></button>
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
              const isParticipating = participatingEvents.includes(ev.id);
              return (
                <div key={ev.id} className={`bg-surface-card p-4 rounded-default shadow-sm border ${isParticipating ? 'border-brand-primary/30' : 'border-white/5'} flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all duration-300`}>
                  <div>
                    <div className="font-bold text-text-primary">{ev.title}</div>
                    <div className="text-sm text-text-muted flex items-center gap-1 mt-1 capitalize"><Clock className="w-3 h-3 text-brand-primary"/> {formatData(ev.date)}</div>
                  </div>
                  {isParticipating ? (
                    <span className="flex items-center justify-center gap-1 text-brand-primary text-sm font-bold bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-default"><CheckCircle className="w-4 h-4"/> Confirmado</span>
                  ) : (
                    <button onClick={() => handleParticipate(ev.id)} className="bg-transparent text-brand-primary border border-brand-primary/30 px-5 py-2 rounded-default text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all outline-none">Participar</button>
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
          <button onClick={() => showNotification("Pedido de oração enviado à equipa pastoral.")} className="flex items-center gap-1.5 text-xs font-bold text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 px-3 py-1.5 rounded-full transition-colors outline-none">
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
    </div>
  );
};

export default MembrosModule;