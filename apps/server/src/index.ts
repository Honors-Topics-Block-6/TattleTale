import { Hono } from 'hono';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
  WEB_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'tattletale-server', timestamp: new Date().toISOString() }),
);

export default app;

// Placeholder DO - will be replaced in Task 7
export class GameRoomDO implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}
  async fetch(_request: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
