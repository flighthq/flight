---
package: '@flighthq/lighting'
updated: 2026-09-08
basedOn: ./review.md
---

# lighting — Assessment

Refreshed 2026-09-08 from the 2026-09-02 review and live source. Review scored 52/100 with missing `enabled`/`decay`/`intensityUnit`/`spotBlend` fields, thin shadow descriptors, and a structural cast in `getLightLuminance` as primary findings. 6 of 13 review gaps have since been resolved. 12 source files, 11 test files, 120 test cases (up from 97). Score revised to 72/100.

## Directed

_None._

## Recommended

- **Add per-light photometric accessors.** `intensityUnit` (typed `LightUnit`) is on 6 of 7 light types but there are no typed convenience getters connecting `LightUnit` to the intensity conversion functions (e.g. `getDirectionalLightLux`, `getPointLightCandela`). The field is metadata with no consumer path.
- **Add `priority` and `layerMask` policy fields.** Forward-budget selection function exists but the light descriptors carry no priority/layer policy. Needed for real production scenes.

## Depth gaps

1. **Shadow primitive family.** Directional shadow pass is proven; spot views, point cubemap faces, cascades, atlas allocation, cache invalidation, and per-frame shadow budget remain as independent atoms above that contract.
2. **Physical light realization.** Area-light photometry and rendering, punctual attenuation/cone behavior with matched shader passes. Descriptors have `decay` and `intensityUnit` but no raster path consumes them.
3. **Environment/probe tier.** No `LightProbe`, `ReflectionProbe`, irradiance/specular probes, SH, IES profiles, or sun/sky model.
4. **`setSpotLightCone` invariant.** Review gap #12 — inner/outer angle enforcement likely still absent.
5. **Direction normalization.** Review gap #13 — directional/spot light directions may not be normalized on set.

## Backlog

- Area-light lumen conversion.
- Light-probe/SH descriptors.

## Landed

1. ~~**`enabled` field on all 7 light types.**~~ Landed. `isLightEnabled` used in `getLightLuminance`.
2. ~~**`decay` field on PointLight, SpotLight, AreaLight.**~~ Landed. Default 2. Used in `getLightContributionAtBoundingSphere`.
3. ~~**`intensityUnit` field (typed `LightUnit`) on 6 types.**~~ Landed. Default `UnitlessLightUnit`.
4. ~~**`spotBlend` field and `setSpotLightBlend`.**~~ Landed. Clamped [0,1].
5. ~~**Shadow descriptor expansion.**~~ Landed. `shadowMapSize`, `shadowNear`/`Far`, `shadowStrength`, `cascadeCount`, `cascadeSplits` in types.
6. ~~**`getLightLuminance` structural cast fix.**~~ Landed. Now uses `switch (light.kind)` with per-kind dispatch.
7. ~~**Entity-backed `createSceneLights`.**~~ Landed.
8. ~~**`KHR_lights_punctual` import.**~~ Landed.
9. ~~**Directional shadow drawing.**~~ Landed. Allocation-free explicit GL pass.

## Approved

- [2026-07-21 · completed] Entity-backed `createSceneLights`
- [2026-07-22 · completed] `KHR_lights_punctual` import handler
- [2026-07-22 · completed] Directional shadow drawing pass
