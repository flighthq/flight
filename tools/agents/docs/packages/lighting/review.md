---
package: '@flighthq/lighting'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/lighting.md
  - reviews/maturation/depth/lighting.md
  - source
  - changes.patch
---

# Review: @flighthq/lighting

Evidence source: incoming bundle `builder-67dc46d64` (`67dc46d64:packages/lighting/`, `67dc46d64:packages/types/src/*Light*.ts`), verified against `changes.patch`.

## Verdict

**solid — 88/100.** The light-_type_ taxonomy was already complete and well-modeled (the prior depth review's 70/100 was about depth _within_ each descriptor, not breadth across types). This pass filled almost the entire Bronze tier and Silver Wave A: a full photometric-unit seam (`LightUnit` + per-type conversions), `decay`/`enabled` fields, reciprocal cone accessors, direction/target mutators, a Kelvin color helper, and culling/analysis utilities. The package is now a genuinely capable descriptor + analysis cell. It falls short of `authoritative` only because the deliberately deferred items — shadow-map/cascade config, forward-budget selection, light/reflection probes, IES profiles — are exactly the depth that separates a good lighting data layer from a reference one, and because the photometric seam has a couple of round-trip sharp edges worth flagging.

## Status-doc verification (as-claimed → verified)

The `builder-67dc46d64` status report is accurate against the diff. Spot-checks:

- `enabled: boolean` is present on all six light types **and** `Environment` (`AmbientLight.ts`, `Environment.ts`, `SpotLight.ts`, etc.). ✓
- `decay: number` is on `PointLight`/`SpotLight`/`AreaLight` only (not directional/ambient/hemisphere). ✓ — matches the inverse-square-attenuation domain.
- `intensityUnit: LightUnit` is on all six lights but **not** `Environment` (`Environment.ts` has no `intensityUnit`). ✓ — the status calls this out explicitly; correct, since an IBL source's intensity is a unitless cubemap multiplier.
- `LightUnit.ts` exports the union plus the four named constants (`CandelaLightUnit` etc.). ✓
- `createDirectionalLight` now normalizes `direction` and resets a zero-length input to `(0,-1,0)` (`directionalLight.ts:460-466`). ✓ — genuine behavior change, correct by the type's documented "normalized direction" contract.
- `setSpotLightCone` swap-clamps so `innerConeCos >= outerConeCos` (`spotLight.ts:371-375`). ✓
- 102 tests across 10 test files, 37 `describe` blocks. ✓ (counted in the bundle).
- All deferred items (Silver Wave B `SceneLightBlock` reshape, light/reflection probes, all Gold, Rust parity) are correctly described as deferred. ✓ — none of them appear in the TS diff.

One nuance the status under-states: the `enabled`-skipping packer it repeatedly references ("a packer skips disabled lights") lives in `render`/`scene-*`, **not** in this package. `lighting` only adds the field; nothing here consumes it. That is the right boundary, but it means `enabled` is currently inert from this package's perspective — its only proof of use is the SceneLightBlock pack path, which this pass did not touch.

## Present capabilities

**Light-type descriptors** — `create*`/`clone*` pairs over plain entity data, all defaulting to opaque white `0xffffffff` at unit intensity, `enabled: true`, `intensityUnit: 'Unitless'`:

- `ambientLight.ts`, `hemisphereLight.ts` (sky/ground gradient), `directionalLight.ts` (sun), `pointLight.ts`, `spotLight.ts` (cone as precomputed cosines), `areaLight.ts` (LTC rectangle), `environment.ts` (IBL cubemap, alias-shared not deep-copied, with the GPU-aliasing reason documented).
- `clone*` deep-clones vectors (`cloneVector3` on `direction`/`position`/`right`/`up`) and carries `decay`/`enabled`/`intensityUnit`/`spotBlend` through.

**Mutators / accessors** (the reciprocity gap from the depth review is now closed):

- Spot: `setSpotLightCone` (swap-clamped), `getSpotLightConeDegrees` (cosine→degrees round-trip), `setSpotLightBlend` ([0,1] clamp), `setSpotLightDirection`, `setSpotLightTarget`.
- Directional: `setDirectionalLightDirection`, `setDirectionalLightTarget`.
- Area: `setAreaLightOrientation` (updates the three axis directions, preserves existing `right`/`up` half-extent lengths; reads inputs into locals for alias safety).

**Photometric seam** (`lightIntensity.ts`, 10 functions) — `getDirectionalLightLux`/ `setDirectionalLightLux`, `getPointLightCandela`/`getPointLightLumens`/`setPointLightCandela`/ `setPointLightLumens`, and the spot quartet. The stored-value-is-author-value model (conversion only in `get*`) matches glTF `KHR_lights_punctual`, is round-trippable, and is well documented inline.

**Color helper** — `createColorFromKelvin` (`colorFromKelvin.ts`): Tanner-Helland approximation, packed sRGB-albedo RGBA, the same algorithm Blender/three.js/Filament use; clamps to 1000–40000 K.

**Analysis / culling** (`lightAnalysis.ts`) — `getLightInfluenceBounds` (influence sphere, sentinel `radius = -1` for non-spatial/infinite), `getLightLuminance` (BT.709 luma × intensity), `hasLightInfluenceOnBounds` (sphere-sphere overlap, module scratch sphere, no per-call allocation), `isLightShadowCasting`. These are the descriptor-side primitives a scene culler needs.

**Hygiene** — single root barrel (`index.ts`), `sideEffects: false`, no top-level side effects, deps only on `entity`/`geometry`/`types`, every export colocated-tested, exemplary on-convention naming.

## Gaps vs an authoritative lighting data layer

Mostly the deliberately deferred items — depth _within_ the descriptor scope, not new packages:

- **Shadow descriptor is still thin.** Only `castsShadow`/`shadowBias`/`normalBias`/`pcfRadius`. No `shadowMapSize`, `shadowNear`/`shadowFar`, `shadowStrength`, and no directional CSM cascade config (`cascadeCount`/`cascadeSplits`). This is the largest remaining hole for a real-time shadow story.
- **No forward-budget selection.** `enabled` exists but there is no `priority`/`layerMask` on punctual lights and no `selectForwardLights(...)` to choose survivors against `MAX_FORWARD_LIGHTS`. The documented forward budget is still caller-improvised. (Silver Wave B — gated on the `SceneLightBlock` layout coordination, correctly deferred.)
- **No light-probe / SH irradiance or reflection-probe descriptor.** `Environment` covers global IBL; `LightProbe` (9-coeff L2 SH + position) and `ReflectionProbe` (local cubemap + box bounds) are absent. Additive-within-package, no cross-package layout dependency — the clearest next Silver step.
- **No IES photometric profiles / cookies.** No `IesProfile`, no `@flighthq/lighting-formats` neighbor, no projected gobo/cookie texture. (Gold.)
- **Photometric model is partial.** No EV100/exposure helpers, no sun/sky model, and crucially **no area-light photometric conversion** — `intensityUnit: 'Lumen'` is settable on `AreaLight` but there is no `getAreaLightLuminance`/`setAreaLightLuminance`, so the unit is declarable-but-inert for area lights (status acknowledges this).
- **`decay` is declared, not modeled here.** The field + attenuation curve are documented on the type, but no function in this package evaluates the attenuation (correctly — that is the renderer's job). Worth noting the package offers no `getLightAttenuation(distance, light)` reader if a CPU-side consumer ever wants it.

### Correctness sharp edges (low severity, worth flagging)

- **Spot candela/lumen round-trip is cone-coupled, not setter-symmetric.** `setSpotLightLumens` stores the value and tags `'Lumen'`; `getSpotLightCandela` then divides by the cone solid angle `2π(1 − outerConeCos)` using the light's _current_ cone. So `setSpotLightCandela(x)` → `getSpotLightCandela()` round-trips, but `setSpotLightCandela(x)` → `getSpotLightLumens()` → `setSpotLightLumens(...)` → `getSpotLightCandela()` only round-trips if the cone is unchanged between calls. This is the documented glTF semantic and probably correct, but the coupling is a caller foot-gun the inline docs could state more loudly.
- **`getLightLuminance` / `getLightInfluenceBounds` use structural casts** (`light as { color?: number }`, `light as PointLight | SpotLight | AreaLight`) rather than dispatching on `kind`. `getLightLuminance` returns 0 for `Environment` (no `color`). Functional, but it side-steps the discriminated union the rest of the package leans on; a `kind`-switch (or a typed colored-light subset) would be cleaner.
- **`hasLightInfluenceOnBounds` is not re-entrant** (module-level `scratchSphere`). Single-threaded so fine today, but it is the one allocation-avoidance shortcut that would bite a future parallel path.

## Charter contradictions

None. The charter (`charter.md`) is a stub — `What it is` is seeded ("descriptor package, not a shading/solver package"), and `North star` / `Boundaries` / `Decisions` / `Open directions` are all `TODO`. The package is fully consistent with the one statement the charter makes: it is purely descriptors + value analysis, with zero shading/solving and zero rendering. Every gap above is a depth question, not a boundary violation.

## Contract & docs fit

**Lives up to the contract.** Types-first (`LightUnit`, all light fields, `SceneLightBlock` in `@flighthq/types`, implemented against from `lighting`); full unabbreviated names throughout; `out`-first mutators (`setSpotLightCone(out, …)`, `getSpotLightConeDegrees(out, source)`); explicit `create*`/`clone*` allocation verbs; sentinels not throws (`radius = -1`, swap-clamp rather than throw on inverted cones); single root export; `sideEffects: false`; alias-safe out-params with inputs read into locals. `LightUnit` correctly follows the string-kind convention (union + named constants, JSON-serializable) rather than a symbol or enum.

**Candidate doc revisions** (the user's gate, not the reviewer's):

- The **Package Map** line for `@flighthq/lighting` in the codebase map is implicit — `lighting` is described only in `rust/index.md`'s 3D-pipeline paragraph, not given its own entry in the main `index.md` Package Map. As a now-substantial 3D package (and with G's "full 3D is in scope" ruling), it warrants a first-class Package Map line alongside `scene`/`mesh`/`camera`/`materials`.
- The **CONTRACT.md** `crate` enumeration lists `flighthq-lighting` as identity (correct), and the maturation roadmap notes the Rust crate is "already at parity" — but this pass shipped a large TS surface with **no Rust twin in the bundle** (the diff's Rust changes are camera/geometry/surface/ power/etc., not `flighthq-lighting`). The TS↔Rust parity claim is now stale; flag for the conformance map / a Rust-parity follow-up.
- `SpotLightConeAngles` is a package-local output interface (`spotLight.ts`). The status correctly reasons it stays local until it crosses a boundary; no contract issue, just noted for the inevitable scene-inspector case.

## Candidate open directions

The charter is a stub, so several decisions were assumed against the codebase-map AAA standard and should be settled into the charter:

1. **Shadow-config ownership and shape.** Does the richer shadow descriptor (map size, near/far, strength, CSM cascades) live as flat fields here, or does `SceneLightBlock`/render own the cascade math? Silver Wave B is explicitly gated on this — it is a cross-package layout decision, not a lighting-only one.
2. **Probe scope.** Are `LightProbe` (SH irradiance) and `ReflectionProbe` in-scope for `lighting`, or do they belong to a future `probe`/IBL-baking neighbor? They are additive-within-package today but their _baking_ inputs (cube→SH projection) brush against `materials`/render.
3. **The `lighting` ↔ `materials` exposure/tonemapping boundary.** The codebase map already routes the sRGB→linear seam through `materials`. Where do EV100/exposure and a sun/sky color-temperature model live — `lighting` (color authoring) or `materials` (tonemapping)? Gold photometry needs this drawn.
4. **`-formats` neighbor for IES.** Does `@flighthq/lighting-formats` get blessed (per the triad `-formats` pattern, with the plurality guard), and is IES alone enough plurality to justify it?
5. **Area-light photometry source of truth.** `getAreaLightLuminance` needs the emitting area; is `right`/`up` half-extent length the source of truth, or a separate width/height field? Settle before adding the conversion so `intensityUnit: 'Lumen'` stops being inert on `AreaLight`.
6. **Rust-parity cadence.** The roadmap says "ship each TS addition with its Rust twin in the same pass," but this pass did not. Decide whether the charter holds lighting to lock-step parity or accepts a trailing Rust-conformance follow-up.
