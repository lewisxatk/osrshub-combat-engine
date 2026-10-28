# OSRS Hub combat runtime — Cloudflare Worker

This Worker exposes the tested engine adapter at:

- `GET /health`
- `POST /api/calculate`

It is a separate deployment target. The upstream Next.js site remains a static
export; do not add a Next.js API route for this runtime.

## Validation before deployment

1. Run `npx wrangler deploy --dry-run` from the repository root.
2. Confirm the generated bundle fits the Cloudflare plan's script-size limit.
3. Set `ALLOWED_ORIGIN` to the exact production OSRS Hub origin.
4. Deploy manually with `npx wrangler deploy` only after the dry-run and
   account limits are confirmed.
5. Smoke-test `/health`, malformed input, invalid item/monster IDs, and a
   known-good combat scenario before connecting the website.

The checked-in origin is a placeholder, not confirmation that this hostname is
the live website. Change it before deployment. No deploy is triggered by CI.

## Request format

The calculation endpoint accepts JSON matching
`OsrsHubCalculationRequest` in `src/osrshub-runtime/calculate.ts`. The
player object must use engine-compatible skills, boosts, style, prayers, buffs,
spell, and equipment slot IDs. Equipment and monster data are resolved against
the engine's canonical datasets.

## Safety and provenance

- Keep request validation and the 64 KiB body limit.
- Do not return stack traces or internal engine details to callers.
- Do not accept client-supplied combat bonuses as authoritative.
- Preserve the upstream GPL-3.0 licence and provenance.
