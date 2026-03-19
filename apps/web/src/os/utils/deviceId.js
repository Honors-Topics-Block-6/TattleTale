const STORAGE_KEY = 'tattletale.deviceId.v1';

export function getDeviceId() {
  if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000000';

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const created = window.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random()}`; // fallback (dev-only)

  window.localStorage.setItem(STORAGE_KEY, created);
  return created;
}

