import React, { useState, useEffect } from 'react';
import { Home, Users, Briefcase, ShieldCheck, Bell, Award, User, Check, Camera, AlertTriangle, X } from 'lucide-react';

import MembrosModule from './pages/MembrosModule';
import LinksModule from './pages/LinksModule';
import VoluntariosModule from './pages/VoluntariosModule';
import AdminModule from './pages/AdminModule';

const MOCK_LOGGED_USER_EMAIL = "admin@zion.com";

const INITIAL_USER = {
  id: "mock-user-id",
  name: "Admin Zion",
  campus: "Zion Ribeirão Preto",
  role: "ADMIN",
  points: 1250,
  bibleStreak: 14,
  profileImage: null,
  email: MOCK_LOGGED_USER_EMAIL
};

export default function App() {
  const [activeTab, setActiveTab] = useState('membros'); 
  const [user, setUser] = useState(INITIAL_USER);
  const [notification, setNotification] = useState(null);
  
  const [originalUser, setOriginalUser] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editImage, setEditImage] = useState(null);

  const showNotificationMsg = (message) => {
    setNotification(message); setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  useEffect(() => {
    const fetchLoggedUser = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/users').catch(() => null);
        if (res && res.ok) {
          const allUsers = await res.json();
          const me = allUsers.find(u => u.email === MOCK_LOGGED_USER_EMAIL);
          if (me) setUser(prev => ({ ...prev, ...me }));
        }
      } catch (error) {}
    };
    fetchLoggedUser();
  }, []);

  const handleSimulateUser = (simulatedUser) => {
    if (!originalUser) setOriginalUser(user);
    setUser(simulatedUser);
    setActiveTab('membros');
  };

  const handleExitSimulation = () => {
    if (originalUser) {
      setUser(originalUser);
      setOriginalUser(null);
      setActiveTab('admin');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const openProfile = () => {
    setEditName(user.name);
    setEditImage(user.profileImage);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/users/${user.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, profileImage: editImage })
      });
      if (res.ok) {
        const updated = await res.json();
        setUser(prev => ({ ...prev, name: updated.name, profileImage: updated.profileImage }));
        showNotificationMsg("Perfil atualizado!");
      } else throw new Error();
    } catch (e) {
      setUser(prev => ({ ...prev, name: editName, profileImage: editImage }));
      showNotificationMsg("Perfil atualizado (Offline)!");
    }
    setShowProfileModal(false);
  };

  const tabs = [
    { id: 'membros', label: 'Início', icon: Home, component: MembrosModule },
    { id: 'links', label: 'Links', icon: Users, component: LinksModule },
    { id: 'voluntarios', label: 'Voluntários', icon: Briefcase, component: VoluntariosModule },
    { id: 'admin', label: 'Admin', icon: ShieldCheck, component: AdminModule, hideForMember: true },
  ];

  const visibleTabs = tabs.filter(tab => !(tab.hideForMember && user.role !== 'ADMIN'));
  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || MembrosModule;

  return (
    <div className="min-h-screen font-sans bg-surface-dark pb-10 flex flex-col text-white">
      {notification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-brand-primary px-6 py-3 rounded-full shadow-lg flex items-center gap-2 font-bold">
          <Award className="w-5 h-5 text-yellow-300" /> {notification}
        </div>
      )}
      
      {originalUser && (
        <div className="bg-amber-500 text-black px-4 py-2 flex justify-between items-center font-bold z-[60] text-sm shadow-md">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> MODO DE TESTE: {user.name} ({user.role})</span>
          <button onClick={handleExitSimulation} className="bg-black text-white px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Sair</button>
        </div>
      )}

      <header className="bg-surface-card/90 sticky top-0 z-50 border-b border-white/5 h-16 flex items-center px-4">
        <div className="max-w-4xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-brand-primary rounded-lg flex items-center justify-center font-display font-bold text-white text-lg">Z</div>
            <span className="font-display font-bold text-xl hidden sm:block">Zion<span className="font-light text-brand-primary">App</span></span>
          </div>
          
          <div className="flex items-center gap-4 relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-text-muted hover:bg-white/5 hover:text-white rounded-full transition-colors outline-none">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand-primary border-2 border-surface-card rounded-full animate-pulse"></span>
            </button>

            {showNotifications && (
              <div className="absolute top-12 right-0 mt-2 w-72 bg-surface-card border border-white/10 rounded-default shadow-2xl p-4 z-50 animate-in fade-in">
                <h4 className="font-bold text-white text-sm mb-3 border-b border-white/5 pb-2">Notificações</h4>
                <div className="space-y-3">
                  <div className="flex gap-3 items-start"><div className="w-2 h-2 mt-1.5 rounded-full bg-brand-primary shrink-0"></div><div><p className="text-sm">Lembrete de Turno</p><p className="text-xs text-text-muted">Seu turno começa em 24h.</p></div></div>
                </div>
              </div>
            )}

            <button onClick={openProfile} className="flex items-center gap-2 pl-4 border-l border-white/10 outline-none group text-left">
              <div className="hidden sm:block group-hover:opacity-80">
                <div className="text-sm font-bold">{user.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-brand-primary font-semibold">{user.role}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-surface-dark border border-white/10 flex items-center justify-center font-bold text-brand-primary overflow-hidden">
                {user.profileImage ? <img src={user.profileImage} alt="Perfil" className="w-full h-full object-cover" /> : user.name.charAt(0)}
              </div>
            </button>
          </div>
        </div>
      </header>

      <nav className="w-full bg-surface-card border-b border-white/5 mb-6 sticky top-16 z-40 h-14 flex items-center shadow-sm">
        <div className="max-w-4xl mx-auto flex w-full h-full">
          {visibleTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex-1 flex items-center justify-center gap-2 transition-colors outline-none ${activeTab === tab.id ? 'text-brand-primary bg-brand-primary/5' : 'text-text-muted hover:text-white hover:bg-white/5'}`}>
              <tab.icon className="w-5 h-5" />
              <span className="hidden sm:block text-sm font-bold">{tab.label}</span>
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-primary"></div>}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 animate-in fade-in duration-300">
        <ActiveComponent user={user} setUser={setUser} showNotification={showNotificationMsg} handleSimulateUser={handleSimulateUser} />
      </main>

      {showProfileModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowProfileModal(false)}>
          <div className="bg-surface-card p-6 rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-brand-primary"/> Meu Perfil</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-text-muted hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-24 h-24 rounded-full border-4 border-surface-dark mb-4 bg-surface-dark flex items-center justify-center overflow-hidden">
                {editImage ? <img src={editImage} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-brand-primary">{editName.charAt(0) || 'U'}</span>}
                <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <p className="text-xs text-text-muted">Clique na imagem para alterar</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Nome de Apresentação</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2 text-white outline-none focus:border-brand-primary" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">E-mail (Apenas leitura)</label>
                <input type="text" value={user.email} disabled className="w-full bg-surface-dark/50 border border-white/5 rounded-md px-4 py-2 text-text-muted outline-none cursor-not-allowed" />
              </div>
              <button onClick={handleSaveProfile} className="w-full bg-brand-primary text-white py-2.5 rounded-md font-bold hover:bg-brand-secondary transition-colors mt-2 flex justify-center gap-2">
                <Check className="w-4 h-4"/> Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}