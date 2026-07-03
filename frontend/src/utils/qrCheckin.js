// Extrai um código de um texto lido por QR: aceita tanto uma URL "<origin>/?<param>=<CODE>"
// quanto o código puro (caso o texto lido já seja só o código).
const extractQrParam = (raw, paramName) => {
  const text = String(raw || '').trim();
  try {
    const url = new URL(text);
    const value = url.searchParams.get(paramName);
    if (value) return value.toUpperCase();
  } catch { /* não é uma URL — trata como código puro */ }
  return text.toUpperCase();
};

// QR do evento (gerado no Admin): "<origin>/?checkin=<eventId>&code=<CODE>"
export const extractCheckinCode = (raw) => extractQrParam(raw, 'code');

// QR do voucher (gerado na Loja): "<origin>/?voucher=<CODE>"
export const extractVoucherCode = (raw) => extractQrParam(raw, 'voucher');
