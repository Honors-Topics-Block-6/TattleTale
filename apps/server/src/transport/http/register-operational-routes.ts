import type { FastifyInstance } from 'fastify';

export interface HealthChecker {
  check(): Promise<{
    ok: boolean;
    checks: {
      postgres: 'ok' | 'error';
      redis: 'ok' | 'error';
    };
  }>;
}

export async function registerOperationalRoutes(
  fastify: FastifyInstance,
  healthChecker: HealthChecker,
): Promise<void> {
  fastify.get('/health', async () => ({
    ok: true,
    service: 'tattletale-server',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/ready', async (_, reply) => {
    const summary = await healthChecker.check();

    if (!summary.ok) {
      reply.code(503);
    }

    return summary;
  });
}
