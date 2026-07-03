// O QR do evento (gerado no Admin) codifica uma URL como "<origin>/?checkin=<eventId>&code=<CODE>".
// Ao escanear pela câmera do app (em vez do app nativo de câmera), extraímos apenas o código,
// aceitando tanto essa URL quanto o código puro (caso o texto lido já seja só o código).
export const extractCheckinCode = (raw) => {
  const text = String(raw || '').trim();
  try {
    const url = new URL(text);
    const code = url.searchParams.get('code');
    if (code) return code.toUpperCase();
  } catch { /* não é uma URL — trata como código puro */ }
  return text.toUpperCase();
};
