/** @jest-environment node */

import { handleOsrsHubRuntimeRequest } from './http-handler';

const allowedOrigins = 'https://osrsflipit.prices-app.workers.dev,https://osrshub.pages.dev';

describe('OSRS Hub runtime CORS allowlist', () => {
  test.each([
    'https://osrsflipit.prices-app.workers.dev',
    'https://osrshub.pages.dev',
  ])('allows configured exact origin %s on health endpoint', async (origin) => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/health', {
        method: 'GET',
        headers: { Origin: origin },
      }),
      { ALLOWED_ORIGIN: allowedOrigins },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'osrshub-combat-runtime',
    });
  });

  test('rejects an unlisted origin exactly, not by substring', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/health', {
        headers: { Origin: 'https://osrsflipit.prices-app.workers.dev.attacker.invalid' },
      }),
      { ALLOWED_ORIGIN: allowedOrigins },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('answers preflight for an allowed origin', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/calculate', {
        method: 'OPTIONS',
        headers: { Origin: 'https://osrsflipit.prices-app.workers.dev' },
      }),
      { ALLOWED_ORIGIN: allowedOrigins },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://osrsflipit.prices-app.workers.dev');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  test('rejects preflight from an unlisted origin', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/calculate', {
        method: 'OPTIONS',
        headers: { Origin: 'https://unlisted.invalid' },
      }),
      { ALLOWED_ORIGIN: allowedOrigins },
    );

    expect(response.status).toBe(403);
  });
});

describe('canonical catalogue endpoints', () => {
  test('returns paginated canonical monsters with their engine IDs', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/monsters?offset=0&limit=3'),
    );
    const payload = await response.json() as { status: string; total: number; results: Array<{ id: number; name: string }> };
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.results).toHaveLength(3);
    expect(payload.results.every((row) => Number.isInteger(row.id) && row.id > 0 && row.name)).toBe(true);
  });

  test('returns canonical equipment filtered by slot', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/equipment?slot=weapon&limit=5'),
    );
    const payload = await response.json() as { status: string; total: number; results: Array<{ id: number; name: string; slot: string }> };
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.every((row) => Number.isInteger(row.id) && row.id > 0 && row.slot === 'weapon')).toBe(true);
  });

  test('rejects invalid catalogue pagination', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/monsters?offset=-1&limit=5'),
    );
    expect(response.status).toBe(400);
  });
});
