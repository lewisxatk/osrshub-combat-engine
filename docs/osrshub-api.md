# OSRS Hub calculation runtime integration

## Current state

The upstream calculator is built as a static site with `output: 'export'`. Next.js API routes are not compatible with this export mode, so the calculator must not be exposed through a `src/pages/api` route in this repository. The first API-route attempt was removed to preserve the upstream build/deployment model.

The OSRS Hub website currently has a tested adapter boundary, but it does not yet execute real DPS calculations.

## Required next architecture step

Build a separate calculation service or a browser-compatible engine bundle, then connect it to OSRS Hub. Before selecting the runtime, verify the deployment target, canonical dataset sizes, dependency compatibility, and payload limits. Do not switch off static export or alter the upstream deployment workflow merely to make an API route compile.

## Input requirements

The calculator requires complete engine-native `Player` and `Monster` structures. The website adapter's IDs and skill levels are not sufficient. A trusted builder must resolve canonical item and monster records, equipment bonuses, attack style/speed, boosts, prayers, buffs, spells, monster defence/attributes and mechanic inputs.

Never accept client-supplied equipment bonuses as authoritative. Do not return estimated or fabricated DPS when data is missing.

## Validation gates

1. Reproduce the existing engine regression case for an empty player against an Abyssal demon (max hit 11, DPS approximately 0.658, attack roll 6848, NPC defence roll 12096, accuracy approximately 28.30%).
2. Add canonical item/monster resolver tests and melee, ranged and magic regression cases.
3. Verify supported/partial/unsupported special attacks and boss mechanics are surfaced honestly.
4. Test the chosen runtime under the real deployment target before connecting the Combat Studio UI.
5. Preserve the upstream GPL-3.0 licence and notices for copied/adapted code.

## Security note

If a separate server-side API is selected, use a server-side secret, rate limiting and monitoring. Never embed a shared API key in browser code or public Vite variables.
