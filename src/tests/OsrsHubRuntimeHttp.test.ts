import { expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { handleOsrsHubRuntimeRequest } from '@/osrshub-runtime/http-handler';

const makeRequest = (
  path: string,
  init: RequestInit = {},
) => new Request(`https://combat.example${path}`, init);

test('health endpoint reports service readiness without caching', async () => {
  const response = await handleOsrsHubRuntimeRequest(makeRequest('/health'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    status: 'ok',
    service: 'osrshub-combat-runtime',
  });
});

test('rejects unapproved origins before processing a request', async () => {
  const response = await handleOsrsHubRuntimeRequest(
    makeRequest('/api/calculate', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    { ALLOWED_ORIGIN: 'https://osrsflipit.prices-app.workers.dev' },
  );
  expect(response.status).toBe(403);
});

test('rejects unsupported methods, unknown routes, and non-JSON bodies', async () => {
  expect((await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate'))).status).toBe(405);
  expect((await handleOsrsHubRuntimeRequest(makeRequest('/nope'))).status).toBe(404);
  expect((await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate', {
    method: 'POST',
    body: 'hello',
  }))).status).toBe(415);
});

test('rejects malformed JSON and oversized request bodies', async () => {
  const malformed = await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  }));
  expect(malformed.status).toBe(400);

  const oversized = await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(70 * 1024) }),
  }));
  expect(oversized.status).toBe(413);
});

test('routes valid requests through the actual combat calculation core', async () => {
  const response = await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player: generateEmptyPlayer('HTTP runtime regression'),
      monsterId: 415,
    }),
  }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.status).toBe('calculated');
  expect(result.result.monster.name).toBe('Abyssal demon');
  expect(result.result.maxHit).toBe(11);
});

test('returns review-required for invalid combat inputs instead of inventing results', async () => {
  const response = await handleOsrsHubRuntimeRequest(makeRequest('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: {}, monsterId: 415 }),
  }));
  expect(response.status).toBe(422);
  expect((await response.json()).status).toBe('review-required');
});
