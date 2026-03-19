import { constants as fsConstants, createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

interface RegisterWebRoutesOptions {
  enableStaticWeb: boolean;
  staticWebDir?: string;
  enablePlaytestRoutes: boolean;
}

const RESERVED_PREFIXES = ['/health', '/ready', '/store', '/socket.io', '/session', '/playtest'];

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function normalizePathForComparison(value: string): string {
  return path.resolve(value).toLowerCase();
}

function pathIsWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePathForComparison(root);
  const normalizedCandidate = normalizePathForComparison(candidate);
  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function canReadFile(filePath: string): Promise<boolean> {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

async function canReadDirectory(dirPath: string): Promise<boolean> {
  try {
    const directoryStats = await stat(dirPath);
    return directoryStats.isDirectory();
  } catch {
    return false;
  }
}

function getContentType(filePath: string): string | undefined {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()];
}

function safeDecodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function resolveFirstExistingFile(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await canReadFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolvePlaytestFilePath(): Promise<string | null> {
  return resolveFirstExistingFile([
    path.resolve(process.cwd(), 'public/playtest/index.html'),
    path.resolve(process.cwd(), 'apps/server/public/playtest/index.html'),
  ]);
}

async function resolveStaticWebRoot(staticWebDir?: string): Promise<string | null> {
  const candidates: string[] = [];
  if (staticWebDir && staticWebDir.trim().length > 0) {
    candidates.push(path.resolve(process.cwd(), staticWebDir.trim()));
  }

  candidates.push(path.resolve(process.cwd(), '../web/dist'));
  candidates.push(path.resolve(process.cwd(), 'apps/web/dist'));

  for (const candidate of candidates) {
    const indexFilePath = path.join(candidate, 'index.html');
    if (await canReadFile(indexFilePath)) {
      return candidate;
    }
  }

  return null;
}

async function sendFile(reply: FastifyReply, filePath: string): Promise<void> {
  const contentType = getContentType(filePath);
  if (contentType) {
    reply.type(contentType);
  }

  if (path.extname(filePath).toLowerCase() === '.html') {
    reply.header('Cache-Control', 'no-store');
  } else {
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  }

  await access(filePath, fsConstants.R_OK);
  reply.send(createReadStream(filePath));
}

function isReservedPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function resolveStaticFilePath(
  root: string,
  pathname: string,
): Promise<string | null> {
  const relativePath = pathname.replace(/^\/+/, '');
  if (!relativePath) {
    return path.join(root, 'index.html');
  }

  const candidatePath = path.resolve(root, relativePath);
  if (!pathIsWithinRoot(root, candidatePath)) {
    return null;
  }

  if (await canReadFile(candidatePath)) {
    return candidatePath;
  }

  if (await canReadDirectory(candidatePath)) {
    const nestedIndexPath = path.join(candidatePath, 'index.html');
    if (await canReadFile(nestedIndexPath)) {
      return nestedIndexPath;
    }
  }

  return null;
}

export async function registerWebRoutes(
  fastify: FastifyInstance,
  options: RegisterWebRoutesOptions,
): Promise<void> {
  if (options.enablePlaytestRoutes) {
    const playtestFilePath = await resolvePlaytestFilePath();

    if (!playtestFilePath) {
      fastify.log.warn('Playtest UI was enabled but no playtest HTML file was found.');
    } else {
      const servePlaytest = async (_request: unknown, reply: FastifyReply) => {
        await sendFile(reply, playtestFilePath);
      };

      fastify.get('/playtest', servePlaytest);
      fastify.get('/playtest/', servePlaytest);
    }
  }

  if (!options.enableStaticWeb) {
    return;
  }

  const staticWebRoot = await resolveStaticWebRoot(options.staticWebDir);

  if (!staticWebRoot) {
    fastify.log.warn(
      {
        staticWebDir: options.staticWebDir ?? null,
      },
      'Static web serving enabled but no web dist directory with index.html was found.',
    );
    return;
  }

  fastify.log.info(
    {
      staticWebRoot,
    },
    'Serving built web app from static directory.',
  );

  fastify.get('/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'] ?? '';
    const decodedWildcard = safeDecodePath(wildcard);

    if (decodedWildcard === null) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: 'INVALID_PATH_ENCODING',
          message: 'Request path could not be decoded.',
        },
      };
    }

    const normalizedPathname = `/${decodedWildcard}`.replace(/\/{2,}/g, '/');

    if (isReservedPath(normalizedPathname)) {
      return reply.callNotFound();
    }

    const matchedFilePath = await resolveStaticFilePath(staticWebRoot, normalizedPathname);
    if (matchedFilePath) {
      await sendFile(reply, matchedFilePath);
      return;
    }

    // SPA fallback: unknown non-file routes should resolve to index.html.
    if (!path.extname(normalizedPathname)) {
      await sendFile(reply, path.join(staticWebRoot, 'index.html'));
      return;
    }

    return reply.callNotFound();
  });
}
