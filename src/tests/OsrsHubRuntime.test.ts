import { expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { calculateOsrsHubScenario } from '@/osrshub-runtime/calculate';

test('OSRS Hub runtime reproduces the upstream Abyssal demon regression anchor', () => {
  const result = calculateOsrsHubScenario({
    player: generateEmptyPlayer('OSRS Hub regression'),
    monsterId: 415,
  });

  expect(result.status).toBe('calculated');
  if (result.status !== 'calculated') return;
  expect(result.result.monster.name).toBe('Abyssal demon');
  expect(result.result.maxHit).toBe(11);
  expect(result.result.dps).toBeCloseTo(0.658, 3);
  expect(result.result.attackRoll).toBe(6848);
  expect(result.result.npcDefenceRoll).toBe(12096);
  expect(result.result.accuracy * 100).toBeCloseTo(28.30, 2);
});

test('runtime resolves equipment by canonical ID instead of trusting supplied stats', () => {
  const player = generateEmptyPlayer('Canonical equipment test');
  player.equipment.weapon = {
    id: 4151,
    name: 'fake item name',
    weight: 0,
    version: 'fake',
    slot: 'weapon',
    image: '',
    speed: 1,
    category: 'fake' as never,
    isTwoHanded: false,
    bonuses: {
      str: 999,
      ranged_str: 999,
      magic_str: 999,
      prayer: 999,
    },
    offensive: {
      stab: 999,
      slash: 999,
      crush: 999,
      magic: 999,
      ranged: 999,
    },
    defensive: {
      stab: 999,
      slash: 999,
      crush: 999,
      magic: 999,
      ranged: 999,
    },
  };

  const result = calculateOsrsHubScenario({ player, monsterId: 415 });
  expect(result.status).toBe('calculated');
  if (result.status !== 'calculated') return;
  expect(result.result.maxHit).not.toBeGreaterThan(100);
});

test('runtime refuses unknown monster IDs and unknown equipment IDs', () => {
  const player = generateEmptyPlayer('Invalid input test');
  expect(calculateOsrsHubScenario({ player, monsterId: -1 }).status).toBe('review-required');

  player.equipment.weapon = {
    ...player.equipment.weapon!,
    id: 999999999,
  };
  const result = calculateOsrsHubScenario({ player, monsterId: 415 });
  expect(result.status).toBe('review-required');
  expect(result.issues.some((issue) => issue.includes('not found in the engine equipment dataset'))).toBe(true);
});
