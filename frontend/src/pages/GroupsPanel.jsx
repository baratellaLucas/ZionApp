import React, { useState, useEffect } from 'react';
import { Users, Trophy, Plus, X, ArrowLeft, UserPlus, Trash2, LogOut, Loader2, Flame, Crown, MessageSquare, Send } from 'lucide-react';
import { apiFetch } from '../api';
import Avatar from '../components/Avatar';

// Painel de Grupos de Leitura (estilo "gym rats"): criar, adicionar membros e ranking por dias lidos.
export default function GroupsPanel({ user, showNotification, onClose }) {
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selected, setSelected] = useState(null); // detalhe do grupo com ranking
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [reactPickerFor, setReactPickerFor] = useState(null);
  const REACTION_EMOJIS = ['🔥', '❤️', '🙏', '👏', '😂', '🙌'];

  const loadGroups = async () => {
    setLoading(true);
    try {
      const [resG, resU, resI] = await Promise.all([
        apiFetch('/api/groups').catch(() => null),
        apiFetch('/api/users').catch(() => null),
        apiFetch('/api/groups/invites').catch(() => null),
      ]);
      if (resG && resG.ok) setGroups(await resG.json());
      if (resU && resU.ok) setAllUsers(await resU.json());
      if (resI && resI.ok) setInvites(await resI.json());
    } catch { /* offline */ } finally { setLoading(false); }
  };

  const handleAcceptInvite = async (groupId) => {
    try {
      const res = await apiFetch(`/api/groups/${groupId}/accept`, { method: 'POST' });
      if (res.ok) { showNotification('Você entrou no grupo! 🔥'); loadGroups(); }
      else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Falha ao aceitar.'); }
    } catch { showNotification('Falha de rede.'); }
  };

  const handleDeclineInvite = async (groupId) => {
    try {
      await apiFetch(`/api/groups/${groupId}/decline`, { method: 'POST' });
      setInvites(prev => prev.filter(i => i.groupId !== groupId));
    } catch { showNotification('Falha de rede.'); }
  };

  useEffect(() => { loadGroups(); }, []);

  const loadMessages = async (id) => {
    try {
      const res = await apiFetch(`/api/groups/${id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch { /* silencioso */ }
  };

  const openGroup = async (id) => {
    setMessages([]);
    try {
      const res = await apiFetch(`/api/groups/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setSelected(data); loadMessages(id); }
      else showNotification(data.error || 'Não foi possível abrir o grupo.');
    } catch { showNotification('Falha de rede.'); }
  };

  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selected) return;
    const text = newComment.trim();
    setNewComment('');
    try {
      const res = await apiFetch(`/api/groups/${selected.id}/messages`, { method: 'POST', body: { content: text } });
      const msg = await res.json().catch(() => ({}));
      if (res.ok) setMessages(prev => [...prev, msg]);
      else { showNotification(msg.error || 'Falha ao comentar.'); setNewComment(text); }
    } catch { showNotification('Falha de rede.'); setNewComment(text); }
  };

  const handleReact = async (msgId, emoji) => {
    setReactPickerFor(null);
    try {
      const res = await apiFetch(`/api/groups/${selected.id}/messages/${msgId}/react`, { method: 'POST', body: { emoji } });
      if (res.ok) loadMessages(selected.id);
    } catch { /* silencioso */ }
  };

  const renderReactions = (m) => (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {(m.reactions || []).map(r => (
        <button key={r.emoji} onClick={() => handleReact(m.id, r.emoji)} className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${r.mine ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-surface-card border-white/10 text-text-muted'}`}>{r.emoji} {r.count}</button>
      ))}
      <div className="relative">
        <button onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)} aria-label="Reagir" className="text-xs text-text-muted hover:text-white w-6 h-6 rounded-full border border-white/10 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">☺</button>
        {reactPickerFor === m.id && (
          <div className="absolute z-20 -top-10 left-0 bg-surface-card border border-white/10 rounded-full px-2 py-1 flex gap-1.5 shadow-2xl">
            {REACTION_EMOJIS.map(e => <button key={e} onClick={() => handleReact(m.id, e)} className="text-base hover:scale-125 transition-transform outline-none">{e}</button>)}
          </div>
        )}
      </div>
    </div>
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await apiFetch('/api/groups', { method: 'POST', body: { name: newName.trim() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setGroups(prev => [data, ...prev]); setNewName(''); setCreating(false); showNotification('Grupo criado!'); }
      else showNotification(data.error || 'Falha ao criar grupo.');
    } catch { showNotification('Falha de rede ao criar grupo.'); }
  };

  const handleAddMember = async () => {
    if (!addUserId || !selected) return;
    try {
      const res = await apiFetch(`/api/groups/${selected.id}/members`, { method: 'POST', body: { userId: addUserId } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setAddUserId(''); openGroup(selected.id); showNotification('Convite enviado! ✉️'); }
      else showNotification(data.error || 'Falha ao convidar.');
    } catch { showNotification('Falha de rede.'); }
  };

  const handleRemove = async (userId) => {
    if (!selected) return;
    try {
      const res = await apiFetch(`/api/groups/${selected.id}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        if (userId === user.id) { setSelected(null); loadGroups(); showNotification('Você saiu do grupo.'); }
        else openGroup(selected.id);
      } else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Falha.'); }
    } catch { showNotification('Falha de rede.'); }
  };

  const handleDeleteGroup = async () => {
    if (!selected) return;
    try {
      const res = await apiFetch(`/api/groups/${selected.id}`, { method: 'DELETE' });
      if (res.ok) { setSelected(null); loadGroups(); showNotification('Grupo excluído.'); }
      else { const d = await res.json().catch(() => ({})); showNotification(d.error || 'Falha.'); }
    } catch { showNotification('Falha de rede.'); }
  };

  const rankColor = (i) => i === 0 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40'
    : i === 1 ? 'bg-slate-300/20 text-slate-200 border-slate-300/40'
    : i === 2 ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    : 'bg-white/5 text-text-muted border-white/10';

  const availableUsers = selected ? allUsers.filter(u => !selected.ranking.some(r => r.id === u.id) && !(selected.pending || []).some(p => p.id === u.id)) : [];

  const timeAgo = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
            {selected ? <button onClick={() => setSelected(null)} className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><ArrowLeft className="w-5 h-5"/></button> : <Trophy className="w-5 h-5 text-orange-400"/>}
            {selected ? selected.name : 'Grupos de Leitura'}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-brand-primary"/></div>
          ) : !selected ? (
            <>
              {invites.length > 0 && (
                <div className="mb-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Convites ({invites.length})</h4>
                  {invites.map(inv => (
                    <div key={inv.groupId} className="bg-brand-primary/5 border border-brand-primary/30 rounded-default p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm truncate">{inv.name}</div>
                        <div className="text-xs text-text-muted truncate">{inv.owner?.name} convidou • {inv.memberCount} membros</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleAcceptInvite(inv.groupId)} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Aceitar</button>
                        <button onClick={() => handleDeclineInvite(inv.groupId)} className="text-xs font-bold text-text-muted hover:text-red-400 px-2 py-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Recusar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {creating ? (
                <form onSubmit={handleCreate} className="flex gap-2 mb-4">
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do grupo" className="flex-1 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/>
                  <button type="submit" className="bg-brand-primary text-white px-4 rounded-md font-bold text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">Criar</button>
                </form>
              ) : (
                <button onClick={() => setCreating(true)} className="w-full mb-4 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary py-2.5 rounded-md font-bold text-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 hover:bg-brand-primary/20"><Plus className="w-4 h-4"/> Criar novo grupo</button>
              )}

              {groups.length === 0 ? (
                <div className="text-center text-text-muted py-8 text-sm">Você ainda não participa de nenhum grupo. Crie um e desafie a galera! 🔥</div>
              ) : (
                <div className="space-y-2">
                  {groups.map(g => (
                    <button key={g.id} onClick={() => openGroup(g.id)} className="w-full text-left bg-surface-dark border border-white/5 hover:border-brand-primary/30 rounded-default p-4 flex items-center justify-between transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">{g.name} {g.ownerId === user.id && <Crown className="w-3.5 h-3.5 text-yellow-400"/>}</div>
                        <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1"><Users className="w-3 h-3"/> {g.memberCount} {g.memberCount === 1 ? 'membro' : 'membros'}</div>
                      </div>
                      <Trophy className="w-5 h-5 text-text-muted"/>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-text-muted mb-4"><Users className="w-3.5 h-3.5"/> {selected.ranking.length} membros • ranking por dias lidos 🔥</div>

              <div className="space-y-2 mb-5">
                {selected.ranking.map((m, i) => (
                  <div key={m.id} className={`flex items-center gap-3 p-3 rounded-default border ${m.id === user.id ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-surface-dark border-white/5'}`}>
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${rankColor(i)}`}>{i + 1}</div>
                    <Avatar name={m.name} src={m.profileImage} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm truncate flex items-center gap-1">{m.name} {selected.ownerId === m.id && <Crown className="w-3 h-3 text-yellow-400"/>}</div>
                      <div className="text-xs text-text-muted flex items-center gap-2"><span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400"/> {m.bibleStreak} dias</span> • {m.points} pts</div>
                    </div>
                    {(selected.ownerId === user.id && m.id !== user.id) && (
                      <button onClick={() => handleRemove(m.id)} title="Remover" className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-4 h-4"/></button>
                    )}
                  </div>
                ))}
              </div>

              {selected.weekly && selected.weekly.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-400"/> Esta semana</h4>
                  <div className="space-y-1.5">
                    {selected.weekly.map((w, i) => (
                      <div key={w.id} className="flex items-center justify-between bg-surface-dark border border-white/5 rounded-md px-3 py-2 text-sm">
                        <span className="text-white flex items-center gap-2"><span className="text-text-muted text-xs w-4">{i + 1}º</span> {w.name}</span>
                        <span className="text-orange-300 font-bold text-xs">{w.count} {w.count === 1 ? 'leitura' : 'leituras'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5"/> Chat do grupo</h4>
                <div className="bg-surface-dark border border-white/5 rounded-default p-3 max-h-72 overflow-y-auto space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-4">Ainda não há mensagens. Compartilhe sua leitura ou mande um oi! 🔥</p>
                  ) : messages.map(m => (
                    m.type === 'READING' ? (
                      <div key={m.id} className="flex items-start gap-2 text-sm">
                        <Avatar name={m.name} src={m.avatar} size={28} />
                        <div className="min-w-0">
                          <span className="text-text-secondary"><span className="font-semibold text-white">{m.name}</span> fez a leitura diária de <span className="text-white">{m.content}</span> <span className="text-text-muted text-xs">· {timeAgo(m.createdAt)}</span></span>
                          {m.imageUrl && <img src={m.imageUrl} alt="Comprovação" className="mt-1.5 rounded-md max-h-40 border border-white/10"/>}
                          {renderReactions(m)}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className={`flex items-end gap-2 ${m.userId === user.id ? 'flex-row-reverse' : ''}`}>
                        <Avatar name={m.name} src={m.avatar} size={26} />
                        <div className="flex flex-col min-w-0">
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.userId === user.id ? 'bg-brand-primary/20 text-white' : 'bg-surface-card border border-white/5 text-text-secondary'}`}>
                            {m.userId !== user.id && <div className="text-[10px] font-bold text-brand-primary mb-0.5">{m.name}</div>}
                            {m.content}
                          </div>
                          <span className={`text-[9px] text-text-muted mt-0.5 ${m.userId === user.id ? 'text-right' : ''}`}>{timeAgo(m.createdAt)}</span>
                          {renderReactions(m)}
                        </div>
                      </div>
                    )
                  ))}
                </div>
                <form onSubmit={handleSendComment} className="flex gap-2 mt-2">
                  <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Comentar no grupo…" className="flex-1 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary"/>
                  <button type="submit" disabled={!newComment.trim()} aria-label="Enviar comentário" className="bg-brand-primary text-white px-4 rounded-md font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-40"><Send className="w-4 h-4"/></button>
                </form>
              </div>

              <div className="flex gap-2 mb-4">
                <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="flex-1 bg-surface-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus:border-brand-primary">
                  <option value="">Convidar membro…</option>
                  {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button onClick={handleAddMember} disabled={!addUserId} title="Enviar convite" className="bg-brand-primary text-white px-4 rounded-md font-bold text-sm flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-40"><UserPlus className="w-4 h-4"/></button>
              </div>
              {selected.pending && selected.pending.length > 0 && (
                <p className="text-xs text-text-muted mb-4">⏳ Convites pendentes: {selected.pending.map(p => p.name).join(', ')}</p>
              )}

              {selected.ownerId === user.id ? (
                <button onClick={handleDeleteGroup} className="w-full text-xs text-red-400/80 hover:text-red-400 flex items-center justify-center gap-1.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><Trash2 className="w-3.5 h-3.5"/> Excluir grupo</button>
              ) : (
                <button onClick={() => handleRemove(user.id)} className="w-full text-xs text-text-muted hover:text-red-400 flex items-center justify-center gap-1.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><LogOut className="w-3.5 h-3.5"/> Sair do grupo</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
