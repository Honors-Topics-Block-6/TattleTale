import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GameRoomDO integration', () => {
  it('health endpoint returns ok', async () => {
    const resp = await SELF.fetch('http://localhost/health');
    const body = (await resp.json()) as { ok: boolean };
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('creates a lobby via HTTP', async () => {
    const resp = await SELF.fetch('http://localhost/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'TestHost' }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      lobbyCode: string;
      playerId: string;
      reconnectToken: string;
      wsUrl: string;
    };
    expect(body.ok).toBe(true);
    expect(body.lobbyCode).toBeTruthy();
    expect(body.playerId).toBeTruthy();
    expect(body.reconnectToken).toBeTruthy();
    expect(body.wsUrl).toContain('/api/lobby/');
  });

  it('ready endpoint checks D1', async () => {
    const resp = await SELF.fetch('http://localhost/ready');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { d1: string };
    expect(body.d1).toBe('ok');
  });
});
