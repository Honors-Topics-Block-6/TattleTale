const SERVER_URL = (import.meta.env?.VITE_SERVER_URL) || 'http://localhost:8787';

function headers() {
  return { 'Content-Type': 'application/json' };
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function register({ email, password, displayName }) {
  const res = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ email, password, displayName }),
  });
  return parse(res);
}

export async function login({ email, password }) {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  return parse(res);
}

export async function fetchMe() {
  const res = await fetch(`${SERVER_URL}/api/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });
  return parse(res);
}

export async function logout() {
  const res = await fetch(`${SERVER_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return parse(res);
}

export async function updateProfile(patch) {
  const res = await fetch(`${SERVER_URL}/api/profile`, {
    method: 'PUT',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  return parse(res);
}

export async function getWsTicket() {
  const res = await fetch(`${SERVER_URL}/api/auth/ws-ticket`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  return data?.ok ? data.ticket : null;
}
