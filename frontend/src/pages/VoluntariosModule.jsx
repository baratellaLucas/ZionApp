import React, { useState, useEffect } from 'react';
import {
  CalendarDays, Coffee, Smile, Music, Megaphone, Briefcase, Clock,
  CheckCircle, GraduationCap, Users, MessageSquare, ShieldCheck,
  Award, Gift, X, Save, BookOpen, Trash2, AlertTriangle
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';

// As áreas vêm do backend sem ícone/cor; aplicamos uma paleta visual por índice.
const AREA_STYLES = [
  { Icon: Coffee, color: 'text-amber-500',   bg: 'bg-amber-500/10' },
  { Icon: Smile,  color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { Icon: Music,  color: 'text-purple-500',  bg: 'bg-purple-500/10' },
  { Icon: Users,  color: 'text-blue-500',    bg: 'bg-blue-500/10' },
];
const DEFAULT_AREA_STYLE = { Icon: Briefcase, color: 'text-brand-primary', bg: 'bg-brand-primary/10' };

const MAX_AREAS_PER_PERSON = 2;

const VoluntariosModule = ({ user, setUser, showNotification }) => {
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
  const [isLoading,        setIsLoading]        = useState(true);

  // ─── fetch de áreas, participações, escalas e comunicados ─────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const query = user?.id ? `?userId=${user.id}` : '';
        const [resAreas, resMine, resShifts, resAnn] = await Promise.all([
          fetch(`${API_BASE}/api/areas`).catch(() => null),
          user?.id ? fetch(`${API_BASE}/api/areas/my-participations?userId=${user.id}`).catch(() => null) : null,
          fetch(`${API_BASE}/api/shifts${query}`).catch(() => null),
          fetch(`${API_BASE}/api/announcements?type=VOLUNTARIO`).catch(() => null),
        ]);
        if (resAreas && resAreas.ok) setAreas(await resAreas.json());
        if (resMine && resMine.ok) setMyAreas(await resMine.json());
        if (resShifts && resShifts.ok) setShifts(await resShifts.json());
        if (resAnn && resAnn.ok) setAnnouncements(await resAnn.json());
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  // Só comunicados do tipo VOLUNTARIO aparecem aqui
  const volAnnouncement = announcements.filter(a => a.type === 'VOLUNTARIO')[0] || null;

  // ─── derived ─────────────────────────────────────────────────────────────
  // Estilo (ícone/cor) de uma área pelo seu índice no catálogo; fallback padrão.
  const styleForAreaId = (areaId) => {
    const idx = areas.findIndex(a => a.id === areaId);
    return idx === -1 ? DEFAULT_AREA_STYLE : AREA_STYLES[idx % AREA_STYLES.length];
  };

  const activeAreaDetails = selectedAreaId ? areas.find(a => a.id === selectedAreaId) : null;
  const activeAreaStyle   = activeAreaDetails ? styleForAreaId(activeAreaDetails.id) : DEFAULT_AREA_STYLE;
  const AreaIcon          = activeAreaStyle.Icon;

  const activeAreaCount   = myAreas.filter(p => p.status === 'PENDENTE' || p.status === 'APROVADO').length;
  const reachedAreaLimit  = activeAreaCount >= MAX_AREAS_PER_PERSON;

  const futureShifts = shifts.filter(s => new Date(s.date) >= new Date());

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
      const res = await fetch(`http://localhost:3000/api/shifts/${shiftId}/confirm`, { method: 'PATCH' }).catch(() => null);
      if (res && res.ok) {
        setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'Confirmado' } : s));
        setUser(prev => ({ ...prev, points: prev.points + 50 }));
        showNotification('Escala confirmada! Você ganhou +50 Zion Points! 🎉');
      } else {
        // Modo offline: actualiza localmente mesmo sem resposta do servidor
        setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'Confirmado' } : s));
        setUser(prev => ({ ...prev, points: prev.points + 50 }));
        showNotification('Escala confirmada (Modo Offline)! +50 Zion Points! 🎉');
      }
    } catch (e) {
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'Confirmado' } : s));
      showNotification('Escala confirmada (Modo Offline)!');
    }
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
      const res = await fetch(`${API_BASE}/api/areas/${areaId}/request`, {
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

  // Cancelar/sair — persiste via DELETE /api/areas/:id/request
  const executeCancelArea = async () => {
    if (!areaToCancel) return;
    const participation = areaToCancel;
    setAreaToCancel(null);
    setMyAreas(prev => prev.filter(p => p.id !== participation.id));
    try {
      await fetch(`${API_BASE}/api/areas/${participation.areaId}/request`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user?.id })
      });
      showNotification('Solicitação cancelada.');
    } catch {
      showNotification('Solicitação cancelada (Offline).');
    }
  };

  const openAreaModal = (areaId) => {
    setSelectedAreaId(areaId);
    setModalTab('escalas');
  };

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
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
          <div className="grid gap-4 md:grid-cols-2">
            {areas.map(area => {
              const { Icon, color, bg } = styleForAreaId(area.id);
              const myParticipation = myAreas.find(m => m.areaId === area.id);
              const disableRequest  = reachedAreaLimit && !myParticipation;
              return (
                <div key={area.id} className="bg-surface-card p-5 rounded-default border border-white/5 shadow-level-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bg} ${color}`}><Icon className="w-5 h-5"/></div>
                      <h3 className="font-display font-bold text-lg text-text-primary">{area.name}</h3>
                    </div>
                    <p className="text-sm text-text-muted mb-4">{area.description}</p>
                  </div>

                  {myParticipation ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <button disabled className="w-full py-2.5 rounded-default text-sm font-semibold bg-surface-dark border border-white/5 text-text-muted/50 cursor-not-allowed flex justify-center items-center gap-2">
                        <CheckCircle className="w-4 h-4"/>
                        {myParticipation.status === 'APROVADO' ? 'Participando' : 'Solicitação Pendente'}
                      </button>
                      {/* FIX: chama requestCancelArea que abre o modal interno */}
                      <button
                        onClick={() => requestCancelArea(myParticipation)}
                        className="text-xs text-text-muted hover:text-red-400 underline decoration-white/10 hover:decoration-red-400/30 underline-offset-2 text-center transition-colors outline-none"
                      >
                        Cancelar solicitação
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestArea(area.id)}
                      disabled={disableRequest}
                      title={disableRequest ? `Limite de ${MAX_AREAS_PER_PERSON} áreas atingido` : undefined}
                      className="w-full mt-2 py-2.5 rounded-default text-sm font-semibold transition-all outline-none bg-surface-dark border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Solicitar Entrada
                    </button>
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

          {myAreas.length === 0 ? (
            <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Você ainda não faz parte de nenhuma área. Explore as opções!</div>
          ) : (
            <div className="space-y-3">
              {myAreas.map((myArea) => {
                const areaDetails = myArea.area || areas.find(a => a.id === myArea.areaId);
                if (!areaDetails) return null;
                const { Icon, color, bg } = styleForAreaId(myArea.areaId);
                const isApproved = myArea.status === 'APROVADO';
                return (
                  <div key={myArea.id} className={`bg-surface-card p-4 rounded-default border transition-all flex flex-col sm:flex-row justify-between items-center gap-4 shadow-level-2 ${isApproved ? 'border-brand-primary/30' : 'border-white/5'}`}>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${bg} ${color}`}><Icon className="w-6 h-6"/></div>
                      <div>
                        <h3 className="font-display font-bold text-lg text-text-primary">{areaDetails.name}</h3>
                        <div className="text-sm text-text-muted font-medium flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3.5 h-3.5"/> Posição: <span className="text-white/80">{myArea.role}</span>
                        </div>
                      </div>
                    </div>

                    {isApproved ? (
                      <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <button onClick={() => openAreaModal(areaDetails.id)} className="w-full sm:w-auto bg-surface-dark border border-brand-primary/30 text-brand-primary px-6 py-2.5 rounded-default text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all outline-none">
                          Acessar Área
                        </button>
                        <button onClick={() => requestCancelArea(myArea)} className="text-xs text-text-muted hover:text-red-400 underline decoration-white/10 hover:decoration-red-400/30 underline-offset-2 text-center outline-none transition-colors">
                          Sair da área
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <span className="flex items-center justify-center gap-1.5 text-amber-400 text-sm font-bold bg-amber-500/10 border border-amber-500/20 px-5 py-2.5 rounded-default">
                          <Clock className="w-4 h-4"/> Avaliação Pendente
                        </span>
                        <button onClick={() => requestCancelArea(myArea)} className="text-xs text-text-muted hover:text-red-400 underline decoration-white/10 hover:decoration-red-400/30 underline-offset-2 text-center outline-none transition-colors">
                          Cancelar solicitação
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

      {/* ── MODAL DA ÁREA ─────────────────────────────────────────────────── */}
      {selectedAreaId && activeAreaDetails && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedAreaId(null)}>
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
                <button onClick={() => setSelectedAreaId(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-text-muted hover:text-white transition-colors outline-none"><X className="w-5 h-5"/></button>
              </div>
              <div className="flex gap-4 mt-6 border-b border-white/10 overflow-x-auto no-scrollbar">
                {[
                  { id: 'escalas',      label: 'Escalas & Disp.' },
                  { id: 'treinamentos', label: 'Treinamentos' },
                  { id: 'equipe',       label: 'Equipe' },
                  { id: 'mural',        label: 'Mural' },
                ].map(t => (
                  <button key={t.id} onClick={() => setModalTab(t.id)} className={`pb-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none ${modalTab === t.id ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-text-muted hover:text-white'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conteúdo do modal */}
            <div className="p-6 overflow-y-auto">

              {/* TAB: ESCALAS & DISPONIBILIDADE */}
              {modalTab === 'escalas' && (
                <div className="space-y-8 animate-in fade-in">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-brand-primary"/> Próximos Turnos (Sua Escala)
                    </h4>
                    {isLoading ? (
                      <div className="flex justify-center py-5"><div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
                    ) : futureShifts.length === 0 ? (
                      <div className="text-center text-text-muted py-8 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Não há escalas agendadas para os próximos dias.</div>
                    ) : (
                      <div className="space-y-3">
                        {futureShifts.map(shift => (
                          <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-dark rounded-default border border-white/5 gap-4">
                            <div>
                              <div className="font-bold text-text-primary">{shift.department}</div>
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
                              <button onClick={() => handleConfirmShift(shift.id)} className="w-full sm:w-auto bg-brand-primary text-white px-6 py-2 rounded-default text-sm font-semibold hover:bg-brand-secondary active:scale-95 outline-none transition-all">
                                Confirmar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary flex items-center gap-2"><Clock className="w-4 h-4 text-brand-primary"/> Disponibilidade Semanal</h4>
                        <p className="text-xs text-text-muted mt-1">Informe em quais dias e períodos pode servir.</p>
                      </div>
                      <button onClick={() => showNotification('Disponibilidade salva com sucesso!')} className="text-sm bg-surface-card border border-white/10 text-white px-5 py-2 rounded-md hover:bg-brand-primary hover:border-brand-primary flex items-center gap-2 outline-none font-bold transition-colors w-full sm:w-auto justify-center"><Save className="w-4 h-4"/> Salvar</button>
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
                                      onClick={() => {
                                        const current = availability[dia] || { M: false, T: false, N: false };
                                        setAvailability({ ...availability, [dia]: { ...current, [periodo]: !isChecked } });
                                      }}
                                      className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-all outline-none ${isChecked ? 'bg-brand-primary border-brand-primary text-white shadow-[0_0_8px_rgba(0,184,169,0.5)]' : 'bg-surface-card border-white/20 text-transparent hover:border-brand-primary/50'}`}
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
              )}

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
                            onClick={() => { setTrainingProgress(100); setUser(prev => ({ ...prev, points: prev.points + 150 })); showNotification('Treinamento Concluído! Você ganhou +150 Zion Points! 🎯'); }}
                            className="text-xs font-bold bg-brand-primary text-white hover:bg-brand-secondary transition-colors px-4 py-1.5 rounded-md outline-none flex items-center gap-1"
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
              {modalTab === 'equipe' && (
                <div className="animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-surface-dark border border-white/5 p-3 rounded-md flex items-center gap-3 hover:border-white/10 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-brand-primary/20 text-brand-primary flex items-center justify-center font-bold text-sm shrink-0">L</div>
                      <div>
                        <div className="font-bold text-text-primary text-sm">Líder da Área</div>
                        <div className="text-[10px] text-brand-primary font-bold mt-0.5 uppercase">Líder de Área</div>
                      </div>
                    </div>
                    {myAreas.filter(p => p.areaId === selectedAreaId && p.status === 'APROVADO').map(p => (
                      <div key={p.id} className="bg-surface-dark border border-white/5 p-3 rounded-md flex items-center gap-3 hover:border-white/10 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center font-bold text-sm shrink-0">{user?.name?.charAt(0) || '?'}</div>
                        <div>
                          <div className="font-bold text-text-primary text-sm">{user?.name}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">{p.role}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: MURAL */}
              {modalTab === 'mural' && (
                <div className="text-center text-text-muted py-10 bg-surface-dark rounded-default border border-dashed border-white/10 animate-in fade-in">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                  <p className="text-sm font-medium">Mural da área em breve.</p>
                  <p className="text-xs mt-1 opacity-60">Usará a mesma lógica do Mural de Links.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMAÇÃO DE CANCELAMENTO DE ÁREA (sem window.confirm) */}
      {areaToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setAreaToCancel(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-amber-400"><div className="bg-amber-500/10 p-3 rounded-full"><AlertTriangle className="w-8 h-8"/></div></div>
            <h3 className="text-xl font-bold text-text-primary text-center mb-2">
              {areaToCancel.status === 'APROVADO' ? 'Sair da área?' : 'Cancelar Solicitação?'}
            </h3>
            <p className="text-text-muted text-center mb-6 text-sm">
              {areaToCancel.status === 'APROVADO'
                ? 'Você vai sair desta área. Para voltar a servir será necessário solicitar novamente.'
                : 'Tem certeza que deseja cancelar sua solicitação de entrada nesta área?'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAreaToCancel(null)} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none">Voltar</button>
              <button onClick={executeCancelArea} className="flex-1 px-4 py-2.5 rounded-default bg-red-500 hover:bg-red-600 text-white font-semibold transition-all outline-none">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoluntariosModule;