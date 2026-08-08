---
package: '@flighthq/lighting'
updated: 2026-08-08
by: principal
---

# lighting — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/lighting/src/` and `packages/types/src/` on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **`LightUnit` has no descriptor to attach to.** The type and its four constants exist
  (`types/src/LightUnit.ts:1-5`) and `lightIntensity.ts:1` is their only consumer; **no** light type in
  `types/src/` carries an `intensityUnit` field. A value's unit therefore cannot be read off a light,
  so `convertLightIntensity` can only be driven by a unit the caller tracks separately.
- **No light carries `enabled` or `decay`** — checked across `AmbientLight`, `HemisphereLight`,
  `DirectionalLight`, `PointLight`, `SpotLight`, `AreaLight`, `Environment`. So a packer cannot skip a
  disabled light without removing it from the list, and there is no falloff exponent for a CPU-side
  `getLightAttenuation(distance, light)` to read.
- **No per-light photometric accessors.** `lightIntensity.ts` exports exactly three generic helpers —
  `applyLightExposure` (`:10`), `convertLightIntensity` (`:19`), `getLightLinearIntensity` (`:37`).
  There is no `getDirectionalLightLux` / `getPointLightCandela` / `getSpotLightLumens` family. The
  spot foot-gun (candela↔lumen depends on `outerConeCos`, so changing the cone silently restates the
  intensity) has nowhere to be stated because the conversion does not exist.
- **No spot penumbra blend.** Neither `spotBlend` nor `setSpotLightBlend` appears anywhere in
  `packages/`; `SpotLight` (`types/src/SpotLight.ts:11-24`) exposes only the inner/outer cosines.
- **`getLightLuminance` reads through a structural cast** (`lightAnalysis.ts:103`) rather than
  dispatching on `kind`, unlike its siblings `hasLightInfluenceOnBounds` (`:114`) and
  `isLightCastingShadow` (`:144`). It returns `0` for any light without a `color` field, which is
  correct for `Environment` but indistinguishable from a genuinely black light.
- **No probe descriptors.** No `LightProbe` (L2 SH irradiance + position) or `ReflectionProbe`
  (local-IBL cubemap + box-projection bounds) in `types/src/`. Additive, no cross-package layout.
- **`Scene3DLightBlock` / `Scene3DLights` carry no shadow-quality or budget fields** — no
  `shadowMapSize`, `cascadeCount`, cascade split, `priority`, or `layerMask`. These extend a packed
  layout shared with `render`, `scene3d-gl`, and `scene3d-wgpu`; coordinate before changing it.
- **No area-light photometric helper.** `getAreaLightLuminance` / `setAreaLightLuminance` need the
  emitting area, which is blocked on whether `right`/`up` half-extent length or a separate
  width/height pair is the source of truth.
- **No IES profile support and no sun/sky model** — no `@flighthq/lighting-formats` neighbor, no
  `createDirectionalLightFromSun`.

**Authoring gotcha (durable, not a gap).** `scene3d-gl` multiplies *linear* radiance and defers
tonemap/gamma to the effect resolve pass (`packages/scene3d-gl/src/glClassicPrelude.ts`), so an
`intensity` authored in a gamma-space engine reads too dark. Port it up in stops with
`applyLightExposure`: directional ~+1.5–+3 EV, ambient ~+0.5–+1 EV. The `Lux` and `Candela` anchors in
`lightIntensity.ts` (`REFERENCE_PHOTOMETRIC_LEVEL`, 100000 physical units ≡ linear 1.0) are a
documented renderer default, not an exact conversion — revisit them if a real exposure model lands.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 as-claimed entry is
  **false in bulk** and its claims are dropped: `enabled`, `decay`, `intensityUnit`, and `spotBlend`
  are on no light type, and none of the ten photometric accessors nor `setSpotLightBlend` exists in
  `packages/`. Two other stale notes deleted: `SpotLightConeAngles` did move to
  `types/src/SpotLightConeAngles.ts` (it is no longer package-local), and `createColorFromKelvin` is
  now `colorFromKelvin` in `@flighthq/color`.
- **2026-07-31** — Name corrections verified: `selectForwardLights` → `selectScene3DForwardLights`,
  `isLightShadowCasting` → `isLightCastingShadow`.
- **2026-07-17** — `lightIntensity.ts` added with the three generic linear-HDR helpers, the first
  consumer of `LightUnit`.
- **2026-06-25** — Recommended sweep executed nothing; the assessment described a package state not on
  disk, which the 2026-08-08 pass has now confirmed and cleared.
