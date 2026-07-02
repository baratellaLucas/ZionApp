import React, { useState, useEffect } from 'react';
import { Gift, Award, Ticket, Tag, Check, X, Loader2, Copy, ShoppingBag, QrCode } from 'lucide-react';
import { apiFetch } from '../api';

// URL que o QR do voucher codifica — o atendente escaneia e o app valida/consome automaticamente
const voucherQrUrl = (code) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${window.location.origin}/?voucher=${code}`)}`;

const RewardsModule = ({ user, setUser, showNotification }) => {
  const [products, setProducts] = useState([]);
  const [myRedemptions, setMyRedemptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmProduct, setConfirmProduct] = useState(null);
  const [voucher, setVoucher] = useState(null); // resgate recém-criado (modal)
  const [qrVoucher, setQrVoucher] = useState(null); // voucher exibido como QR para o atendente
  const [redeeming, setRedeeming] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [resProd, resRed] = await Promise.all([
        apiFetch('/api/products').catch(() => null),
        apiFetch('/api/redemptions/my').catch(() => null),
      ]);
      if (resProd && resProd.ok) setProducts((await resProd.json()).filter(p => p.active));
      if (resRed && resRed.ok) setMyRedemptions(await resRed.json());
    } catch { /* offline */ } finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, [user?.id]);

  const points = user?.points || 0;

  const handleRedeem = async () => {
    if (!confirmProduct) return;
    const product = confirmProduct;
    setRedeeming(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/redeem`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser(prev => ({ ...prev, points: data.points }));
        setMyRedemptions(prev => [data.redemption, ...prev]);
        setConfirmProduct(null);
        setVoucher(data.redemption);
        showNotification('Resgate concluído! Guarde seu voucher. 🎁');
      } else {
        showNotification(data.error || 'Não foi possível resgatar.');
        setConfirmProduct(null);
      }
    } catch {
      showNotification('Falha de rede ao resgatar.');
      setConfirmProduct(null);
    } finally { setRedeeming(false); }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(() => showNotification('Código copiado!')).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-brand-secondary to-brand-primary p-6 rounded-default shadow-level-2 text-white relative overflow-hidden">
        <div className="flex justify-between items-center relative z-10">
          <div>
            <h2 className="text-xl font-display font-bold flex items-center gap-2"><Gift className="w-6 h-6" /> Loja de Recompensas</h2>
            <p className="text-white/80 text-sm mt-1">Troque seus Zion Points por prêmios.</p>
          </div>
          <div className="bg-black/30 px-4 py-3 rounded-default border border-white/10 text-center">
            <div className="text-white/60 text-[10px] uppercase font-bold tracking-widest">Saldo</div>
            <div className="text-2xl font-display font-bold flex items-center gap-1"><Award className="w-5 h-5 text-yellow-300" /> {points}</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : products.length === 0 ? (
        <div className="text-center text-text-muted py-10 bg-surface-card rounded-default border border-dashed border-white/10">Nenhum prêmio disponível no momento.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(p => {
            const canAfford = points >= p.cost;
            return (
              <div key={p.id} className="bg-surface-card border border-white/5 rounded-default overflow-hidden shadow-level-2 flex flex-col">
                <div className="h-32 bg-surface-dark flex items-center justify-center overflow-hidden">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-10 h-10 text-white/10" />}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-primary mb-1"><Tag className="w-3 h-3" /> {p.category}</span>
                  <h3 className="font-bold text-white leading-tight">{p.name}</h3>
                  {p.description && <p className="text-xs text-text-muted mt-1 flex-1">{p.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="flex items-center gap-1 font-display font-bold text-brand-primary"><Award className="w-4 h-4" /> {p.cost}</span>
                    <button
                      onClick={() => setConfirmProduct(p)}
                      disabled={!canAfford}
                      title={canAfford ? '' : 'Pontos insuficientes'}
                      className="flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-40 disabled:cursor-not-allowed bg-brand-primary text-white hover:bg-brand-secondary"
                    >
                      Resgatar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Meus Vouchers */}
      <div className="pt-2">
        <h3 className="text-lg font-display font-bold mb-3 flex items-center gap-2 text-text-primary"><Ticket className="w-5 h-5 text-brand-primary" /> Meus Vouchers</h3>
        {myRedemptions.length === 0 ? (
          <div className="text-center text-text-muted py-8 bg-surface-dark border border-dashed border-white/10 rounded-default text-sm">Você ainda não resgatou nenhum prêmio.</div>
        ) : (
          <div className="space-y-2">
            {myRedemptions.map(r => (
              <div key={r.id} className="bg-surface-card border border-white/5 rounded-default p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm truncate">{r.productName}</div>
                  <button onClick={() => copyCode(r.code)} className="mt-1 flex items-center gap-1.5 text-brand-primary font-mono text-sm font-bold hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60" title="Copiar código">
                    {r.code} <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'ATIVO' && (
                    <button onClick={() => setQrVoucher(r)} title="Mostrar QR ao atendente" className="flex items-center gap-1 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><QrCode className="w-4 h-4" /> QR</button>
                  )}
                  <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold ${r.status === 'ATIVO' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-text-muted'}`}>
                    {r.status === 'ATIVO' ? 'Ativo' : 'Usado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      {confirmProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => !redeeming && setConfirmProduct(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4 text-brand-primary"><div className="bg-brand-primary/10 p-3 rounded-full"><Gift className="w-8 h-8" /></div></div>
            <h3 className="text-lg font-bold text-text-primary text-center mb-1">Resgatar "{confirmProduct.name}"?</h3>
            <p className="text-text-muted text-center mb-6 text-sm">Serão debitados <span className="font-bold text-brand-primary">{confirmProduct.cost}</span> Zion Points. Seu saldo ficará em <span className="font-bold text-white">{points - confirmProduct.cost}</span>.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmProduct(null)} disabled={redeeming} className="flex-1 px-4 py-2.5 rounded-default bg-surface-dark text-text-primary font-semibold hover:bg-white/5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-50">Cancelar</button>
              <button onClick={handleRedeem} disabled={redeeming} className="flex-1 px-4 py-2.5 rounded-default bg-brand-primary hover:bg-brand-secondary text-white font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 flex items-center justify-center gap-2 disabled:opacity-50">
                {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do voucher gerado */}
      {voucher && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setVoucher(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setVoucher(null)} className="absolute top-4 right-4 text-text-muted hover:text-white"><X className="w-5 h-5" /></button>
            <div className="flex justify-center mb-4 text-emerald-400"><div className="bg-emerald-500/10 p-3 rounded-full"><Ticket className="w-8 h-8" /></div></div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Voucher gerado!</h3>
            <p className="text-text-muted text-sm mb-4">Apresente este QR ao atendente para resgatar "{voucher.productName}".</p>
            <div className="bg-white rounded-xl p-3 inline-block mb-4">
              <img src={voucherQrUrl(voucher.code)} alt="QR do voucher" width="200" height="200" />
            </div>
            <button onClick={() => copyCode(voucher.code)} className="w-full bg-surface-dark border border-brand-primary/30 rounded-default py-3 font-mono text-xl font-bold text-brand-primary flex items-center justify-center gap-2 hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              {voucher.code} <Copy className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-text-muted mt-3">O atendente escaneia o QR e o voucher é validado e baixado na hora. O código acima serve como alternativa manual.</p>
          </div>
        </div>
      )}

      {/* Modal: QR de um voucher da lista */}
      {qrVoucher && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-200" onClick={() => setQrVoucher(null)}>
          <div className="bg-surface-card border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 text-center relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setQrVoucher(null)} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"><X className="w-5 h-5" /></button>
            <div className="flex justify-center mb-3 text-brand-primary"><div className="bg-brand-primary/10 p-3 rounded-full"><QrCode className="w-7 h-7" /></div></div>
            <h3 className="text-lg font-bold text-text-primary mb-1">{qrVoucher.productName}</h3>
            <p className="text-text-muted text-sm mb-4">Mostre este QR ao atendente para validar seu voucher.</p>
            <div className="bg-white rounded-xl p-3 inline-block mb-4">
              <img src={voucherQrUrl(qrVoucher.code)} alt="QR do voucher" width="200" height="200" />
            </div>
            <button onClick={() => copyCode(qrVoucher.code)} className="w-full bg-surface-dark border border-brand-primary/30 rounded-default py-3 font-mono text-lg font-bold text-brand-primary flex items-center justify-center gap-2 hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60">
              {qrVoucher.code} <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardsModule;
