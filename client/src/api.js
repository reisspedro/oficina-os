const TOKEN_KEY = 'oficinaos_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

export const fmt = (n) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const STATUS_LABELS = {
  orcamento: 'Orçamento',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
};
