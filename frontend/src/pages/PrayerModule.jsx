import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { apiFetch } from '../api';
import Avatar from '../components/Avatar';

// Lista de pedidos de oração — usada tanto como aba própria (membro com acesso liberado)
// quanto dentro de Admin (equipe de intercessão, staff ou permissão por cargo).
const PrayerModule = ({ user, showNotification }) => {
  const [prayers, setPrayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPrayers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/prayer-requests').catch(() => null);
      if (res && res.ok) setPrayers(await res.json());
      else if (res) { const d = await res.json().catch(() => ({})); showNotification?.(d.error || 'Sem acesso aos pedidos de oração.'); }
    } catch { showNotification?.('Falha de rede.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadPrayers(); }, [user?.id]);

  const togglePrayer = async (id) => {
    try {
      const res = await apiFetch(`/api/prayer-requests/${id}`, { method: 'PATCH' });
      if (res.ok) { const p = await res.json(); setPrayers(prev => prev.map(x => x.id === id ? { ...x, status: p.status } : x)); }
      else showNotification?.('Falha ao atualizar.');
    } catch { showNotification?.('Falha de rede.'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-text-primary flex items-center gap-2"><Heart className="w-5 h-5 text-pink-400"/> Pedidos de Oração</h2>
        <p className="text-sm text-text-muted mt-1">Ore por cada pedido da comunidade e marque como orado.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : prayers.length === 0 ? (
        <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Nenhum pedido de oração no momento. 🙏</div>
      ) : (
        <div className="space-y-3">
          {prayers.map(p => (
            <div key={p.id} className={`bg-surface-card border rounded-default p-4 ${p.status === 'ORADO' ? 'border-emerald-500/20' : 'border-white/5'}`}>
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-white"><Avatar name={p.user?.name} src={p.user?.profileImage} size={24}/> {p.user?.name || 'Membro'}</div>
                  <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{p.content}</p>
                  <div className="text-[11px] text-text-muted mt-2">{new Date(p.createdAt).toLocaleString('pt-BR')}</div>
                </div>
                <button onClick={() => togglePrayer(p.id)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${p.status === 'ORADO' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-pink-400 bg-pink-500/10 border-pink-500/30'}`}>
                  {p.status === 'ORADO' ? '🙏 Orado' : 'Marcar como orado'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PrayerModule;
