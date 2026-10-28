import type { NextApiRequest, NextApiResponse } from 'next';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import type { Player } from '@/types/Player';
import type { Monster } from '@/types/Monster';

type Success = {
  ok: true;
  engine: 'weirdgloop-osrs-dps-calc';
  metrics: {
    dps: number;
    maxHit: number;
    accuracy: number;
    maxAttackRoll: number;
    npcDefenceRoll: number;
    expectedDamage: number;
    attackSpeedTicks: number;
    ttkSeconds: number;
  };
};

type Failure = { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasPlayerShape(value: unknown): value is Player {
  if (!isRecord(value) || !isRecord(value.skills) || !isRecord(value.equipment)
    || !isRecord(value.bonuses) || !isRecord(value.offensive) || !isRecord(value.defensive)
    || !isRecord(value.boosts) || !isRecord(value.buffs) || !isRecord(value.style)) return false;
  const skillKeys = ['atk', 'str', 'def', 'hp', 'ranged', 'magic', 'prayer', 'mining', 'herblore', 'farming'];
  return skillKeys.every((key) => Number.isFinite(Number(value.skills[key])))
    && Array.isArray(value.prayers)
    && typeof value.name === 'string';
}

function hasMonsterShape(value: unknown): value is Monster {
  if (!isRecord(value) || !isRecord(value.skills) || !isRecord(value.offensive)
    || !isRecord(value.defensive) || !isRecord(value.inputs) || !isRecord(value.immunities)) return false;
  return Number.isInteger(Number(value.id)) && typeof value.name === 'string'
    && Number.isFinite(Number(value.skills.hp)) && Number(value.skills.hp) > 0
    && Array.isArray(value.attributes);
}

export default function handler(req: NextApiRequest, res: NextApiResponse<Success | Failure>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed; use POST.' });
  }

  const expectedKey = process.env.OSRSHUB_CALC_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ ok: false, error: 'Calculation API is not configured.' });
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${expectedKey}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorised.' });
  }

  if (!isRecord(req.body) || !hasPlayerShape(req.body.player) || !hasMonsterShape(req.body.monster)) {
    return res.status(400).json({
      ok: false,
      error: 'Expected engine-native player and monster objects; website item/NPC IDs alone are not sufficient.',
    });
  }

  try {
    const calc = new PlayerVsNPCCalc(req.body.player, req.body.monster, {
      loadoutName: 'OSRS Hub API',
    });
    const metrics = {
      dps: calc.getDps(),
      maxHit: calc.getDistribution().getMax(),
      accuracy: calc.getHitChance(),
      maxAttackRoll: calc.getMaxAttackRoll(),
      npcDefenceRoll: calc.getNPCDefenceRoll(),
      expectedDamage: calc.getExpectedDamage(),
      attackSpeedTicks: calc.getExpectedAttackSpeed(),
      ttkSeconds: calc.getTtk(),
    };
    if (!Object.values(metrics).every(Number.isFinite)) {
      return res.status(422).json({ ok: false, error: 'The calculator returned a non-finite result for this input.' });
    }
    return res.status(200).json({ ok: true, engine: 'weirdgloop-osrs-dps-calc', metrics });
  } catch {
    return res.status(422).json({
      ok: false,
      error: 'The calculator could not process this player/monster combination. Check canonical engine data and inputs.',
    });
  }
}
