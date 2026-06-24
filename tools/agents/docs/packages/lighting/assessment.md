---
package: '@flighthq/lighting'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/lighting

The review verdict is **solid — 88/100**. Bronze and Silver Wave A from the prior maturation roadmap (`reviews/maturation/depth/lighting.md`) are landed: the photometric-unit seam, `decay`/`enabled`, reciprocal cone accessors, direction/target mutators, the Kelvin helper, and the culling/analysis utilities. What remains splits cleanly: a small set of within-package polish items that are sweep-safe, and a larger set of deferred depth (shadow config, forward budget, probes, IES, full photometry) that is either gated on a cross-package layout decision or large enough to warrant its own scope. The charter is still a stub, so the genuine design questions are routed to the charter's Open directions rather than into Recommended.

## Recommended

Sweep-safe: within `@flighthq/lighting` (plus header-only `@flighthq/types` field additions where noted), no cross-package coupling, no breaking change, no open design decision.

- **State the spot candela/lumen cone-coupling foot-gun loudly in the inline docs.** The review's first correctness sharp edge: `setSpotLightCandela(x)` → `getSpotLightLumens()` → `setSpotLightLumens(...)` → `getSpotLightCandela()` only round-trips when the cone is unchanged between calls, because `getSpotLightCandela` divides by the _current_ cone solid angle. The behavior is the documented glTF semantic and is probably correct; only the doc clarity is at issue. Doc-only, within `lightIntensity.ts`. (review.md#correctness-sharp-edges)

- **Dispatch `getLightLuminance` / `getLightInfluenceBounds` on `kind` instead of structural casts.** The review flags `light as { color?: number }` / `light as PointLight | SpotLight | AreaLight` as side-stepping the discriminated union the rest of the package leans on (and `getLightLuminance` returning 0 for `Environment`). A `kind`-switch (or a typed colored-light subset) is a within-file cleanup in `lightAnalysis.ts` with no API-shape change. (review.md#correctness-sharp-edges)

- **Add a CPU-side `getLightAttenuation(distance, light): number` reader.** `decay` + the windowed inverse-square-to-`range` curve are documented on the type but no function here evaluates them. The renderer remains the source of truth for GPU shading; this is an additive, allocation-free reader for any CPU-side consumer (culling weight, editor preview). Within-package, no new type. (review.md — "decay is declared, not modeled here")

## Backlog

Parked: each waits on a cross-package coordination, a charter Open direction, or is large enough to be its own pass. Reason given per item.

- **Richer shadow descriptor (`shadowMapSize`, `shadowNear`/`shadowFar`, `shadowStrength`, directional CSM `cascadeCount`/`cascadeSplits` + `setDirectionalLightCascades`).** The largest remaining hole, but the cascade math vs. flat-fields ownership is a cross-package decision with `SceneLightBlock` / render — Silver Wave B, explicitly gated. → Open direction 1.

- **Forward-budget selection (`priority`/`layerMask` + `selectForwardLights` against `MAX_FORWARD_LIGHTS`).** Depends on the `SceneLightBlock` layout/budget contract owned by the render crates; the field additions are local but the budget decision is not lighting-only. Silver Wave B, cross-package. → Open direction 1.

- **`LightProbe` (L2 SH irradiance + position) and `ReflectionProbe` (local cubemap + box bounds) descriptors.** Additive-within-package as data, but their _scope_ (do they belong to `lighting` or a future probe/IBL-baking neighbor) and their baking inputs brush against `materials`/render. A scope decision, not sweep-safe. → Open direction 2.

- **Area-light photometry (`getAreaLightLuminance`/`setAreaLightLuminance`).** Blocked on the source of truth for the emitting area (`right`/`up` half-extent length vs. a separate width/height field). Until that is settled, `intensityUnit: 'Lumen'` stays inert on `AreaLight`. A design decision, not a mechanical add. → Open direction 5.

- **EV100/exposure helpers and a sun/sky color-temperature model (`createDirectionalLightFromSun`, `getLightExposureValue`).** The exposure/tonemapping seam already routes through `@flighthq/materials` in the codebase map; this needs the `lighting`↔`materials` boundary drawn before it can land without duplicating tonemapping. Cross-package. → Open direction 3.

- **IES photometric profiles + a `@flighthq/lighting-formats` neighbor (`parseIesProfile`, `sampleIesProfile`), and projected gobo/cookie textures.** A new triad `-formats` cell governed by the structural-fork plurality guard (≥2 formats) and the bedrock test — a package-creation decision, not in-package work. Gold tier. → Open direction 4 (and the register's candidate track).

- **SH baking / probe inputs (`projectCubeTextureToSphericalHarmonics`, `rotateSphericalHarmonics`), probe volumes, and area-light shapes beyond rectangle.** Gold frontier, each a meaningful unit; the baking inputs touch `materials`/render. Larger scope, parked behind the probe scope decision. → Open direction 2.

- **Re-entrancy of `hasLightInfluenceOnBounds` (module-level `scratchSphere`).** Fine single-threaded today; only bites a future parallel path. Parked as a watch item rather than a change to make now — acting prematurely would trade the allocation-avoidance win for a speculative concern. (review.md#correctness-sharp-edges)

- **Rust parity for this TS pass.** The roadmap's "ship each TS addition with its Rust twin in the same pass" was not honored here — the bundle's Rust changes are camera/geometry/surface/power, not `flighthq-lighting`. The TS↔Rust parity claim is stale. This is a cross-worktree conformance follow-up, not within-package TS work, and whether the charter holds lighting to lock-step parity is itself undecided. → Open direction 6 (and the conformance map).

### Doc-revision candidates (the user's gate, surfaced not acted on)

- **Package Map entry.** `@flighthq/lighting` has no first-class line in the main codebase-map Package Map (it appears only in `rust/index.md`'s 3D-pipeline paragraph). As a now-substantial 3D package, and under fork G ("full 3D is in scope"), it warrants its own Package Map line alongside `scene`/`mesh`/`camera`/`materials`.
- **Stale CONTRACT/roadmap parity claim.** The maturation roadmap's "the crate is already at parity" is now stale (see the Rust-parity item above); flag for the conformance map.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

---

### Routed to the charter's Open directions

The review's six candidate open directions are the design forks behind the Backlog above. They are **noted for the charter, not edited into it** (this skill does not author the charter):

1. **Shadow-config ownership and shape** — flat fields here vs. `SceneLightBlock`/render owning the cascade math (gates Silver Wave B shadow + forward-budget work).
2. **Probe scope** — `LightProbe`/`ReflectionProbe` in `lighting` vs. a future probe/IBL-baking neighbor (gates the probe + SH-baking backlog).
3. **The `lighting`↔`materials` exposure/tonemapping boundary** — where EV100/exposure and a sun/sky model live (gates the photometry backlog).
4. **A `-formats` neighbor for IES** — bless `@flighthq/lighting-formats` per the triad `-formats` pattern, against the plurality guard (is IES alone enough plurality?).
5. **Area-light photometry source of truth** — `right`/`up` half-extent length vs. a separate width/height field (unblocks `getAreaLightLuminance`).
6. **Rust-parity cadence** — does the charter hold lighting to lock-step TS↔Rust parity, or accept a trailing conformance follow-up?

### Note for the host

`reviews/maturation/depth/lighting.md` is the one-time seed for this assessment; per the migration table in `packages/index.md` it is spent once absorbed and can be removed.
