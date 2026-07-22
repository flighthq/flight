---
package: '@flighthq/lighting'
updated: 2026-07-22
basedOn: ./review.md
---

# lighting — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Extend the proven directional shadow atom into a separately paid primitive family.** The GL
   directional pass now consumes a caller-owned target, viewport/scissor, light-space matrix, selected
   light settings, and shared prepared entries; it handles morph+skin+instances+topology, writes depth
   only, restores exact incoming state, and publishes the receiver bias/filter policy. Build spot views,
   point cubemap faces, cascades, atlas allocation, cache invalidation, and an explicit per-frame shadow
   budget as independent atoms above that contract. Do not conceal the family behind `registerAll` or
   return to fixed hidden allocation.
2. **Complete physical light realization.** Area-light photometry and rendering, punctual attenuation/cone behavior, units, and forward-light budget selection need matched shader use and raster functionals, not descriptors alone.
3. **Add environment/probe lighting as a separate composition tier.** Irradiance/specular probes, spherical harmonics, reflection-probe selection/blending, IES profiles, and sun/sky generation are obvious missing depth. Keep bake/import helpers separate from per-frame light evaluation.

## Recommended

None. The prior module-level scratch in `hasLightInfluenceOnBounds` is removed; the query now performs
an allocation-free scalar intersection directly from the light descriptor.

## Approved

- [2026-07-21 · completed] `createSceneLights` now returns an Entity-backed `SceneLights`, matching
  the repository constructor invariant. `SceneLightsLike` remains the explicit structural draw input,
  so callers can supply a one-off descriptor without pretending that input already owns identity.
- [2026-07-22 · completed] `KHR_lights_punctual` import is an individually supplied glTF extension
  handler, not core parser knowledge or a register-all side effect. It preserves linear color, intensity,
  range, spot half-angles, node placement, and authored name while producing the existing Entity-backed
  directional/point/spot light primitives.
- [2026-07-22 · completed] Directional shadow drawing is an allocation-free explicit GL pass over
  caller-owned target rectangles, light policy, light-space matrix, and prepared entries. Optional lazy
  target/traversal assembly remains a separate state-owned convenience; real raster evidence samples the
  produced depth attachment rather than presenting an unrelated color proxy.

## Backlog

- Shadow descriptor expansion beyond the settled directional fields.
- Forward-budget selection.
- Light-probe/SH descriptors.
- Area-light lumen conversion.
