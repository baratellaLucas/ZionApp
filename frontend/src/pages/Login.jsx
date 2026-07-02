import React, { useState } from 'react';
import { LogIn, Loader2, AlertTriangle, UserPlus, KeyRound, CheckCircle } from 'lucide-react';
import { apiFetch, setToken } from '../api';
import zionLogo from '../assets/zionLogo.png';

const MODES = {
  login:    { title: 'Entre para continuar',      submit: 'Entrar',        icon: LogIn },
  register: { title: 'Crie sua conta',            submit: 'Criar conta',   icon: UserPlus },
  forgot:   { title: 'Redefinir senha',           submit: 'Salvar nova senha', icon: KeyRound },
};

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); setPassword(''); if (m !== 'register') setName(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) { setToken(data.token); onLogin(data.user); }
        else setError(data.error || 'Não foi possível entrar.');
      } else if (mode === 'register') {
        const res = await apiFetch('/api/auth/register', { method: 'POST', body: { name, email, password } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) { setToken(data.token); onLogin(data.user); }
        else setError(data.error || 'Não foi possível criar a conta.');
      } else { // forgot
        const res = await apiFetch('/api/auth/reset-password', { method: 'POST', body: { email, password } });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { setInfo('Senha atualizada! Você já pode entrar.'); setMode('login'); setPassword(''); }
        else setError(data.error || 'Não foi possível redefinir a senha.');
      }
    } catch {
      setError('Servidor indisponível. Verifique se o backend está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const cfg = MODES[mode];
  const SubmitIcon = cfg.icon;

  return (
    <div className="min-h-screen bg-surface-dark text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={zionLogo} alt="Zion" className="h-16 w-16 rounded-2xl object-contain mb-3" />
          <span className="font-display font-bold text-2xl">Zion<span className="font-light text-brand-primary">App</span></span>
          <p className="text-sm text-text-muted mt-1">{cfg.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-card border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          {info && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-md px-3 py-2">
              <CheckCircle className="w-4 h-4 shrink-0" /> {info}
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="text-xs text-text-muted mb-1 block">Nome</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary" />
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-1 block">E-mail</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@zion.com" className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary" />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">{mode === 'forgot' ? 'Nova senha' : 'Senha'}</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" className="w-full bg-surface-dark border border-white/10 rounded-md px-4 py-2.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-brand-primary text-white py-2.5 rounded-md font-bold hover:bg-brand-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SubmitIcon className="w-4 h-4" />}
            {loading ? 'Aguarde…' : cfg.submit}
          </button>

          {/* Links de navegação entre modos */}
          <div className="pt-2 text-center text-sm">
            {mode === 'login' && (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => switchMode('register')} className="text-brand-primary font-semibold hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Criar uma conta</button>
                <button type="button" onClick={() => switchMode('forgot')} className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Esqueci minha senha</button>
              </div>
            )}
            {mode !== 'login' && (
              <button type="button" onClick={() => switchMode('login')} className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">← Voltar para o login</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
