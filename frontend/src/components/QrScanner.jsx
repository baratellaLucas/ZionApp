import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertTriangle } from 'lucide-react';

// Leitor de QR Code físico via câmera do dispositivo (sem app nativo). Aponta a câmera para o
// QR impresso/projetado do evento; ao decodificar, chama onResult(texto) com o conteúdo lido.
export default function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          tick();
        }
      } catch {
        setError('Não foi possível acessar a câmera. Verifique as permissões do navegador ou digite o código manualmente.');
      }
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) { onResult(code.data); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-5 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><Camera className="w-5 h-5 text-brand-primary"/> Escanear QR Code</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-text-muted hover:text-white outline-none"><X className="w-5 h-5"/></button>
        </div>
        {error ? (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm rounded-md p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> {error}
          </div>
        ) : (
          <div className="relative rounded-md overflow-hidden bg-black aspect-square">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-6 border-2 border-brand-primary/70 rounded-lg pointer-events-none" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <p className="text-xs text-text-muted mt-3 text-center">Aponte a câmera para o QR Code exibido no evento.</p>
      </div>
    </div>
  );
}
