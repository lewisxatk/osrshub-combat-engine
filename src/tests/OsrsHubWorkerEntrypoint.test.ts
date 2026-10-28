/** @jest-environment node */

import { expect, test } from '@jest/globals';
import worker from '@/osrshub-runtime/worker';

test('Cloudflare Worker entrypoint forwards health requests to the runtime handler', async () => {
  const request = new Request('https://combat.example/health', {
    headers: { Origin: 'https://osrsflipit.prices-app.workers.dev' },
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: 'https://osrsflipit.prices-app.workers.dev',
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin'))
    .toBe('https://osrsflipit.prices-app.workers.dev');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    status: 'ok',
    service: 'osrshub-combat-runtime',
  });
});

test('Cloudflare Worker entrypoint rejects an origin not in its environment allow-list', async () => {
  const request = new Request('https://combat.example/api/calculate', {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ player: {}, monsterId: 415 }),
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: 'https://osrsflipit.prices-app.workers.dev',
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    status: 'rejected',
    error: 'Origin is not allowed.',
  });
});

test('Cloudflare Worker entrypoint supports CORS preflight without requiring credentials', async () => {
  const response = await worker.fetch(new Request('https://combat.example/api/calculate', {
    method: 'OPTIONS',
    headers: { Origin: 'https://osrsflipit.prices-app.workers.dev' },
  }), {
    ALLOWED_ORIGIN: 'https://osrsflipit.prices-app.workers.dev',
  });

  expect(response.status).toBe(204);
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  expect(response.headers.get('Access-Control-Allow-Origin'))
    .toBe('https://osrsflipit.prices-app.workers.dev');
});
