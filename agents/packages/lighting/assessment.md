---
package: '@flighthq/lighting'
updated: 2026-07-21
basedOn: ./review.md
---

# lighting — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Build the shadow primitive family.** Directional, spot, and point-light shadow views/targets, cascades, bias/filter descriptors, atlas allocation, and an explicit per-frame shadow budget should compose into scene passes; no `registerAll` path.
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
