---
id: lighting
title: '@flighthq/lighting'
type: depth
target: lighting
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/lighting.md
  - tools/agents/docs/reviews/depth/lighting.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 70/100. The light-_type_ taxonomy is complete and well-modeled; what is missing is depth _inside_ each descriptor (photometric units, shadow config, reciprocal accessors, culling helpers), not new light types.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The first genuinely useful pass: close the reciprocity, validation, and falloff gaps a user hits immediately when building a lit scene. No new types, only fields + free functions.

- **Reciprocal cone accessors.** `getSpotLightConeDegrees(out: Vector3Like, source: Readonly<SpotLight>)` (or a small `{ inner, outer }` out-struct) so `create → inspect` round-trips without manual `Math.acos`. Closes the documented asymmetry where `createSpotLight` takes degrees but nothing reads them back.
- **Cone validation/clamp.** `setSpotLightCone` (and `createSpotLight`) clamp so `innerConeCos >= outerConeCos` holds — swap inputs or clamp inner to outer rather than silently producing an inverted cone. Document the clamp; do not throw (this is expected-input handling, not misuse).
- **Direction/position mutators with out-params.** `setDirectionalLightDirection(out, x, y, z)`, `setSpotLightDirection`, `setAreaLightOrientation(out, direction, right, up)`. These normalize where the renderer expects normalized input (directional/spot `direction`). Today the only way to re-aim a light is to rebuild it.
- **Look-at helper.** `setDirectionalLightTarget(out, fromX, fromY, fromZ, toX, toY, toZ)` and `setSpotLightTarget(out, targetX, targetY, targetZ)` — derive `direction` from a target point, the most common authoring gesture. Free functions, write into the light's `direction`, alias-safe.
- **Documented falloff/decay model.** Add a `decay` field (inverse-square exponent, default `2`) to `PointLight`/`SpotLight`/`AreaLight` in `@flighthq/types`, and document the exact attenuation curve the renderer applies (smooth windowed inverse-square to `range`). This is the single most-requested missing piece: `range` is currently a bare cutoff with no defined curve.
- **Color-temperature helper.** `createColorFromKelvin(kelvin: number): number` returning packed sRGB-albedo RGBA — a near-universal convenience (e.g. 6500 K → white). Lives here as the lighting-domain color helper, consistent with the packed-int convention.
- **`enabled` flag.** Add `enabled: boolean` (default `true`) to every light descriptor so a packer can skip a light without removing it. Cheap, and a precondition for the forward-budget prioritization at Silver.
- **Rust parity for all of the above** in `flighthq-lighting` (snake_case mirrors: `get_spot_light_cone_degrees`, `set_directional_light_target`, `create_color_from_kelvin`, `decay`/`enabled` fields). The crate is already at parity, so each TS addition ships with its Rust twin in the same pass.

### Silver

Competitive with a good real-time lighting library (three.js, Babylon, Filament's data layer): photometric units, real shadow configuration, culling metadata, and probe-based irradiance.

- **Photometric intensity units.** Add a `LightUnit` `*Kind`-style string set (e.g. `'Candela'`, `'Lumen'`, `'Lux'`, `'Unitless'`) in `@flighthq/types` and an `intensityUnit` field, plus conversion free functions: `getPointLightLumens`/`setPointLightLumens`, `getSpotLightCandela`, `getDirectionalLightLux`. Mirrors glTF `KHR_lights_punctual` and three.js `physicallyCorrectLights`. Keep `intensity` as the stored scalar; units are an interpretation seam.
- **Spot penumbra profile.** Add `spotBlend`/penumbra exponent (smoothing the inner→outer falloff beyond the raw cosine lerp), with `setSpotLightBlend(out, blend)`. Matches Blender/three.js spot `penumbra`.
- **Real shadow descriptor.** Promote shadow params into a richer shape (still flat fields, not a nested object unless it cleans the surface): `shadowMapSize`, `shadowNear`, `shadowFar`, `shadowStrength`/`shadowOpacity`, and for `DirectionalLight` cascaded-shadow-map config — `cascadeCount` + `cascadeSplits` (a small fixed array) with a `setDirectionalLightCascades(out, count, lambda)` helper using the standard log/uniform split blend (`lambda`). Point-light cubemap-face handling is implicit in `shadowMapSize` but document the 6-face cost.
- **Forward-budget prioritization.** Add `priority: number` and a `layerMask: number` (bitmask) to punctual lights so a packer can select which lights survive when over `MAX_FORWARD_LIGHTS`. Add a sort/select free function: `selectForwardLights(out: Light[], lights: Readonly<Light[]>, position, maxCount)` ranking by priority then influence at a point. This makes the documented budget actionable instead of caller-improvised.
- **Light-influence culling helpers.** `getLightInfluenceBounds(out: BoundingSphere, light)` (influence sphere from `position`+`range`, or infinite for directional/ambient), `getSpotLightInfluenceCone(out, light)`, and `hasLightInfluenceOnBounds(light, bounds): boolean`. These are the descriptor-side primitives a scene culler needs; returning a sentinel/`false` for non-spatial lights.
- **Light-probe / SH irradiance descriptor.** Add a `LightProbe` type (`LightProbeKind`) carrying 9-coefficient (L2) spherical-harmonic irradiance + a `position`, with `createLightProbe`/`cloneLightProbe` and `setLightProbeFromColor(out, color)` (constant ambient as SH0) to complete the IBL story alongside `Environment`. SH coefficients are a flat `Float32Array` (packing-friendly).
- **Reflection-probe placement descriptor.** A `ReflectionProbe` type referencing a `CubeTexture` plus `position`, `range`/box-projection bounds, and `intensity` — the local-IBL counterpart to the global `Environment`. Keeps the cubemap alias-shared (same GPU-aliasing rationale as `Environment`).
- **Analysis utilities.** `getLightLuminance(light): number` (perceptual luma of color×intensity), `isLightShadowCasting(light): boolean`, `getLightColorLinear(out, light)` (unpack to linear, the documented `@flighthq/materials` seam re-exposed as a convenience reader).
- **Cross-backend pack consistency tests.** Extend `SceneLightBlock`/`SceneLights` to the documented `MAX_FORWARD_LIGHTS` point/spot arrays, and add tests asserting the same descriptor set packs to an identical block under the std140/std430 layout — the consistency contract the renderers depend on.
- **Full Rust parity** for every Silver addition (units conversions, SH probe, cascade split helper, culling math), with conformance fingerprints where a packed block is produced.

### Gold

Authoritative / AAA — the canonical reference for a real-time lighting data layer. Exhaustive photometry, IES profiles, probe baking inputs, full edge/error handling, and proven 1:1 Rust conformance.

- **IES photometric profiles.** Add an `IesProfile` descriptor type and an `@flighthq/lighting-formats` neighbor package (the `-formats` importer pattern) with `parseIesProfile(text): IesProfile | null` (IESNA LM-63 `.ies` parser, returns `null` on malformed input) and `sampleIesProfile(profile, angle): number`. Attach via an optional `iesProfile` reference on `SpotLight`/`PointLight`. Keeps the parser out of the runtime bundle and tree-shakable.
- **Goniometric / textured spot cookies.** A `lightCookie: Texture | null` field + `LightCookie` descriptor for projected spot/area gobo textures (alias-shared, like `Environment`).
- **Full photometric model.** Exhaustive unit conversions among candela/lumen/lux/EV/nit with documented exact formulas, exposure (`EV100`) helpers (`getLightExposureValue`, `setLightFromExposure`), and a physically-based sky/sun model helper (`createDirectionalLightFromSun(elevation, azimuth, turbidity)`) producing color-temperature + intensity — the differentiator mature engines ship.
- **SH baking & probe inputs.** `projectCubeTextureToSphericalHarmonics(out, cubeTexture)` and `rotateSphericalHarmonics(out, sh, matrix)` — the irradiance-baking primitives that make `LightProbe` usable from an `Environment` without a separate tool. (CPU-side; GPU bake stays in render crates.)
- **Probe volumes / blending metadata.** A `LightProbeVolume` descriptor (grid bounds + probe spacing) and `blendLightProbes(out, a, b, t)` for irradiance interpolation across a volume — what large open-world engines expose.
- **Area-light shapes beyond rectangle.** `AreaLightShape` `*Kind` set (`'Rectangle'`, `'Disk'`, `'Tube'`/line, `'Sphere'`) with per-shape extent fields, completing the LTC area-light family.
- **Exhaustive edge/error handling.** Documented and tested behavior for zero/degenerate direction vectors (sentinel or documented normalization fallback), `range = 0`, inverted cones, NaN guards on conversions, and `enabled = false` packing. Sentinels for expected failure (`parseIesProfile` → `null`), throw only on genuine misuse.
- **Performance.** Pooled `acquire*`/`release*` for transient light arrays in the per-frame select/cull path; all analysis/culling helpers as out-param, allocation-free hot-loop-safe functions; SH math operating on flat `Float32Array` with no intermediate allocation.
- **Docs & examples.** A lighting cookbook section: forward-budget selection, CSM setup, IES import, probe baking from an `Environment`, and the unit-conversion reference table. A functional/visual test scene per light type and per shadow mode where a renderer backend exists to exercise them.
- **1:1 Rust conformance.** Every Gold addition mirrored in `flighthq-lighting` and `flighthq-lighting-formats`, with the IES parser, SH projection, and photometric conversions covered by ported assertion tests + parity-matrix cells, and any intentional TS↔Rust divergence recorded in the conformance map.

## Sequencing & effort

Recommended order, with dependencies and items to surface before acting.

1. **Bronze first — small, self-contained, high value (low effort).** Reciprocal cone accessor, cone clamp, direction/position/look-at mutators, `decay`, `enabled`, and `createColorFromKelvin` are all additive within `lighting` + a few new fields in `@flighthq/types`. No cross-package coordination beyond the header edits. Ship each with its Rust twin in the same pass (the crate is already at parity, so divergence here is the main risk to watch). Start with the header-layer field additions (`decay`, `enabled`) since later tiers build on them.

2. **Silver in two waves.**
   - _Wave A (independent):_ photometric units, spot blend, culling helpers (`getLightInfluenceBounds`, `hasLightInfluenceOnBounds`), and analysis utilities. These touch only `lighting` + `@flighthq/types`. The culling helpers need a `BoundingSphere`/`BoundingBox` type — **check whether one already exists in `@flighthq/types`/`@flighthq/geometry` and reuse it; if not, that type belongs in `@flighthq/geometry`, surface it as a dependency before starting.**
   - _Wave B (touches the pack path):_ `shadowMapSize`/cascade config, `priority`/`layerMask` + `selectForwardLights`, and the `LightProbe`/`ReflectionProbe` descriptors. These extend `SceneLights`/`SceneLightBlock` and have a **cross-package contract with the render crates (`render`, `scene-gl`/`scene-wgpu`)** — the packed std140/std430 layout and `MAX_FORWARD_LIGHTS` must move in lockstep. **Surface to the user before reshaping `SceneLightBlock`:** the descriptor fields are owned here, but the layout/budget decision is a render-package design decision, not a lighting-only one.

3. **Gold is the genuine frontier — larger, with a new neighbor package.** IES support requires the `@flighthq/lighting-formats` package (copy a nearby `-formats` package shape, run `npm run packages:check`). SH baking, probe volumes, the photometric sky model, and area-light shapes are each a meaningful unit; sequence IES + photometry first (most-requested), then probe baking/volumes, then exotic area shapes. The sun/sky model and EV/exposure helpers should be **design-reviewed against `@flighthq/materials`** (where the sRGB→linear and color-transform seam lives) to avoid duplicating tonemapping/exposure logic across package boundaries.

**Cross-package / design-decision items to surface (do not act on autonomously):**

- The `SceneLightBlock` / `MAX_FORWARD_LIGHTS` layout reshape (Silver Wave B) is a shared contract with the render crates — coordinate, do not unilaterally change the packed layout.
- Whether `BoundingSphere`/`BoundingBox` lives in `@flighthq/geometry` (likely) before the culling helpers (Silver Wave A) can land.
- The `@flighthq/lighting-formats` package creation (Gold) — confirm scope and the `-formats` split before adding a package.
- Exposure/tonemapping ownership boundary between `lighting` and `@flighthq/materials` (Gold photometry).

**Effort summary:** Bronze ≈ a focused session (additive fields + ~8 free functions + Rust twins). Silver ≈ several sessions, one of which is gated on the render-crate layout coordination. Gold ≈ a multi-session frontier with one new package and CPU baking math that needs careful conformance testing.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/lighting` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
