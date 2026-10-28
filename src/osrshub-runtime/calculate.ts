/**
 * Stable calculation entrypoint for OSRS Hub.
 *
 * This module invokes the upstream engine's real calculator. It accepts item
 * IDs and explicit combat inputs, resolves equipment/monsters from the engine's
 * own canonical datasets, and never trusts client-supplied gear bonuses.
 *
 * GPL-3.0: this is an adapter around the OSRS DPS Calculator codebase. Keep the
 * repository licence and upstream provenance when distributing this module.
 */
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import {
  availableEquipment,
  calculateAttackSpeed,
  calculateEquipmentBonusesFromGear,
  getCanonicalItemId,
} from '@/lib/Equipment';
import { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { Player, PlayerEquipment } from '@/types/Player';
import { Monster } from '@/types/Monster';

const SKILL_KEYS = [
  'atk', 'def', 'hp', 'magic', 'prayer', 'ranged', 'str',
  'mining', 'herblore', 'farming',
] as const;
const EQUIPMENT_SLOTS = [
  'head', 'cape', 'neck', 'ammo', 'weapon', 'body',
  'shield', 'legs', 'hands', 'feet', 'ring',
] as const;

type Slot = typeof EQUIPMENT_SLOTS[number];
type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function validateSkills(value: unknown, label: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`);
    return;
  }
  for (const key of SKILL_KEYS) {
    const level = value[key];
    if (!Number.isInteger(level) || Number(level) < 0 || Number(level) > 126) {
      issues.push(`${label}.${key} must be an integer from 0 to 126`);
    }
  }
}

function resolveEquipment(value: unknown, slot: Slot, issues: string[]) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Number.isInteger(value.id) || Number(value.id) <= 0) {
    issues.push(`equipment.${slot} must be null or contain a positive canonical item ID`);
    return null;
  }
  const id = Number(value.id);
  const exact = availableEquipment.find((item) => item.id === id);
  const canonicalId = getCanonicalItemId(id);
  const item = exact ?? availableEquipment.find((candidate) => candidate.id === canonicalId);
  if (!item) {
    issues.push(`equipment.${slot} item ID ${id} was not found in the engine equipment dataset`);
    return null;
  }
  if (item.slot !== slot) {
    issues.push(`equipment.${slot} item ID ${id} belongs in the ${item.slot} slot`);
    return null;
  }
  return item;
}

function buildMonsterInputs(overrides: unknown, monsterHp: number) {
  const issues: string[] = [];
  if (overrides !== undefined && !isRecord(overrides)) {
    return { inputs: null, issues: ['monsterInputs must be an object when supplied'] };
  }
  const supplied = isRecord(overrides) ? overrides : {};
  const reductions = supplied.defenceReductions;
  if (reductions !== undefined && !isRecord(reductions)) {
    issues.push('monsterInputs.defenceReductions must be an object');
  }
  const inputs = {
    ...INITIAL_MONSTER_INPUTS,
    ...supplied,
    monsterCurrentHp: supplied.monsterCurrentHp === undefined ? monsterHp : supplied.monsterCurrentHp,
    defenceReductions: {
      ...INITIAL_MONSTER_INPUTS.defenceReductions,
      ...(isRecord(reductions) ? reductions : {}),
    },
  };
  for (const key of [
    'toaInvocationLevel', 'toaPathLevel', 'partyMaxCombatLevel', 'partySumMiningLevel',
    'partyMaxHpLevel', 'partySize', 'monsterCurrentHp',
  ]) {
    const value = inputs[key as keyof typeof inputs];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      issues.push(`monsterInputs.${key} must be a non-negative number`);
    }
  }
  if (!Number.isInteger(inputs.partySize) || inputs.partySize < 1) {
    issues.push('monsterInputs.partySize must be a positive integer');
  }
  if (typeof inputs.isFromCoxCm !== 'boolean') issues.push('monsterInputs.isFromCoxCm must be boolean');
  return { inputs: issues.length ? null : inputs, issues };
}

export interface OsrsHubCalculationRequest {
  player: Partial<Player> & { equipment?: Partial<PlayerEquipment> };
  monsterId: number;
  monsterInputs?: Partial<Monster['inputs']>;
}

export type OsrsHubCalculationResult =
  | {
    status: 'calculated';
    result: {
      monster: {
        id: number;
        name: string;
      };
      dps: number;
      maxHit: number;
      accuracy: number;
      attackRoll: number;
      npcDefenceRoll: number;
      attackSpeed: number;
      issues: unknown[];
    };
    issues: [];
  }
  | {
    status: 'review-required';
    result: null;
    issues: string[];
  };

/**
 * Calculate one player-vs-NPC scenario using the actual engine calculator.
 * Equipment bonuses and attack speed are recalculated from canonical gear.
 */
export function calculateOsrsHubScenario(
  request: OsrsHubCalculationRequest,
): OsrsHubCalculationResult {
  const issues: string[] = [];
  if (!isRecord(request)) {
    return { status: 'review-required', result: null, issues: ['request must be an object'] };
  }
  if (!Number.isInteger(request.monsterId) || request.monsterId <= 0) {
    return { status: 'review-required', result: null, issues: ['monsterId must be a positive canonical monster ID'] };
  }
  const source = request.player;
  if (!isRecord(source)) {
    return { status: 'review-required', result: null, issues: ['player must be an engine-compatible player object'] };
  }
  if (typeof source.name !== 'string' || !source.name.trim()) issues.push('player.name is required');
  validateSkills(source.skills, 'player.skills', issues);
  validateSkills(source.boosts, 'player.boosts', issues);
  if (!isRecord(source.style)
    || typeof source.style.name !== 'string'
    || !['stab', 'slash', 'crush', 'magic', 'ranged', null].includes(source.style.type as string | null)
    || !(source.style.stance === null || typeof source.style.stance === 'string')) {
    issues.push('player.style must be a valid engine combat style object');
  }
  if (!Array.isArray(source.prayers)) issues.push('player.prayers must be an array');
  if (!isRecord(source.buffs)) issues.push('player.buffs must be an object');
  if (source.spell !== null && source.spell !== undefined && !isRecord(source.spell)) {
    issues.push('player.spell must be an engine spell object or null');
  }
  if (!isRecord(source.equipment)) issues.push('player.equipment must be an object of equipment slot IDs');
  const suppliedEquipment: JsonRecord = isRecord(source.equipment) ? source.equipment : {};
  const equipment = {} as PlayerEquipment;
  for (const slot of EQUIPMENT_SLOTS) {
    equipment[slot] = resolveEquipment(suppliedEquipment[slot], slot, issues);
  }
  for (const slot of Object.keys(suppliedEquipment)) {
    if (!EQUIPMENT_SLOTS.includes(slot as Slot)) issues.push(`player.equipment has unknown slot: ${slot}`);
  }

  const canonicalMonster = getMonsters().find((monster) => monster.id === request.monsterId);
  if (!canonicalMonster) issues.push(`monster ID ${request.monsterId} was not found in the engine monster dataset`);
  if (issues.length || !canonicalMonster) {
    return { status: 'review-required', result: null, issues };
  }

  const inputResult = buildMonsterInputs(request.monsterInputs, canonicalMonster.skills.hp);
  issues.push(...inputResult.issues);
  if (issues.length || !inputResult.inputs) {
    return { status: 'review-required', result: null, issues };
  }

  const monster: Monster = { ...canonicalMonster, inputs: inputResult.inputs as Monster['inputs'] };
  const player = {
    ...source,
    name: source.name as string,
    style: source.style as Player['style'],
    skills: source.skills as Player['skills'],
    boosts: source.boosts as Player['boosts'],
    equipment,
    prayers: source.prayers as Player['prayers'],
    buffs: source.buffs as Player['buffs'],
    spell: (source.spell ?? null) as Player['spell'],
    bonuses: {
      str: 0,
      ranged_str: 0,
      magic_str: 0,
      prayer: 0,
    },
    offensive: {
      stab: 0,
      slash: 0,
      crush: 0,
      magic: 0,
      ranged: 0,
    },
    defensive: {
      stab: 0,
      slash: 0,
      crush: 0,
      magic: 0,
      ranged: 0,
    },
    attackSpeed: 4,
  } as Player;

  const equipmentBonuses = calculateEquipmentBonusesFromGear(player, monster);
  player.bonuses = equipmentBonuses.bonuses;
  player.offensive = equipmentBonuses.offensive;
  player.defensive = equipmentBonuses.defensive;
  player.attackSpeed = calculateAttackSpeed(player, monster);

  const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: player.name });
  const distribution = calc.getDistribution();
  const dps = calc.getDps();
  const maxHit = distribution.getMax();
  const accuracy = calc.getHitChance();
  const attackRoll = calc.getMaxAttackRoll();
  const npcDefenceRoll = calc.getNPCDefenceRoll();

  if (![dps, maxHit, accuracy, attackRoll, npcDefenceRoll, player.attackSpeed].every(Number.isFinite)) {
    return {
      status: 'review-required',
      result: null,
      issues: ['The engine returned a non-finite combat result; the scenario was not accepted.'],
    };
  }

  return {
    status: 'calculated',
    issues: [],
    result: {
      monster: { id: monster.id, name: monster.name },
      dps,
      maxHit,
      accuracy,
      attackRoll,
      npcDefenceRoll,
      attackSpeed: player.attackSpeed,
      issues: calc.userIssues,
    },
  };
}
