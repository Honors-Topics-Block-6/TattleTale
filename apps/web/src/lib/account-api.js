import { getDeviceId } from '../os/utils/deviceId';

const SERVER_URL = (import.meta.env?.VITE_SERVER_URL) || 'http://localhost:8787';

async function parseSafe(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function initAccount(displayName) {
  const accountId = getDeviceId();
  const res = await fetch(`${SERVER_URL}/api/account/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId, displayName }),
  });
  const data = await parseSafe(res);
  return { accountId, user: data.user };
}

export async function fetchAccount() {
  const accountId = getDeviceId();
  const res = await fetch(`${SERVER_URL}/api/account/${encodeURIComponent(accountId)}`);
  const data = await parseSafe(res);
  return { accountId, ...data };
}

export async function fetchAvatarCatalog() {
  const accountId = getDeviceId();
  const res = await fetch(
    `${SERVER_URL}/api/avatar/catalog?accountId=${encodeURIComponent(accountId)}`,
  );
  return parseSafe(res);
}

export async function purchaseAvatar(avatarId) {
  const accountId = getDeviceId();
  const res = await fetch(`${SERVER_URL}/api/avatar/purchase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId, avatarId }),
  });
  return parseSafe(res);
}

export async function equipAvatar(avatarId) {
  const accountId = getDeviceId();
  const res = await fetch(`${SERVER_URL}/api/avatar/equip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId, avatarId }),
  });
  return parseSafe(res);
}
