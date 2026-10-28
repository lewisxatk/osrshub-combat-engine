# OSRS Hub calculation API

This route exposes the upstream GPL-3.0 calculator as an authenticated Next.js API endpoint at `POST /api/osrshub-calculate`.

## Configuration

Set `OSRSHUB_CALC_API_KEY` as a server-side environment secret in the calculator deployment. Send it only from a trusted server-to-server caller using the `Authorization: Bearer <key>` header. Never put this key in Vite client variables, browser code, or a public repository.

If the secret is absent, the route returns `503`; invalid credentials return `401`. Only POST is accepted. The route does not log request bodies.

## Request contract

```json
{
  "player": "<complete engine-native Player object>",
  "monster": "<complete engine-native Monster object>"
}
```

The placeholders above describe typed objects, not literal strings. The caller must provide canonical engine equipment records, calculated equipment bonuses, style, skills and boosts, prayers/buffs, and a canonical monster record with its required inputs. OSRS Hub's current adapter envelope (item IDs + skill levels) is not sufficient by itself; the canonical data/player builder is a separate integration step.

## Success response

```json
{
  "ok": true,
  "engine": "weirdgloop-osrs-dps-calc",
  "metrics": {
    "dps": 0,
    "maxHit": 0,
    "accuracy": 0,
    "maxAttackRoll": 0,
    "npcDefenceRoll": 0,
    "expectedDamage": 0,
    "attackSpeedTicks": 0,
    "ttkSeconds": 0
  }
}
```

Numbers above are schema examples, not calculated game results. Errors use `{ "ok": false, "error": "..." }`. Invalid or unsupported inputs fail closed rather than receiving fabricated metrics.

## Important limitations

- This endpoint does not itself deploy the service or connect the OSRS Hub website.
- It expects engine-native objects; do not forward untrusted browser-supplied bonuses as authoritative. The production caller should construct/validate those objects from canonical engine data.
- The key is a basic service-to-service gate, not a substitute for hosting-level rate limits and monitoring.
- Special-attack support varies by weapon; this endpoint currently calculates the standard player-vs-NPC calculation, not a guaranteed special-attack comparison.
- Preserve the original Weird Gloop GPL-3.0 license and notices when deploying or distributing this engine.
