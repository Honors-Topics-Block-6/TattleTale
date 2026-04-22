const SERVER_URL = (import.meta.env?.VITE_SERVER_URL) || 'http://localhost:8787';

export async function fetchLeaderboard({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${SERVER_URL}/api/leaderboard?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Failed to fetch leaderboard');
  }
  return data;
}
