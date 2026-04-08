import type { Env } from '../config/env.js';

export class GameRoomDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/exists') {
      const lobby = await this.state.storage.get('lobby');
      return lobby ? new Response('exists', { status: 200 }) : new Response('not found', { status: 404 });
    }

    if (url.pathname === '/internal/create' && request.method === 'POST') {
      const existing = await this.state.storage.get('lobby');
      if (existing) {
        return Response.json({ error: 'Lobby already exists' }, { status: 409 });
      }
      return Response.json({ error: 'Not yet implemented' }, { status: 501 });
    }

    return new Response('not found', { status: 404 });
  }
}
