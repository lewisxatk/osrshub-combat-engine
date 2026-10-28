/**
 * Framework-neutral HTTP adapter for the OSRS Hub calculation core.
 *
 * This is intentionally not a Next.js API route: the upstream app is a static
 * export. A Worker can import this handler in a separate deployment target.
 */
import {
  calculateOsrsHubScenario,
  OsrsHubCalculationRequest,
} from './calculate';

export interface OsrsHubRuntimeEnvironment {
  ALLOWED_ORIGIN?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function response(
  payload: Record<string, unknown>,
  status: number,
  origin?: string,
): Response {
  const headers = new Headers(JSON_HEADERS);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function handleOsrsHubRuntimeRequest(
  request: Request,
  env: OsrsHubRuntimeEnvironment = {},
): Promise<Response> {
  const url = new URL(request.url);
  const requestOrigin = request.headers.get('Origin') ?? undefined;
  const allowedOrigin = env.ALLOWED_ORIGIN;

  if (requestOrigin && allowedOrigin && requestOrigin !== allowedOrigin) {
    return response({ status: 'rejected', error: 'Origin is not allowed.' }, 403);
  }

  const corsOrigin = requestOrigin && (!allowedOrigin || requestOrigin === allowedOrigin)
    ? requestOrigin
    : undefined;

  if (request.method === 'OPTIONS') {
    if (requestOrigin && allowedOrigin && requestOrigin !== allowedOrigin) {
      return response({ status: 'rejected', error: 'Origin is not allowed.' }, 403);
    }
    const headers = new Headers();
    headers.set('Allow', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
    if (corsOrigin) {
      headers.set('Access-Control-Allow-Origin', corsOrigin);
      headers.set('Vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }

  if (url.pathname === '/health') {
    if (request.method !== 'GET') {
      return response({ status: 'rejected', error: 'Method not allowed.' }, 405, corsOrigin);
    }
    return response({ status: 'ok', service: 'osrshub-combat-runtime' }, 200, corsOrigin);
  }

  if (url.pathname !== '/api/calculate') {
    return response({ status: 'rejected', error: 'Route not found.' }, 404, corsOrigin);
  }
  if (request.method !== 'POST') {
    return response({ status: 'rejected', error: 'Method not allowed.' }, 405, corsOrigin);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return response({ status: 'rejected', error: 'Content-Type must be application/json.' }, 415, corsOrigin);
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return response({ status: 'rejected', error: 'Request body exceeds 64 KiB.' }, 413, corsOrigin);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return response({ status: 'rejected', error: 'Request body could not be read.' }, 400, corsOrigin);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return response({ status: 'rejected', error: 'Request body exceeds 64 KiB.' }, 413, corsOrigin);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return response({ status: 'rejected', error: 'Request body must be valid JSON.' }, 400, corsOrigin);
  }
  if (!isRecord(body) || !isRecord(body.player)
    || typeof body.monsterId !== 'number' || !Number.isInteger(body.monsterId)) {
    return response({
      status: 'review-required',
      result: null,
      issues: ['Request must contain a player object and integer monsterId.'],
    }, 400, corsOrigin);
  }

  try {
    const result = calculateOsrsHubScenario(body as unknown as OsrsHubCalculationRequest);
    return response(result as unknown as Record<string, unknown>, result.status === 'calculated' ? 200 : 422, corsOrigin);
  } catch {
    // Do not leak stack traces or internal engine details to public clients.
    return response({
      status: 'error',
      error: 'Combat calculation failed safely. Review the request and try again.',
    }, 500, corsOrigin);
  }
}
