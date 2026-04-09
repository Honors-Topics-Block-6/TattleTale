import { getDeviceId } from '../utils/deviceId';

const SERVER_URL = (import.meta.env?.VITE_SERVER_URL) || 'http://localhost:8787';

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function fetchInstalledAppsFromServer() {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${SERVER_URL}/store/installed-apps?deviceId=${encodeURIComponent(deviceId)}`,
    { method: 'GET' }
  );

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.ok) {
    const message = data?.error?.message || 'Failed to fetch installed apps.';
    throw new Error(message);
  }

  return data.installedAppIds || [];
}

export async function installAppOnServer(appId) {
  const deviceId = getDeviceId();
  const res = await fetch(`${SERVER_URL}/store/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, appId }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.ok) {
    const message = data?.error?.message || 'Server rejected install.';
    throw new Error(message);
  }

  return data.installedAppIds || [];
}

