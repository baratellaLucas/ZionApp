import React, { useState, useEffect, useRef } from 'react';
import { Home, Users, Briefcase, ShieldCheck, Bell, Award, User, Check, Camera, AlertTriangle, X, LogOut, Loader2, Gift, Flame, BookOpen, Trophy, Calendar, GraduationCap, Bug, Lightbulb, Send, Heart } from 'lucide-react';

import MembrosModule from './pages/MembrosModule';
import LinksModule from './pages/LinksModule';
import VoluntariosModule from './pages/VoluntariosModule';
import AdminModule from './pages/AdminModule';
import RewardsModule from './pages/RewardsModule';
import PrayerModule from './pages/PrayerModule';
import Login from './pages/Login';
import Avatar from './components/Avatar';
import { apiFetch, API_URL, getToken, setToken, clearToken, setUnauthorizedHandler, getStoredOriginalToken, storeOriginalToken } from './api';
import { compressImage, fileToDataUrl } from './utils/image';
import zionLogo from './assets/zionLogo.png';

// "Staff" com acesso ao painel administrativo: Admin e Pastor
const isStaffRole = (r) => r === 'ADMIN' || r === 'PASTOR';

export default function App() {
  const [activeTab, setActiveTab] = useState('membros');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const [originalUser, setOriginalUser] = useState(null);
  const [originalToken, setOriginalToken] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  // Feedback (rodapé): 'BUG' | 'SUGESTAO' | null
  const [feedbackType, setFeedbackType] = useState(null);
  const [fbTitle, setFbTitle] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const [fbSending, setFbSending] = useState(false);
  const [profileStats, setProfileStats] = useState(null);
  const [navIntent, setNavIntent] = useState(null); // ação a executar no módulo de destino (ex: 'reading', 'groups', 'escala')
  const [canViewPrayers, setCanViewPrayers] = useState(false); // acesso liberado (individual ou por cargo) aos pedidos de oração

  const [editName, setEditName] = useState('');
  const [editImage, setEditImage] = useState(null);

  const showNotificationMsg = (message) => {
    setNotification(message); setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  // Logout: limpa token e estado de sessão
  const handleLogout = () => {
    clearToken();
    storeOriginalToken(null);
    setUser(null);
    setOriginalUser(null);
    setOriginalToken(null);
    setActiveTab('membros');
  };

  // Em 401 (sessão expirada), desloga automaticamente
  useEffect(() => { setUnauthorizedHandler(() => handleLogout()); }, []);

  // Restaura a sessão a partir do token salvo
  useEffect(() => {
    const restore = async () => {
      const token = getToken();
      if (!token) { setAuthLoading(false); return; }
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          setUser(await res.json());
          // Se havia um Modo de Teste em andamento, restaura o banner buscando o usuário original (admin)
          const origToken = getStoredOriginalToken();
          if (origToken && origToken !== token) {
            const resOrig = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${origToken}` } }).catch(() => null);
            if (resOrig && resOrig.ok) {
              setOriginalUser(await resOrig.json());
              setOriginalToken(origToken);
            } else {
              storeOriginalToken(null); // token original expirado/inválido: encerra o modo de teste
            }
          }
        } else clearToken();
      } catch { /* servidor offline: mantém deslogado */ }
      finally { setAuthLoading(false); }
    };
    restore();
  }, []);

  // Acesso a Pedidos de Oração (individual ou por cargo) — define se a aba "Oração" aparece
  useEffect(() => {
    if (!user?.id) { setCanViewPrayers(false); return; }
    apiFetch('/api/prayer-requests/access')
      .then(res => res.ok ? res.json() : { canView: false })
      .then(data => setCanViewPrayers(!!data.canView))
      .catch(() => setCanViewPrayers(false));
  }, [user?.id]);

  // Check-in por QR (deep link): ?checkin=<eventId>&code=<code>
  // Vai para o Início e delega o check-in ao MembrosModule (que confirma presença e atualiza card + calendário).
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('checkin');
    const code = params.get('code');
    if (!eventId || !code) return;
    // limpa a URL para não repetir o check-in num reload
    const url = new URL(window.location.href);
    url.searchParams.delete('checkin'); url.searchParams.delete('code');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    setActiveTab('membros');
    setNavIntent(`checkin:${eventId}:${code}`);
  }, [user?.id]);

  // Validação de voucher por QR (deep link): ?voucher=<code> → atendente valida e consome na hora
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('voucher');
    if (!code) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('voucher');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    // Quem pode validar é decidido pelo servidor (matriz de permissões em Admin > Cargos)
    (async () => {
      try {
        const res = await apiFetch('/api/redemptions/consume', { method: 'POST', body: { code } });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const r = data.redemption;
          if (data.already) showNotificationMsg(`Voucher já utilizado: ${r?.productName || code}.`);
          else showNotificationMsg(`✅ Voucher validado: ${r?.productName || code}${r?.user?.name ? ` — ${r.user.name}` : ''}.`);
        } else {
          showNotificationMsg(data.error || 'Voucher inválido.');
        }
      } catch { showNotificationMsg('Falha de rede ao validar o voucher.'); }
    })();
  }, [user?.id]);

  // Pop-up de boas-vindas: mostra uma vez para quem ainda não foi recepcionado
  useEffect(() => {
    if (user && user.welcomed === false) setShowWelcome(true);
  }, [user?.id, user?.welcomed]);

  const handleCloseWelcome = async () => {
    setShowWelcome(false);
    setUser(prev => (prev ? { ...prev, welcomed: true } : prev));
    try { await apiFetch('/api/users/me/welcome', { method: 'POST' }); } catch { /* silencioso */ }
  };

  // Feedback do rodapé (bug ou sugestão)
  const openFeedback = (type) => { setFbTitle(''); setFbDesc(''); setFeedbackType(type); };
  const handleSendFeedback = async (e) => {
    e.preventDefault();
    if (!fbTitle.trim() || !fbDesc.trim()) return;
    setFbSending(true);
    try {
      const res = await apiFetch('/api/bug-reports', { method: 'POST', body: { title: fbTitle.trim(), description: fbDesc.trim(), type: feedbackType } });
      if (res.ok) {
        setFeedbackType(null);
        showNotificationMsg(feedbackType === 'SUGESTAO' ? 'Sugestão enviada. Obrigado por contribuir! 💡' : 'Reporte enviado à equipe. Obrigado! 🐛');
      } else { const d = await res.json().catch(() => ({})); showNotificationMsg(d.error || 'Não foi possível enviar.'); }
    } catch { showNotificationMsg('Falha de rede ao enviar.'); }
    finally { setFbSending(false); }
  };

  // Notificações: carrega e faz polling leve enquanto logado
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/notifications');
        if (res.ok && active) { const d = await res.json(); setNotifications(d.items || []); setUnreadCount(d.unread || 0); }
      } catch { /* silencioso */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { active = false; clearInterval(t); };
  }, [user?.id]);

  // Fecha o dropdown de notificações ao clicar fora dele
  useEffect(() => {
    if (!showNotifications) return;
    const onDown = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showNotifications]);

  const toggleNotifications = async () => {
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    if (willOpen && unreadCount > 0) {
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      try { await apiFetch('/api/notifications/read-all', { method: 'PATCH' }); } catch { /* silencioso */ }
    }
  };

  // Clique numa notificação: marca como lida e navega para a página/ação de destino
  const handleNotificationClick = async (n) => {
    setShowNotifications(false);
    // marca como lida (local + backend)
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
      try { await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' }); } catch { /* silencioso */ }
    }
    if (!n.route) return;
    const [tab, action] = n.route.split(':');
    // respeita restrição de aba (ex.: admin) — só navega se a aba estiver visível
    if (!tabs.some(t => t.id === tab && !(t.hideForMember && !isStaffRole(user.role)))) return;
    setActiveTab(tab);
    setNavIntent(action || null);
  };

  const notifTimeAgo = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  // Modo de Teste: admin gera um token de impersonação do usuário-alvo
  const handleSimulateUser = async (simulatedUser) => {
    try {
      const adminToken = getToken();
      const res = await apiFetch(`/api/auth/impersonate/${simulatedUser.id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setOriginalUser(prev => prev || user);
        setOriginalToken(prev => prev || adminToken);
        storeOriginalToken(adminToken); // persiste p/ sobreviver a F5
        setToken(data.token);
        setUser(data.user);
        setActiveTab('membros');
      } else {
        showNotificationMsg(data.error || 'Não foi possível iniciar o Modo de Teste.');
      }
    } catch {
      showNotificationMsg('Falha de rede ao iniciar o Modo de Teste.');
    }
  };

  const handleExitSimulation = () => {
    if (originalToken) setToken(originalToken);
    if (originalUser) {
      setUser(originalUser);
      setActiveTab('admin');
    }
    storeOriginalToken(null);
    setOriginalUser(null);
    setOriginalToken(null);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { setEditImage(await compressImage(file, 400, 0.8)); } // avatar: 400px basta
    catch { setEditImage(await fileToDataUrl(file).catch(() => null)); }
  };

  const openProfile = async () => {
    setEditName(user.name);
    setEditImage(user.profileImage);
    setShowProfileModal(true);
    setProfileStats(null);
    try {
      const res = await apiFetch('/api/me/stats');
      if (res.ok) setProfileStats(await res.json());
    } catch { /* silencioso */ }
  };

  const handleSaveProfile = async () => {
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT', body: { name: editName, profileImage: editImage }
      });
      if (res.ok) {
        const updated = await res.json();
        setUser(prev => ({ ...prev, name: updated.name, profileImage: updated.profileImage }));
        showNotificationMsg("Perfil atualizado!");
        setShowProfileModal(false);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotificationMsg(data.error || "Não foi possível atualizar o perfil.");
      }
    } catch {
      showNotificationMsg("Falha de rede ao atualizar o perfil.");
    }
  };

  // Enquanto verifica o token salvo
  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  // Sem sessão → tela de login
  if (!user) {
    return <Login onLogin={(u) => { setUser(u); setActiveTab('membros'); }} />;
  }

  const tabs = [
    { id: 'membros', label: 'Início', icon: Home, component: MembrosModule },
    { id: 'links', label: 'Links', icon: Users, component: LinksModule },
    { id: 'voluntarios', label: 'Voluntários', icon: Briefcase, component: VoluntariosModule },
    { id: 'loja', label: 'Loja', icon: Gift, component: RewardsModule },
    // Aba própria só para quem não é staff mas recebeu acesso individual/por cargo (staff usa Admin > Oração)
    { id: 'oracao', label: 'Oração', icon: Heart, component: PrayerModule, requiresPrayerAccess: true },
    { id: 'admin', label: 'Admin', icon: ShieldCheck, component: AdminModule, hideForMember: true },
  ];

  const visibleTabs = tabs.filter(tab => {
    if (tab.hideForMember && !isStaffRole(user.role)) return false;
    if (tab.requiresPrayerAccess && (isStaffRole(user.role) || !canViewPrayers)) return false;
    return true;
  });
  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || MembrosModule;

  return (
    <div className="min-h-screen font-sans bg-surface-dark pb-10 flex flex-col text-white">
      {notification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] bg-brand-primary px-6 py-3 rounded-full shadow-lg flex items-center gap-2 font-bold">
          <Award className="w-5 h-5 text-yellow-300" /> {notification}
        </div>
      )}
      
      {originalUser && (
        <div className="bg-amber-500 text-black px-4 py-2 flex justify-between items-center font-bold z-[60] text-sm shadow-md">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> MODO DE TESTE: {user.name} ({user.role})</span>
          <button onClick={handleExitSimulation} className="bg-black text-white px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Sair</button>
        </div>
      )}

      <header className="bg-surface-card sm:sticky sm:top-0 z-50 border-b border-white/5 h-16 flex items-center px-4">
        <div className="max-w-4xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={zionLogo} alt="Zion" className="h-9 w-9 rounded-lg object-contain" />
            <span className="font-display font-bold text-xl hidden sm:block">Zion<span className="font-light text-brand-primary">App</span></span>
          </div>
          
          <div className="flex items-center gap-4 relative">
            <div className="relative" ref={notifRef}>
            <button onClick={toggleNotifications} aria-label="Notificações" className="relative p-2 text-text-muted hover:bg-white/5 hover:text-white rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-brand-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-surface-card">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed inset-x-2 top-[4.75rem] w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:mt-2 sm:w-80 bg-surface-card border border-white/10 rounded-default shadow-2xl z-50 animate-in fade-in overflow-hidden">
                <h4 className="font-bold text-white text-sm px-4 py-3 border-b border-white/5">Notificações</h4>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-text-muted text-center py-8">Nenhuma notificação.</p>
                  ) : (
                    notifications.map(n => (
                      <button key={n.id} onClick={() => handleNotificationClick(n)} className={`w-full text-left flex gap-3 items-start px-4 py-3 border-b border-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${!n.read ? 'bg-brand-primary/5' : ''} ${n.route ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}>
                        <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${n.read ? 'bg-white/15' : 'bg-brand-primary'}`}></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white flex justify-between gap-2"><span className="truncate">{n.title}</span><span className="text-[10px] text-text-muted font-normal shrink-0">{notifTimeAgo(n.createdAt)}</span></p>
                          {n.body && <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{n.body}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            </div>

            <button onClick={openProfile} className="flex items-center gap-2 pl-4 border-l border-white/10 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 group text-left">
              <div className="hidden sm:block group-hover:opacity-80">
                <div className="text-sm font-bold">{user.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-brand-primary font-semibold">{user.role}</div>
              </div>
              <Avatar name={user.name} src={user.profileImage} size={40} />
            </button>

            {!originalUser && (
              <button onClick={handleLogout} title="Sair da conta" className="p-2 text-text-muted hover:bg-white/5 hover:text-red-400 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="w-full bg-surface-card border-b border-white/5 mb-6 sm:sticky sm:top-16 z-40 h-14 flex items-center shadow-sm">
        <div className="max-w-4xl mx-auto flex w-full h-full">
          {visibleTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex-1 flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${activeTab === tab.id ? 'text-brand-primary bg-brand-primary/5' : 'text-text-muted hover:text-white hover:bg-white/5'}`}>
              <tab.icon className="w-5 h-5" />
              <span className="hidden sm:block text-sm font-bold">{tab.label}</span>
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-primary"></div>}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 animate-in fade-in duration-300">
        <ActiveComponent user={user} setUser={setUser} showNotification={showNotificationMsg} handleSimulateUser={handleSimulateUser} intent={navIntent} onIntentHandled={() => setNavIntent(null)} />
      </main>

      {/* Rodapé */}
      <footer className="w-full border-t border-white/5 bg-surface-card mt-10">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <img src={zionLogo} alt="Zion" className="h-6 w-6 rounded object-contain" />
            <span className="font-display font-bold text-white">Zion<span className="font-light text-brand-primary">App</span></span>
            <span className="text-xs">• Feito com propósito 💚</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openFeedback('BUG')} className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-white bg-surface-dark border border-white/10 hover:border-white/25 px-3 py-2 rounded-default transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              <Bug className="w-3.5 h-3.5 text-brand-primary" /> Reportar Bug
            </button>
            <button onClick={() => openFeedback('SUGESTAO')} className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-white bg-surface-dark border border-white/10 hover:border-white/25 px-3 py-2 rounded-default transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-400" /> Enviar Sugestão
            </button>
          </div>
        </div>
      </footer>

      {/* Modal: feedback (bug/sugestão) */}
      {feedbackType && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60" onClick={() => !fbSending && setFeedbackType(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                {feedbackType === 'SUGESTAO' ? <><Lightbulb className="w-5 h-5 text-yellow-400"/> Enviar Sugestão</> : <><Bug className="w-5 h-5 text-brand-primary"/> Reportar Bug</>}
              </h3>
              <button onClick={() => setFeedbackType(null)} aria-label="Fechar" className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-text-muted mb-4">{feedbackType === 'SUGESTAO' ? 'Tem uma ideia para melhorar o app? Conta pra gente!' : 'Achou algo com erro? Descreva o que aconteceu e onde.'}</p>
            <form onSubmit={handleSendFeedback} className="space-y-3">
              <input type="text" value={fbTitle} onChange={e => setFbTitle(e.target.value)} maxLength={120} placeholder="Título" className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary" />
              <textarea value={fbDesc} onChange={e => setFbDesc(e.target.value)} rows="4" maxLength={4000} placeholder={feedbackType === 'SUGESTAO' ? 'Descreva sua sugestão...' : 'Descreva o problema...'} className="w-full bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary resize-none" />
              <button type="submit" disabled={!fbTitle.trim() || !fbDesc.trim() || fbSending} className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-2.5 rounded-default font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                {fbSending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowProfileModal(false)}>
          <div className="bg-surface-card p-6 rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-brand-primary"/> Meu Perfil</h3>
              <button onClick={() => setShowProfileModal(false)} aria-label="Fechar" className="text-text-muted hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex flex-col items-center mb-6">
              <div className="relative w-24 h-24 rounded-full border-4 border-surface-dark mb-3 bg-surface-dark flex items-center justify-center overflow-hidden">
                {editImage ? <img src={editImage} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-brand-primary">{editName.charAt(0) || 'U'}</span>}
                <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div className="font-bold text-white">{user.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-brand-primary font-semibold">{user.role}</div>
              <div className="flex items-center gap-1 text-sm font-bold text-yellow-300 mt-1"><Award className="w-4 h-4"/> {user.points || 0} Zion Points</div>
            </div>

            {/* Conquistas */}
            {profileStats && (() => {
              const badges = [
                { icon: Flame, label: 'Leitor', earned: profileStats.readingCount >= 10, hint: '10 leituras' },
                { icon: Flame, label: 'Leitor Fiel', earned: profileStats.readingCount >= 30, hint: '30 leituras' },
                { icon: Trophy, label: 'Maratonista', earned: profileStats.readingCount >= 60, hint: '60 leituras' },
                { icon: BookOpen, label: 'Servo', earned: profileStats.shiftsConfirmed >= 1, hint: '1 escala' },
                { icon: Calendar, label: 'Presente', earned: profileStats.eventsParticipated >= 1, hint: '1 evento' },
                { icon: GraduationCap, label: 'Treinado', earned: profileStats.trainingsDone >= 1, hint: '1 treino' },
              ];
              return (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Conquistas</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {badges.map(b => (
                      <div key={b.label} title={b.earned ? 'Conquistado!' : `Meta: ${b.hint}`} className={`flex flex-col items-center gap-1 p-3 rounded-default border text-center ${b.earned ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-surface-dark border-white/5 opacity-40'}`}>
                        <b.icon className={`w-6 h-6 ${b.earned ? 'text-brand-primary' : 'text-text-muted'}`} />
                        <span className="text-[10px] font-bold text-white leading-tight">{b.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                    {[
                      { n: profileStats.readingCount, l: 'Leituras' },
                      { n: profileStats.shiftsConfirmed, l: 'Escalas' },
                      { n: profileStats.eventsParticipated, l: 'Eventos' },
                      { n: profileStats.groups, l: 'Grupos' },
                    ].map(s => (
                      <div key={s.l} className="bg-surface-dark border border-white/5 rounded-default py-2">
                        <div className="text-lg font-display font-bold text-white">{s.n}</div>
                        <div className="text-[9px] uppercase tracking-wide text-text-muted">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">Editar perfil</div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Nome de Apresentação</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">E-mail (Apenas leitura)</label>
                <input type="text" value={user.email} disabled className="w-full bg-surface-dark/50 border border-white/5 rounded-md px-4 py-2 text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 cursor-not-allowed" />
              </div>
              <button onClick={handleSaveProfile} className="w-full bg-brand-primary text-white py-2.5 rounded-md font-bold hover:bg-brand-secondary transition-colors mt-2 flex justify-center gap-2">
                <Check className="w-4 h-4"/> Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de boas-vindas (primeiro acesso) */}
      {showWelcome && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70" onClick={handleCloseWelcome}>
          <div className="relative bg-surface-card border border-white/10 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseWelcome} aria-label="Fechar" className="absolute top-3 right-3 z-10 text-white/80 hover:text-white bg-black/20 rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-white/60"><X className="w-5 h-5"/></button>
            <div className="bg-gradient-to-br from-brand-secondary to-brand-primary p-6 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-black/20 flex items-center justify-center mb-3"><Award className="w-9 h-9 text-yellow-300" /></div>
              <h3 className="text-2xl font-display font-bold text-white">Bem-vindo(a), {user.name?.split(' ')[0]}! 🎉</h3>
              <p className="text-white/85 text-sm mt-1">Que bom ter você na comunidade Zion.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-default px-4 py-3">
                <Award className="w-5 h-5 text-yellow-400 shrink-0" />
                <p className="text-sm text-yellow-200">Você começa com <span className="font-bold">100 Zion Points</span> de boas-vindas!</p>
              </div>
              <div className="space-y-2 text-sm text-text-secondary">
                <div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-orange-400 shrink-0" /> Siga o <span className="font-semibold text-white">Plano Bíblico</span> e acumule pontos lendo a cada dia.</div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-brand-primary shrink-0" /> Entre em um <span className="font-semibold text-white">Link</span> e conecte-se em pequenos grupos.</div>
                <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-brand-primary shrink-0" /> Sirva como <span className="font-semibold text-white">Voluntário</span> nas áreas da igreja.</div>
                <div className="flex items-center gap-2"><Gift className="w-4 h-4 text-brand-primary shrink-0" /> Troque seus pontos por prêmios na <span className="font-semibold text-white">Loja</span>.</div>
              </div>
              <button onClick={handleCloseWelcome} className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-default font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 flex items-center justify-center gap-2">
                <Flame className="w-4 h-4" /> Começar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}