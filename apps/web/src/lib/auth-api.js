const SERVER_URL = (import.meta.env?.VITE_SERVER_URL) || 'http://localhost:8787';
const TOKEN_KEY = 'tattletale.authToken.v1';

function headers(token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function getAuthToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export async function register({ email, password, displayName }) {
  const res = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password, displayName }),
  });
  return parse(res);
}

export async function login({ email, password }) {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  return parse(res);
}

export async function fetchMe(token) {
  const res = await fetch(`${SERVER_URL}/api/auth/me`, {
    method: 'GET',
    headers: headers(token),
  });
  return parse(res);
}

export async function logout(token) {
  const res = await fetch(`${SERVER_URL}/api/auth/logout`, {
    method: 'POST',
    headers: headers(token),
  });
  return parse(res);
}

export async function updateProfile(token, patch) {
  const res = await fetch(`${SERVER_URL}/api/profile`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(patch),
  });
  return parse(res);
}
