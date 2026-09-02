---
package: '@flighthq/lighting'
status: partial
score: 52
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/lighting

## Verdict

**partial -- 52/100.** The light-type taxonomy is complete (all six punctual/ambient types plus Environment), the descriptor constructors are well-modeled, and the analysis/culling primitives are functional and tested. However, the prior review scored 88 against capabilities the package does not actually have. This review, verified against the live source as of 2026-09-02, finds: no `enabled` or `decay` fields on any light type, no `intensityUnit` field on any light descriptor, no per-light photometric accessors (`getDirectionalLightLux`, `getPointLightCandela`, etc.), no `setSpotLightBlend`, no probe descriptors, and no shadow-quality fields beyond the basics. The package has a solid foundation of descriptors and value-level analysis, but falls short of what a mature lighting data layer requires. Several of the charter's decided-in-scope items (shadow descriptor expansion, forward-budget priority/layer fields, probe descriptors) are not yet implemented.

## Status-doc verification

The 2026-08-08 status rewrite is accurate against the current source. Every claim was re-verified:

- `LightUnit` exists in `types/src/LightUnit.ts` (union + four constants); `lightIntensity.ts` is the sole consumer. No light descriptor carries an `intensityUnit` field -- confirmed absent from all seven type definitions in `types/src/`. Status correctly flags this.
- No `enabled` or `decay` field on any light type -- confirmed absent from `AmbientLight.ts`, `HemisphereLight.ts`, `DirectionalLight.ts`, `PointLight.ts`, `SpotLight.ts`, `AreaLight.ts`, `Environment.ts` in `types/src/`. Status correctly flags this.
- No `spotBlend` or `setSpotLightBlend` anywhere -- confirmed by searching `packages/`. Status correctly flags this.
- `getLightLuminance` uses a structural cast (`light as { color?: number; intensity?: number }`) at `lightAnalysis.ts:103` rather than dispatching on `kind`. Status correctly flags this.
- No `LightProbe` or `ReflectionProbe` types anywhere in `types/src/`. Status correctly flags this.
- `lightIntensity.ts` exports exactly three functions: `applyLightExposure` (line 10), `convertLightIntensity` (line 19), `getLightLinearIntensity` (line 37). No per-light photometric accessors exist. Status correctly flags this.

## Present capabilities

**Light-type descriptors** (7 source files, 7 test files) -- `create*`/`clone*` pairs over plain entity data, all defaulting to opaque white `0xffffffff` at unit intensity:

- `ambientLight.ts`: `createAmbientLight`, `cloneAmbientLight`. Fields: `color`, `intensity`, `kind`.
- `hemisphereLight.ts`: `createHemisphereLight`, `cloneHemisphereLight`. Fields: `skyColor`, `groundColor`, `intensity`, `kind`.
- `directionalLight.ts`: `createDirectionalLight`, `cloneDirectionalLight`, `setDirectionalLightDirection`, `setDirectionalLightTarget`. Fields: `color`, `intensity`, `direction`, `castsShadow`, `shadowBias`, `normalBias`, `pcfRadius`, `kind`.
- `pointLight.ts`: `createPointLight`, `clonePointLight`. Fields: `color`, `intensity`, `position`, `range`, `castsShadow`, `shadowBias`, `normalBias`, `pcfRadius`, `kind`.
- `spotLight.ts`: `createSpotLight`, `cloneSpotLight`, `setSpotLightCone`, `getSpotLightConeDegrees`, `setSpotLightDirection`, `setSpotLightTarget`. Fields: `color`, `intensity`, `position`, `direction`, `range`, `innerConeCos`, `outerConeCos`, `castsShadow`, `shadowBias`, `normalBias`, `pcfRadius`, `kind`. Cone stored as precomputed cosines with degree-based authoring API; reciprocal round-trip via `getSpotLightConeDegrees`.
- `areaLight.ts`: `createAreaLight`, `cloneAreaLight`, `setAreaLightOrientation`. Fields: `color`, `intensity`, `position`, `direction`, `right`, `up`, `range`, `castsShadow`, `shadowBias`, `normalBias`, `pcfRadius`, `kind`. Orientation setter preserves half-extent lengths while updating axis directions.
- `environment.ts`: `createEnvironment`, `cloneEnvironment`. Fields: `environment` (cubemap texture, alias-shared), `intensity`, `kind`. No `color` field.

**Photometric intensity seam** (`lightIntensity.ts`, 3 functions):

- `applyLightExposure(intensity, ev)`: EV-stop exposure scaling (`intensity * 2**ev`).
- `convertLightIntensity(fromUnit, toUnit, value)`: unit-to-unit conversion pivoting through the renderer's linear scale. Round-trips correctly.
- `getLightLinearIntensity(unit, value)`: maps a photometric unit value to the dimensionless linear multiplier the shaders expect. Anchored at 100,000 physical units = linear 1.0 for Lux and Candela; Lumen derived through the isotropic 4*PI identity.

All three are generic helpers operating on detached unit/value pairs, not on light descriptors directly (the `intensityUnit` field that would connect them to a descriptor does not exist on any light type).

**Analysis and culling** (`lightAnalysis.ts`, 5 functions):

- `getLightInfluenceBounds(out, light)`: writes the world-space influence bounding sphere. Sentinel `radius = -1` for non-spatial or infinite-range lights. Kind-dispatched through if/else chains on the seven known kinds.
- `getLightLuminance(light)`: BT.709 linear-light luminance of `color * intensity`. Uses a structural cast to read `color` and `intensity`; returns 0 for lights without a `color` field (e.g., `Environment`).
- `hasLightInfluenceOnBounds(light, bounds)`: sphere-sphere overlap test for spatial lights; always true for non-spatial. Allocation-free and re-entrant (prior module-level scratch sphere was removed).
- `isLightCastingShadow(light)`: returns `false` for non-shadow-capable types (ambient, hemisphere, environment); uses `'castsShadow' in light && light.castsShadow === true` to handle open custom light kinds safely, returning strict `boolean` in all cases.
- `getLightContributionAtBoundingSphere(light, bounds)`: estimates radiance contribution of a PointLight or SpotLight at a bounding sphere. Matches the forward shader's inverse-square falloff with glTF/UE4 range window, plus smoothstep cone attenuation for spots. Used by the forward-budget selector.

**Forward-budget selection** (`sceneForwardLights.ts`, 1 function):

- `selectScene3DForwardLights(out, lights, bounds)`: selects the strongest point and spot contributors for one object's forward-light budget. Each family independently capped at `MAX_FORWARD_LIGHTS` (4). Ranking uses `getLightContributionAtBoundingSphere`; stable input-order tiebreaking; zero-contribution lights omitted. Output reuses mutable arrays. Scratch arrays at module bottom isolate read/write phases for alias safety. Point indices are non-negative, spot indices use bitwise complement for cross-family deduplication.

**Scene lights constructor** (`sceneLights.ts`, 1 function):

- `createScene3DLights(options?)`: constructs a `Scene3DLights` draw-argument with every absent slot filled (singles to `null`, arrays to `[]`), preventing the `undefined.direction` crash from bare object literals.

**Test coverage**: 97 test cases across 11 test files, 31 `describe` blocks mirroring all 31 exported functions. Coverage is thorough: alias-safety tests, zero-length input edge cases, round-trip tests for cone degrees, sRGB gamma-decode verification in luminance, open custom light kind handling in `isLightCastingShadow`, and forward-selection alias/deduplication tests.

**Package hygiene**: `sideEffects: false` declared. Two blessed export lanes (`.` in `index.ts`, `./contract` in `contract.ts`). Dependencies only on `@flighthq/color`, `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types`. No top-level side effects. No rendering. 7 downstream consumers (`render`, `scene3d`, `scene3d-gl`, `scene3d-wgpu`, `scene3d-formats`, `scene-document`, `sdk`).

## Gaps

Measured against what a mature real-time lighting data layer provides and against the charter's decided-in-scope items:

1. **No `enabled` field on any light type.** A packer cannot skip a disabled light without removing it from the list. This is a basic authoring primitive that every engine provides.

2. **No `decay` / falloff exponent field.** No way to control attenuation falloff curve per light. There is no `getLightAttenuation(distance, light)` for CPU-side attenuation queries either.

3. **No `intensityUnit` field on light descriptors.** `LightUnit` and the three conversion functions exist but are disconnected from the lights themselves. A unit's only connection to a light is whatever the caller tracks externally. Per-light getters/setters (`getDirectionalLightLux`, `getPointLightCandela`, `setSpotLightLumens`, etc.) do not exist.

4. **No spot penumbra blend.** Neither `spotBlend` field nor `setSpotLightBlend` function exists. The cone falloff is determined entirely by the inner/outer cosine pair with no separate blend control.

5. **Shadow descriptor is thin.** Only `castsShadow`, `shadowBias`, `normalBias`, and `pcfRadius`. Missing: `shadowMapSize` (per-light override), `shadowNear`/`shadowFar`, `shadowStrength`, and directional CSM cascade config (`cascadeCount`, `cascadeSplits`). The charter's Decision #1 (2026-07-03) says shadow descriptor expansion is in scope.

6. **No forward-budget priority or layer fields.** `selectScene3DForwardLights` exists and works, but punctual descriptors carry no `priority` or `layerMask` for pre-contribution-ranking filtering. The charter's Decision #2 (2026-07-03) says forward-budget selection is in scope; the function exists but the policy knobs do not.

7. **No probe descriptors.** No `LightProbe` (L2 SH irradiance + position) or `ReflectionProbe` (local cubemap + box-projection bounds). The charter's Decision #3 (2026-07-03) says light-probe / SH irradiance descriptors are in scope.

8. **No area-light photometric helper.** `getAreaLightLuminance`/`setAreaLightLuminance` need the emitting area, which depends on the unresolved question of whether `right`/`up` half-extent length or a separate width/height pair is the source of truth.

9. **No IES profile support.** No `IesProfile` type, no `@flighthq/lighting-formats` neighbor.

10. **No sun/sky model.** No `createDirectionalLightFromSun` or physical sun/sky generator.

11. **`getLightLuminance` uses structural cast instead of kind dispatch.** At `lightAnalysis.ts:103`, `light as { color?: number; intensity?: number }` bypasses the discriminated-union pattern the rest of the package uses. Returns 0 for `Environment` (no `color` field) indistinguishably from a genuinely black light.

12. **`setSpotLightCone` does not enforce the inner <= outer invariant.** The function writes both cosines straight through (`spotLight.ts:60-63`); the invariant `innerConeCos >= outerConeCos` holds only when the caller passes `innerDegrees <= outerDegrees`. The comment correctly states "callers are responsible for ordering their inputs," but no guard or swap-clamp exists.

13. **`createDirectionalLight` does not normalize supplied direction.** It clones the vector as-is (`directionalLight.ts:29`). Normalization only happens through `setDirectionalLightDirection`. A caller passing an un-normalized direction to the constructor gets an un-normalized direction stored, which the renderer may not handle correctly.

## Charter contradictions

None. The charter is well-developed with clear North-star principles, boundaries, and decisions. The package is consistent with every stated principle:

- **North star #1** (descriptors and value analysis only, never a solver): every function is a plain entity constructor, a value-level accessor/mutator, or cheap analysis math. No per-fragment attenuation, no GPU buffer packing, no shading passes.
- **North star #2** (types-first against `@flighthq/types`): all light types, `LightUnit`, `Scene3DLightBlock`, `Scene3DLights`, `Scene3DForwardLightSelection`, `SpotLightConeAngles` live in `@flighthq/types`. The package exports only functions.
- **North star #3** (explicit photometric normalization): `convertLightIntensity` and `getLightLinearIntensity` state their reference normalization and geometry-free assumption. Documented in source comments.
- **North star #4** (explicit allocation, alias-safe out-params, sentinels not throws): `create*`/`clone*` allocate and deep-clone vectors; mutators read inputs into locals before writing; `radius = -1` sentinel for infinite influence; no throws on bad input (zero-length direction left unchanged, not thrown).
- **North star #5** (strictly additive to 2D bundle): the package is a 3D-only dependency, not imported by any 2D package.

The charter's Decisions (#1-#4, dated 2026-07-03) declare shadow expansion, forward-budget selection, probe descriptors, and TS-leads-Rust-conforms as in scope. The forward-budget selector exists; the rest are gaps, not contradictions -- they are decided scope that has not yet been implemented.

## Contract and docs fit

**Contract conformance (good):**

- Types-first: all interfaces and enums live in `@flighthq/types`; `lighting` exports functions only.
- Full unabbreviated names: `createDirectionalLight`, `setSpotLightDirection`, `getLightContributionAtBoundingSphere`, `selectScene3DForwardLights` -- all self-identifying without context.
- Out-parameter pattern: `getLightInfluenceBounds(out, light)`, `getSpotLightConeDegrees(out, source)`, `setSpotLightCone(out, inner, outer)` -- `out` first, source second.
- Sentinels not throws: `radius = -1` for infinite influence, zero-length direction left unchanged rather than thrown.
- Two blessed export lanes: `index.ts` (public) and `contract.ts` (full surface for intra-SDK). Public lane lists 31 named exports, no `export *`.
- `sideEffects: false` declared and honored. No top-level side effects, no renderer registration, no global mutation.
- `Readonly<T>` used on all input parameters.
- Entity-based: all `create*` functions return Entity via `createEntity`.
- Alias safety: documented and tested where it matters (out-param functions, `selectScene3DForwardLights`).

**Candidate doc revisions (the user's gate):**

- The **Package Map** in `AGENTS.md` lists `lighting` under "3D data" -- this is correct and already gives it first-class presence. The prior review's claim that `lighting` appeared only in `rust/index.md` is stale; the Package Map line exists.
- The prior review's `ingested` list references `reviews/depth/lighting.md` and `reviews/maturation/depth/lighting.md` -- these were part of the removed prior pipeline (per `index.md`, removed 2026-07-03). The review should not cite removed sources.
- The prior review claims many features that do not exist in source (`enabled`, `decay`, `intensityUnit`, `setSpotLightBlend`, ten per-light photometric getters/setters, `createColorFromKelvin` as a lighting export). Its score of 88/solid reflected a package state that never existed on disk.

## Candidate open directions

The charter already carries 10 well-articulated open directions that cover most of the right questions. No new candidate directions are needed beyond what the charter already identifies. The charter's open directions #1-#10 remain unresolved and are accurately scoped.
