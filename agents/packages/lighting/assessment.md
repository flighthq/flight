---
package: '@flighthq/lighting'
updated: 2026-07-22
basedOn: ./review.md
---

# lighting — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Build the shadow primitive family from the existing directional proof.** The GL backend already
   renders one fixed 1024² directional depth target and samples it with hard-coded `0.0025` bias and a
   fixed 3×3 PCF kernel. That proves depth-map viability, morph+skin casters, and lit-family sampling, but
   it bypasses the public light contract: `castsShadow`, `shadowBias`, `normalBias`, and `pcfRadius` never
   reach the pass/shader, the shadow is not associated with a selected DirectionalLight, and the draw
   lazily chooses storage. Extract explicit directional shadow view/target/pass atoms first, consuming
   caller-selected light settings and prepared draw entries. Then compose spot views, point cubemap
   faces, cascades, atlas allocation, and an explicit per-frame shadow budget; no `registerAll` path.
2. **Complete physical light realization.** Area-light photometry and rendering, punctual attenuation/cone behavior, units, and forward-light budget selection need matched shader use and raster functionals, not descriptors alone.
3. **Add environment/probe lighting as a separate composition tier.** Irradiance/specular probes, spherical harmonics, reflection-probe selection/blending, IES profiles, and sun/sky generation are obvious missing depth. Keep bake/import helpers separate from per-frame light evaluation.

## Recommended

None. The prior module-level scratch in `hasLightInfluenceOnBounds` is removed; the query now performs
an allocation-free scalar intersection directly from the light descriptor.

## Approved

- [2026-07-21 · completed] `createSceneLights` now returns an Entity-backed `SceneLights`, matching
  the repository constructor invariant. `SceneLightsLike` remains the explicit structural draw input,
  so callers can supply a one-off descriptor without pretending that input already owns identity.

## Backlog

- Shadow descriptor expansion.
- Forward-budget selection.
- Light-probe/SH descriptors.
- Area-light lumen conversion.
