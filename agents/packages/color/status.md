# color — Status

Continuity log for `@flighthq/color`. See [charter](charter.md).

## State: chartered, build NOT started (2026-07-17)

Chartered in a direction session with the user, triggered by a real gap: converting sRGB samples for
PBR materials — specifically **setting the intensity when migrating Phong materials to PBR** — had no
discoverable home. Root cause: the color primitive already exists but is **mis-homed** inside
`@flighthq/materials/src/color.ts` (~25 exports) and **duplicated** in
`@flighthq/effects/src/colorScienceMath.ts` (second sRGB↔linear + HSL + OkLab + luminance weights),
with more scatter in `lighting`/`particles`/`surface`.

### Blessed decisions (see charter › Decisions)

- Extract a bedrock leaf `@flighthq/color`: move `materials/color.ts`, fold in the `effects`
  color-science duplication, re-point consumers (`scene-gl`, `materials`, `effects`, `lighting`,
  `particles`, `surface`). `LinearColor` stays in `@flighthq/types`.
- Dedicated package, NOT folded into `@flighthq/math` (distinct domain, 2D+3D reach).
- **Boundary:** the Phong→PBR intensity/appearance migration is a `@flighthq/materials` helper
  (`convertPhongToStandardPbrMaterial`, working name) built ON `color` + the `@flighthq/lighting`
  intensity conversion (issue #7) — NOT a color primitive. Paired follow-on; color lands first.

### v1 deliverables (from the charter)

1. `@flighthq/color` package (leaf: deps `@flighthq/types`, maybe `@flighthq/math`).
2. Canonical surface: pack/unpack, sRGB↔linear, HSL, HSV, OkLab, luminance/contrast, premultiply,
   lerp, hex — migrated from `materials/color.ts` and `effects/colorScienceMath.ts`.
3. Consumer re-point + effects de-dup; `packages:check` / `exports:check` clean.
4. (Paired follow-on, separate task) `materials` Phong→PBR migration helper on top of `color` + #7.

### Open before/at dispatch (charter › Open directions)

- Kelvin/blackbody split (pure spectral→RGB math → color?).
- Migration-helper signature + coupling to the #7 lighting-intensity helper (build together).
- Whether to fold `particles`/`surface` color math in now or later.

## No code exists yet. This is a scoped extraction, not greenfield — lift `materials/color.ts` intact, then de-dup and re-point.
