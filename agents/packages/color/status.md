# color — Status

Continuity log for `@flighthq/color`. See [charter](charter.md).

## 2026-07-17 — DELIVERED & REVIEWED (builder2, parcel builder2-71118ef7)

`@flighthq/color` extracted + Phong→PBR helper. `npm run check` exit 0 (129 pkgs); bundle strictly
smaller everywhere (−0.3%…−1.0% across 23 example/backend combos). Reviewed against the diff by `review` — approved, no changes requested. Decisions as actually made (some diverged from the charter's guesses — recorded here as the source of truth):

- **Package:** bedrock leaf, dep `@flighthq/types` only, `sideEffects:false`, single `.` entry. `materials/color.ts` moved + concept-split into 8 files (srgbTransfer, packColor, hslColor, hsvColor, luminance, oklab, lerpColor, premultiplyColorAlpha) + colorFromKelvin. Names preserved.
- **`LinearColor` stays in `@flighthq/types`**; color re-exports it (via packColor.ts) so consumers get the type + fns from one import.
- **Canonical sRGB transfer = the UNCLAMPED form** (`srgbChannelToLinear`/`linearChannelToSrgb`, formerly private in materials, now public). Clamping is a caller concern.
- **Effects de-dup — the "duplication" was DEAD CODE.** `effects/colorScienceMath.ts`'s 8 exports had zero internal callers and zero importers. So: OkLab moved to color renamed out-first + space-explicit (`computeRgbToOklab`→`linearRgbToOklab`, `computeOklabToRgb`→`oklabToLinearRgb`), Rec709/Rec2020 weights moved verbatim, the sRGB/HSL duplicates deleted. Effects gained NO color dep.
- **Kelvin moved WHOLESALE to color** (charter guessed "split pure math from a light wrapper" — but `createColorFromKelvin` had zero callers and zero `LightUnit`/intensity coupling, i.e. no wrapper existed). Lighting drops the export.
- **particles/surface color LEFT as-is** (justified): particles `curve.ts` HSV is raw-float-triple + allocating (a different shape from color's packed/out-param HSV — folding = rewrite, not de-dup); surface had no sRGB/pack reimplementation to fold.
- **Consumer re-point (58 files):** render, scene-gl (~18), scene-wgpu (~18), displayobject-canvas/dom/gl/wgpu. displayobject-* had `materials` as an ORPHAN dep (only `computeRgbHexString`) → **dropped `materials` dep from those 4** (dependency-hygiene win). materials keeps color dep (pbrMaterials uses `unpackColorToLinear`). color added to the sdk barrel.
- **Phong→PBR (`@flighthq/materials/phongToPbr.ts`)** — decomposed into directly-callable free fns: `getPbrRoughnessFromPhongShininess` = clamp(√(2/(shininess+2))); `getPbrMetallicFromPhongSpecular` = conservative dielectric-default heuristic; `getPhongToPbrLightExposure` = **log2(π) ≈ 1.651 EV**; `convertPhongToStandardPbrMaterial(phong, opts?)` composes them (baseColor=diffuse, normal passthrough, opts override). The **anti-too-dark anchor** is grounded in Flight's actual shader (PBR diffuse = kd·albedo/π at glPbrPrelude:390; classic Phong has no /π) → migrated scene is ~π× too dark unless light intensity is scaled ×π via `applyLightExposure(intensity, getPhongToPbrLightExposure())` (#7). It is a per-LIGHT scale (can't bake into one material without clamping albedo). F0/reflectance kept in materials, not color.
- **Public API intentionally shrank:** materials lost the color family, effects lost the science math, lighting lost `createColorFromKelvin` — all now under `@flighthq/color`.

Commits (on builder2's branch): color pkg, color kernel move + effects de-dup, kelvin move, phongToPbr. Size baselines will need regenerating at integration (several size-affecting branches merging).

## State: DELIVERED (superseded plan below is historical)

Original plan (2026-07-17):

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
