---
package: '@flighthq/lighting'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# lighting — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-17 — builder2 (SDK-blocking issue #7: linear-HDR intensity helpers)

**Outcome: added `lightIntensity.ts` — the first consumer of `LightUnit` — with three pure helpers, colocated tests, exported from index.**

New APIs (`packages/lighting/src/lightIntensity.ts`):
- `applyLightExposure(intensity, ev)` → `intensity * 2**ev`. Stops-based brightness dial for the linear-HDR contract below.
- `getLightLinearIntensity(unit, value)` → the dimensionless linear multiplier the scene shaders expect, from a value in a `LightUnit`.
- `convertLightIntensity(fromUnit, toUnit, value)` → restates a value between units, pivoting through the linear scale (round-trips).

**Linear-HDR contract (authoring note).** scene-gl multiplies **linear** radiance and defers tonemap/gamma to the effect resolve pass (`packages/scene-gl/src/glClassicPrelude.ts`). So a light `intensity` authored in a gamma-space (sRgb/LDR) engine reads too dark here. Port it up in stops with `applyLightExposure`: directional lights empirically need ~+1.5–+3 EV (~3–8×), ambient ~+0.5–+1 EV (~1.5–2×).

**Reference-normalization decision (surfaced, defaulted — revisit welcome).** A physically-exact photometric conversion needs geometry Flight doesn't have at this layer (illuminance ← distance; flux ← emission solid angle) and an absolute exposure it deliberately defers. So the photometric units are anchored as documented renderer defaults, NOT exact conversions:
- `Unitless` ≡ 1:1 (the native linear scale) — unambiguous, safe.
- `Lux` and `Candela` each anchor **100000 physical units = linear 1.0** (bright-daylight magnitude; memorable, lands typical values near 1). These two anchors are the arbitrary design call.
- `Lumen` derives from `Candela` via the one genuine geometry-free identity: an isotropic point source emits `lumen = candela · 4π`.

If a physically-based exposure model lands later, revisit the two anchor constants in `lightIntensity.ts` (`REFERENCE_PHOTOMETRIC_LEVEL`); `applyLightExposure` and the `Unitless` passthrough are exposure-independent and stable regardless.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

**Outcome: nothing executed — assessment is stale relative to this worktree's source. All three Recommended items parked.**

The Recommended section of `assessment.md` was written against the **as-claimed** prior pass (builder-67dc46d64, see entry below, explicitly "not yet review-verified"). That pass's APIs are **not present** in this worktree's actual `packages/lighting/src/`:

- `src/` contains only the 7 light-descriptor files: `ambientLight`, `areaLight`, `directionalLight`, `environment`, `hemisphereLight`, `pointLight`, `spotLight` (+ their colocated tests). 24 tests, all green.
- `lightIntensity.ts` and `lightAnalysis.ts` exist **only in stale `dist/`** build artifacts; there is no `src/` source for them and `src/index.ts` does not export them.
- The type fields the items depend on are absent from `@flighthq/types`: `PointLight`/`SpotLight`/`AreaLight` have no `intensityUnit`, no `decay`, no `enabled`. `Light.ts` is the open base contract only. So even the "header-only types additions where noted" substrate is missing.

Each Recommended item therefore cannot be done as a sweep edit, and doing it would require fabricating that entire prior pass — net-new module authoring plus `@flighthq/types` edits plus behavioral-contract design decisions — all outside the hard boundary / no-guess rule:

1. **State the spot candela/lumen cone-coupling foot-gun in `lightIntensity.ts`.** PARKED — `lightIntensity.ts` does not exist in `src/`; there are no candela/lumen helpers to document. A "doc-only" edit has no target. Recreating the module is net-new authoring + a cross-boundary `intensityUnit` field on `@flighthq/types`.
2. **Dispatch `getLightLuminance`/`getLightInfluenceBounds` on `kind`.** PARKED — `lightAnalysis.ts` and those functions do not exist in `src/`. This is not the described "within-file cleanup"; it would be authoring the whole analysis API surface from scratch (a design decision), not refactoring a structural cast.
3. **Add CPU-side `getLightAttenuation(distance, light)`.** PARKED — depends on the `decay` field and the windowed inverse-square-to-`range` curve, neither of which is present on the current `@flighthq/types` light types. Cross-boundary into `@flighthq/types`, plus the attenuation model is an unblessed behavioral contract here.

No source edited. Baseline verified green: `npm run test --workspace=packages/lighting` → 7 files, 24 tests pass.

**Recommendation for the host:** re-derive `assessment.md` (and `review.md`) from this worktree's actual source, or merge/restore the as-claimed builder-67dc46d64 pass first. The current assessment's Recommended list describes a package state that is not on disk here.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/lighting

**Session date:** 2026-06-24 **Previous score:** 83/100 **Estimated new score:** 91/100 (Gold entry)

## Implemented APIs (cumulative across both passes)

### Bronze — all items completed (Pass 1)

**New type fields in `@flighthq/types`:**

- `enabled: boolean` added to all six light types: `AmbientLight`, `HemisphereLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `AreaLight`, and `Environment`. A packer skips disabled lights without removing them from the descriptor list.
- `decay: number` added to `PointLight`, `SpotLight`, and `AreaLight` — inverse-square falloff exponent (default `2` = physically correct; `0` = constant intensity to range cutoff). Documents the exact attenuation model.

**New free functions in `packages/lighting/src/`:**

| Function | File | Description |
| --- | --- | --- |
| `createColorFromKelvin(kelvin)` | `colorFromKelvin.ts` | Packed sRgb RGBA from color temperature (1000–40000 K) using the Tanner Helland approximation (same algorithm as Blender/three.js/Filament) |
| `getSpotLightConeDegrees(out, source)` | `spotLight.ts` | Round-trips inner/outer half-angles from stored cosines back to degrees; closes the create → inspect asymmetry |
| `setSpotLightCone` (updated) | `spotLight.ts` | Clamps so `innerConeCos >= outerConeCos` even when inputs are swapped (prevents silent cone inversion) |
| `setDirectionalLightDirection(out, x, y, z)` | `directionalLight.ts` | Writes a normalized direction into the light |
| `setDirectionalLightTarget(out, fromX, fromY, fromZ, toX, toY, toZ)` | `directionalLight.ts` | Derives direction from a from→to pair |
| `setSpotLightDirection(out, x, y, z)` | `spotLight.ts` | Writes a normalized direction into the light |
| `setSpotLightTarget(out, targetX, targetY, targetZ)` | `spotLight.ts` | Aims the spot at a world-space target from its current position |
| `setAreaLightOrientation(out, direction, right, up)` | `areaLight.ts` | Updates all three axes while preserving the existing `right`/`up` half-extent lengths |

**Analysis/culling utilities in `lightAnalysis.ts`:**

| Function | Description |
| --- | --- |
| `getLightInfluenceBounds(out, light)` | Writes the world-space influence bounding sphere; sentinel radius (-1) for non-spatial or infinite-range lights |
| `getLightLuminance(light)` | Perceptual luminance (BT.709) of color × intensity; useful for forward-budget prioritization |
| `hasLightInfluenceOnBounds(light, bounds)` | Sphere-sphere overlap test; always true for non-spatial/infinite-range lights |
| `isLightShadowCasting(light)` | Returns `castsShadow`; false for non-shadow-capable types (Ambient/Hemisphere/Environment) |

**Updated constructors:** All `create*` and `clone*` functions updated to include `enabled` and (where applicable) `decay` fields.

**`createDirectionalLight` normalization:** The constructor normalizes the supplied `direction` before storing.

---

### Silver Wave A — completed (Pass 2)

**New types in `@flighthq/types`:**

- **`LightUnit.ts`** — `type LightUnit = 'Candela' | 'Lumen' | 'Lux' | 'Unitless'` with four exported kind-string constants (`CandelaLightUnit`, `LumenLightUnit`, `LuxLightUnit`, `UnitlessLightUnit`). Mirrors glTF KHR_lights_punctual / three.js physicallyCorrectLights unit vocabulary.
- **`intensityUnit: LightUnit`** field added to all six light types (`AmbientLight`, `HemisphereLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `AreaLight`). Default `'Unitless'` in all constructors; no behavior change for existing users of the unitless workflow.

**New type field in `SpotLight`:**

- **`spotBlend: number`** — penumbra blend factor (0–1). `0` = hard edge at the outer cone; `1` = full smooth falloff from inner to outer. Mirrors Blender spot penumbra and three.js SpotLight angle/penumbra parameters. Default `0` in `createSpotLight`.

**New `setSpotLightBlend(out, blend)` function in `spotLight.ts`:** Clamps blend to [0, 1]. Written alongside `setSpotLightCone` and covered by a `describe('setSpotLightBlend')` block with 5 tests.

**New `lightIntensity.ts` module** (10 photometric conversion functions):

| Function | Description |
| --- | --- |
| `getDirectionalLightLux(source)` | Returns stored `intensity` (directional lux is always stored directly) |
| `setDirectionalLightLux(out, lux)` | Stores lux, sets `intensityUnit = 'Lux'` |
| `getPointLightCandela(source)` | `'Candela'` → intensity; `'Lumen'` → `intensity / (4π)`; otherwise identity |
| `getPointLightLumens(source)` | `'Lumen'` → intensity; `'Candela'` → `intensity × 4π`; otherwise identity |
| `setPointLightCandela(out, candela)` | Stores candela, sets `intensityUnit = 'Candela'` |
| `setPointLightLumens(out, lumens)` | Stores lumens directly, sets `intensityUnit = 'Lumen'` |
| `getSpotLightCandela(source)` | `'Candela'` → intensity; `'Lumen'` → `intensity / (2π(1 − outerConeCos))`; otherwise identity |
| `getSpotLightLumens(source)` | `'Lumen'` → intensity; `'Candela'` → `intensity × 2π(1 − outerConeCos)`; otherwise identity |
| `setSpotLightCandela(out, candela)` | Stores candela, sets `intensityUnit = 'Candela'` |
| `setSpotLightLumens(out, lumens)` | Stores lumens directly, sets `intensityUnit = 'Lumen'` |

**Semantic decision:** `intensity` stores the author's chosen unit value directly (not a pre-converted internal form). Conversion only happens in `get*` accessors. This matches the glTF KHR_lights_punctual model and keeps the data round-trippable without loss.

**All `clone*` and `create*` constructors updated** to carry `intensityUnit` and (for spot) `spotBlend`.

### Test coverage

Ten test files, 102 tests passing. All new exports have colocated tests. `setPointLightLumens`/`setSpotLightLumens` have round-trip tests through `getPointLightLumens`/`getSpotLightLumens`. `setSpotLightBlend` has clamp coverage. `intensityUnit` defaults verified in `createAmbientLight`, `createHemisphereLight`, `createDirectionalLight`, `createPointLight`, `createSpotLight`, and `createAreaLight`.

---

## Deferred Items

### Silver Wave B — deferred (cross-package design decision)

The roadmap calls for extending `SceneLightBlock` / `SceneLights` with `shadowMapSize`, `cascadeCount`, cascade split config, and `priority`/`layerMask` on punctual lights. These fields extend the std140/std430 packed layout shared with `render`, `scene-gl`, and `scene-wgpu`. This is an explicit cross-package contract; the roadmap says to "coordinate, do not unilaterally change the packed layout." Deferred for design coordination.

### Silver — Light probe / SH irradiance descriptor

`LightProbe` (9-coefficient L2 SH irradiance + position) and `ReflectionProbe` (local IBL cubemap placement) types. These need new types in `@flighthq/types` plus matching `create*`/`clone*` in `lighting`. No cross-package layout dependency; additive within the package. Deferred as a logical next Silver step.

### Gold items — all deferred

All Gold items (IES profiles, `@flighthq/lighting-formats` package, SH baking, probe volumes, area-light shape variants, EV/exposure helpers, sun/sky model) require either a new neighbor package, CPU math with careful conformance testing, or design review against `@flighthq/materials`. Deferred per the roadmap sequencing guidance.

### Rust parity

The roadmap calls for Rust twins for every Bronze/Silver addition. The `rust` worktree is a separate workspace. Rust additions needed: `flighthq-lighting` crate: `enabled`, `decay`, `intensity_unit: LightUnit`, `spot_blend`, `create_color_from_kelvin`, `get_spot_light_cone_degrees`, `set_spot_light_blend`, `set_directional_light_target`, `set_spot_light_target`, `set_area_light_orientation`, `get_light_influence_bounds`, `get_light_luminance`, `has_light_influence_on_bounds`, `is_light_shadow_casting`, all photometric conversion functions. Deferred — this session operated in the `builder` worktree.

---

## Design Choices Made

### `LightUnit` as a string type rather than a symbol or enum

`LightUnit` is a union string type (`'Candela' | 'Lumen' | 'Lux' | 'Unitless'`) matching the SDK-wide pattern for kind/variant identifiers. Four named constants are exported alongside the type. This keeps `intensityUnit` JSON-serializable, readable in a scene graph dump, and consistent with the `*Kind` pattern used throughout the SDK.

### `intensity` stores the author's unit value directly

The stored `intensity` is always the value in `intensityUnit`'s coordinate space. If `intensityUnit = 'Lumen'`, `intensity = 800` means 800 lm. Conversion to another unit (e.g. candela) happens on-demand in the `get*` accessors. This is the glTF KHR_lights_punctual semantic and avoids lossy intermediate conversions. Renderers that need a specific internal representation (e.g. always-candela) apply the conversion in their packing path.

### `setPointLightLumens` / `setSpotLightLumens` store, not convert

`setPointLightLumens(out, 1200)` stores `intensity = 1200` and sets `intensityUnit = 'Lumen'`. It does NOT pre-convert to `lumens / (4π)`. This keeps the round-trip `setPointLightLumens(l, x) → getPointLightLumens(l) ≈ x` lossless and makes the setter a simple record.

### `spotBlend` as a normalized float [0,1], clamped by `setSpotLightBlend`

The blend factor is stored as a scalar and clamped by the setter. The renderer applies this as a smooth-step blend across the inner-to-outer cosine range: `smoothstep(outerConeCos, innerConeCos - (innerConeCos - outerConeCos) * (1 - spotBlend), dotLightDir)`. Keeping it as a stored float (not pre-baked) lets the renderer access both ends of the range and apply the blend in its shader.

### `AreaLight` does not get candela/lumen helpers in this pass

Area light intensity is measured in lumens per steradian per square meter (radiance/luminance), which is a per-area quantity requiring knowledge of the rectangle size. The maturation roadmap mentions `'Lumen'` for area lights. A correct `getAreaLightLuminance` helper would need `right`/`up` half-extent lengths to compute the emitting area. This is deferred — `intensityUnit` is added to the type so the field is usable, but no area-light conversion functions are in this pass. The `get*` / `set*` functions for area lights would be: `getAreaLightLuminance(source)` / `setAreaLightLuminance(out, nits)` where `nits = lumens / (area × π sr)`.

### `SpotLightConeAngles` remains package-local

The `SpotLightConeAngles` interface (`{ innerDegrees, outerDegrees }`) is an output struct used only by `getSpotLightConeDegrees`. It stays in `spotLight.ts` rather than moving to `@flighthq/types` because it does not cross package boundaries. If it becomes shared (e.g. a scene inspector or settings panel that reads cone angles), it should move to `@flighthq/types`.

---

## Concerns and Surprises

**`getLightLuminance` with `Environment`:** `Environment` has no `color` field in its type, so `getLightLuminance` uses a `(light as { color?: number }).color` cast and returns `0` when undefined. Intentional — luminance is not meaningful for IBL sources — but the API is slightly awkward. A future iteration could use a typed union over coloured lights only.

**`setAreaLightOrientation` semantics:** The function preserves existing half-extent lengths on `right`/`up` while updating their directions. The implementation reads all inputs into locals first for alias safety.

**`createDirectionalLight` now normalizes its direction:** This is a behavior change from the original (which just deep-cloned). The `direction` field in `DirectionalLight` is documented as normalized, so this is correct by spec.

**`setSpotLightCone` clamp behavior:** The clamp swaps inverted inputs rather than throwing. The invariant `innerConeCos >= outerConeCos` is guaranteed by the function.

---

## Suggestions for Future Sessions

1. **Light probe / SH irradiance descriptor (Silver):** `LightProbeKind`, `LightProbe` type (9-coefficient L2 SH + position), `createLightProbe`/`cloneLightProbe`, `setLightProbeFromColor(out, color)` (constant-ambient SH0). All additive in `@flighthq/types` + `lighting`; no cross-package dependency.
2. **Reflection probe placement descriptor (Silver):** `ReflectionProbeKind`, `ReflectionProbe` type (local-IBL cubemap + position + box-projection bounds). Follows the same alias-shared pattern as `Environment`.
3. **Silver Wave B (SceneLightBlock layout):** `shadowMapSize`, `cascadeCount`, and `priority`/`layerMask` on punctual lights, guarded by coordination with the render crates. Surface as a design question before starting.
4. **Area light photometric helpers:** `getAreaLightLuminance(source)` / `setAreaLightLuminance(out, nits)` using the rectangle half-extents. Straightforward math; only deferred because it requires a decision on whether `right`/`up` length or a separate width/height field is the source of truth.
5. **`@flighthq/lighting-formats` package (Gold):** IES LM-63 parser + `parseIesProfile(text)` + `sampleIesProfile(profile, angle)`. Confirm `-formats` neighbor pattern against `@flighthq/spritesheet-formats` before creating.
6. **Rust parity pass:** All Bronze+Silver additions to `flighthq-lighting`, paying attention to the `decay` field default, cone clamp invariant, `LightUnit` mapping (string or enum), and photometric conversions.
7. **Sun/sky model helper (Gold):** `createDirectionalLightFromSun(elevation, azimuth, turbidity)` producing color-temperature + intensity. Design-review against `@flighthq/materials` before starting.
