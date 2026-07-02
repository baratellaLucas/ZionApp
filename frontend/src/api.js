// Cliente de API centralizado: base configurável + injeção do token JWT.
// Resolução da URL da API:
//  1) VITE_API_URL, se definido (produção / caso especial);
//  2) senão, deriva do host acessado (mesmo hostname do app, porta 3000) —
//     assim funciona tanto em localhost quanto pelo IP da rede (celular) sem editar nada.
const API_PORT = import.meta.env.VITE_API_PORT || '3000';
const deriveApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  return `http://localhost:${API_PORT}`;
};
export const API_URL = deriveApiUrl();

const TOKEN_KEY = 'zion_token';
const ORIGINAL_TOKEN_KEY = 'zion_original_token'; // token do admin durante o Modo de Teste

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Persiste o token do admin (usuário original) enquanto ele simula outro usuário,
// para que o Modo de Teste sobreviva a um F5.
export const getStoredOriginalToken = () => localStorage.getItem(ORIGINAL_TOKEN_KEY);
export const storeOriginalToken = (token) => {
  if (token) localStorage.setItem(ORIGINAL_TOKEN_KEY, token);
  else localStorage.removeItem(ORIGINAL_TOKEN_KEY);
};

// Callback opcional disparado quando o servidor responde 401 (sessão expirada).
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/**
 * Wrapper sobre fetch:
 *  - prefixa API_URL
 *  - injeta Authorization: Bearer <token>
 *  - serializa body JSON automaticamente
 *  - em 401, limpa o token e dispara o handler de logout
 * Retorna o objeto Response (igual ao fetch) para manter compatibilidade.
 */
export const apiFetch = async (path, options = {}) => {
  const { body, headers, ...rest } = options;
  const finalHeaders = { ...(headers || {}) };
  const token = getToken();
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  let finalBody = body;
  if (body !== undefined && typeof body !== 'string') {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  } else if (typeof body === 'string' && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders, body: finalBody });

  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
  }
  return res;
};
