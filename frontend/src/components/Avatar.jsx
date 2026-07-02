import React from 'react';

// Avatar reutilizável: mostra a foto de perfil se houver, senão a inicial do nome.
export default function Avatar({ name, src, size = 40, className = '' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-surface-dark border border-white/10 flex items-center justify-center font-bold text-brand-primary overflow-hidden shrink-0 ${className}`}
    >
      {src
        ? <img src={src} alt={name || 'Perfil'} className="w-full h-full object-cover" />
        : <span style={{ fontSize: Math.round(size * 0.42) }}>{(name || '?').charAt(0).toUpperCase()}</span>}
    </div>
  );
}
