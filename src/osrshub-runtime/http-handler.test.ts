/** @jest-environment node */

import { handleOsrsHubRuntimeRequest } from './http-handler';
import { resolveOsrsHubMonster } from './calculate';

const allowedOrigins = 'https://osrsflipit.prices-app.workers.dev,https://osrshub.pages.dev,https://osrshubtest.prices-app.workers.dev';

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

  test('allows the isolated OSRS Hub Test website to read the canonical catalogue', async () => {
    const origin = 'https://osrshubtest.prices-app.workers.dev';
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/monsters?limit=1', {
        headers: { Origin: origin, Accept: 'application/json' },
      }),
      { ALLOWED_ORIGIN: allowedOrigins },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect((await response.json()).status).toBe('ok');
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
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Accept, Content-Type');
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
  test('reports complete engine catalogue coverage without conflating elemental weakness and defence', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/catalogue-summary'),
    );
    const payload = await response.json() as {
      status: string;
      semantics: { weakness: string; defensive: string; variants: string; prices: string };
      monsters: { records: number; withElementalWeakness: number; withoutRecordedElementalWeakness: number; weaknessElementRecordCounts: Record<string, number> };
      equipment: { records: number; twoHandedRecords: number; slotRecordCounts: Record<string, number> };
    };
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.monsters.records).toBeGreaterThan(2000);
    expect(payload.monsters.withElementalWeakness + payload.monsters.withoutRecordedElementalWeakness).toBe(payload.monsters.records);
    expect(payload.equipment.records).toBeGreaterThan(5000);
    expect(payload.equipment.slotRecordCounts.weapon).toBeGreaterThan(0);
    expect(payload.equipment.twoHandedRecords).toBeGreaterThan(0);
    expect(payload.semantics.weakness).toContain('Elemental spell weakness');
    expect(payload.semantics.defensive).toContain('attack-style defence');
    expect(payload.semantics.variants).toContain('recordIndex');
    expect(payload.semantics.prices).toContain('live Grand Exchange prices');
  });

  test('rejects non-GET requests to the catalogue summary', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/catalogue-summary', { method: 'POST' }),
    );
    expect(response.status).toBe(405);
  });
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

  test('preserves every canonical monster variant and resolves duplicate IDs by stable record index', async () => {
    const all: Array<{ id: number; name: string; version?: string; recordIndex: number }> = [];
    const first = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/monsters?offset=0&limit=1000'),
    );
    const firstPayload = await first.json() as {
      total: number;
      results: Array<{ id: number; name: string; version?: string; recordIndex: number }>;
    };
    expect(first.status).toBe(200);
    all.push(...firstPayload.results);

    const offsets = Array.from(
      { length: Math.ceil(Math.max(0, firstPayload.total - 1000) / 1000) },
      (_, index) => (index + 1) * 1000,
    );
    const pageRows = await Promise.all(offsets.map(async (offset) => {
      const response = await handleOsrsHubRuntimeRequest(
        new Request(`https://combat.example.workers.dev/api/monsters?offset=${offset}&limit=1000`),
      );
      const payload = await response.json() as {
        total: number;
        results: Array<{ id: number; name: string; version?: string; recordIndex: number }>;
      };
      expect(response.status).toBe(200);
      expect(payload.total).toBe(firstPayload.total);
      return payload.results;
    }));
    all.push(...pageRows.flat());

    expect(all).toHaveLength(firstPayload.total);
    expect(all.every((row, index) => row.recordIndex === index)).toBe(true);
    const firstById = new Map<number, { row: typeof all[number]; count: number }>();
    const duplicate = all.find((row) => {
      const previous = firstById.get(row.id);
      if (previous) return true;
      firstById.set(row.id, { row, count: 1 });
      return false;
    });
    expect(duplicate).toBeDefined();
    const matches = all.filter((row) => row.id === duplicate!.id);
    expect(resolveOsrsHubMonster({ monsterId: duplicate!.id }).status).toBe('ambiguous');

    const selected = matches[matches.length - 1];
    const resolved = resolveOsrsHubMonster({
      monsterId: selected.id,
      monsterIndex: selected.recordIndex,
      monsterName: selected.name,
      monsterVersion: selected.version ?? '',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.recordIndex).toBe(selected.recordIndex);
    expect(resolved.record?.version ?? '').toBe(selected.version ?? '');

    const mismatch = resolveOsrsHubMonster({
      monsterId: selected.id,
      monsterIndex: selected.recordIndex,
      monsterName: 'Not the selected monster',
    });
    expect(mismatch.status).toBe('identity-mismatch');
  });

  test('uses the engine ammo matrix: Webweaver bows generate their own ammo and cannot take dragon javelins', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/ammo-compatibility?weaponId=27655'),
    );
    const payload = await response.json() as { status: string; compatibleAmmoIds: number[] };
    expect(response.status).toBe(200);
    expect(payload.status).toBe('not-required');
    expect(payload.compatibleAmmoIds).toEqual([]);
  });

  test('requires valid bolts for dragon hunter crossbow and javelins for ballista', async () => {
    const crossbowResponse = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/ammo-compatibility?weaponId=21012'),
    );
    const crossbow = await crossbowResponse.json() as { status: string; compatibleAmmoIds: number[] };
    expect(crossbow.status).toBe('required');
    expect(crossbow.compatibleAmmoIds).toContain(21905);

    const ballistaResponse = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/ammo-compatibility?weaponId=19481'),
    );
    const ballista = await ballistaResponse.json() as { status: string; compatibleAmmoIds: number[] };
    expect(ballista.status).toBe('required');
    expect(ballista.compatibleAmmoIds).toContain(19484);
    expect(ballista.compatibleAmmoIds).not.toContain(11212);
  });

  test('rejects unknown ammo-compatibility weapon IDs', async () => {
    const response = await handleOsrsHubRuntimeRequest(
      new Request('https://combat.example.workers.dev/api/ammo-compatibility?weaponId=999999999'),
    );
    expect(response.status).toBe(404);
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
