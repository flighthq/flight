---
package: '@flighthq/materials'
updated: 2026-07-21
basedOn: ./review.md
---

# materials — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **~~Replace the standalone PBR-extension material families with one composable lane.~~** — retired 2026-08-05. `StandardPbrMaterial` remains the lean metallic-roughness family, `ExtendedPbrMaterial` owns an ordered `PbrExtension[]`, and the former one-material-per-extension kinds, creators, and aliases are absent from current headers and implementation.
2. **~~Keep `PbrExtension` open and individually tree-shakable.~~** — retired 2026-08-05. The base header is an open `Entity` with a `Kind`, while each built-in extension has a separate types header, materials creator/validator module, and backend registration module; no base-contract union or register-all import closes or eagerly pulls the family.
3. **~~Make the lane taxonomy explicit.~~** — retired 2026-08-05. Classic Lambert, Phong, and Blinn-Phong remain distinct complete material kinds, composable transport descriptors are named `PbrExtension`, shader modifiers live in `@flighthq/shading`, and post-production color operations live in `@flighthq/adjustments`.
4. **~~Model full extension inputs, including textures and coherent combinations.~~** — retired 2026-08-05. The seven built-in descriptor headers carry their canonical factors, colors, maps, independent UV selections, and clearcoat normal scale; binders derive each map transform from its own `Texture`, and colocated validators cover normalized domains, finite rotation/thickness, IOR/attenuation, UV lanes, and iridescence min/max ordering without rejecting backend-only combinations.
5. **~~Preserve the Entity constructor invariant.~~** — retired 2026-08-05. Every material creator enters through `createMaterial`/`createSurfaceMaterial` or calls `createEntity` directly, and every PBR-extension creator calls `createEntity`; the intentionally structural `createStandardPbrMaterialProperties` block is not an entity.
6. **~~Compose the standard property block, not a nested material.~~** — retired 2026-08-05. `createExtendedPbrMaterial` defaults its `standard` field with `createStandardPbrMaterialProperties`, and `createGlassExtendedPbrMaterial` explicitly builds that property block rather than embedding a `StandardPbrMaterial` entity.
7. **~~Make extension names honest about their transport model.~~** — retired 2026-08-05. The approximation is now `WrappedDiffusePbrExtension` in its own header and creator, with documentation stating that it widens direct diffuse response and does not claim subsurface transport; no `SubsurfacePbrExtension` remains.
8. **~~Keep specular-glossiness conversion texture-truthful.~~** — retired 2026-08-05. `convertSpecularGlossinessToStandardPbr` converts scalar factors and compatible maps while always setting `metallicRoughnessMap` to null, and its documentation explicitly distinguishes packed specular/glossiness channels from a separately owned bake/remap operation.

## Recommended

1. **~~Migrate `LinearColor`, `HslColor`, `HsvColor` type definitions to `@flighthq/types`.~~** — retired 2026-08-05. All three tuples now have dedicated headers exported by `@flighthq/types`, and `@flighthq/color` imports them through the contract lane.
2. **~~Fix stale `hslToRgb` doc comment (copy-pasted from `rgbToHsl`).~~** — retired 2026-08-05. The color kernel moved to `@flighthq/color`, where `hslToRgb` now accurately documents HSL input ranges, sRGB output channels, and unchanged alpha.
3. **~~Rename `createColorTransform` parameter from `obj` to `options` and add `Readonly<>`.~~** — retired 2026-08-05. OBSOLETE: the legacy `createColorTransform` API no longer exists after the color-adjustment model was replaced; its affine replacement is `createColorScaleBias(opts?: Readonly<Partial<ColorScaleBiasLike>>)`, which already has a readonly option shape.
4. **Give the spec-gloss texture drop a shakeable diagnostics seam.**
   `convertSpecularGlossinessToStandardPbr` now (correctly) writes `metallicRoughnessMap = null` when
   the source carries a `specularGlossinessMap`, silently dropping it — a materially different result
   (flat metal/roughness) with zero runtime signal. Per the diagnostics inversion rule, every silent
   sentinel gets a shakeable query: add `explainSpecularGlossinessConversion(source) → { droppedMaps }`
   and/or an `enableMaterialConversionGuards` warning naming the bake path. Low-severity/parked: the
   `materials` package has **no** diagnostics layer today (no `explain*`/`Guard`/`enable*`), so this is a
   package-wide gap shared with `convertPhongToStandardPbrMaterial`, not a regression — do it when the
   materials diagnostics layer is first stood up, not in isolation.

## Approved

- [2026-07-22 · completed] Factor-only specular-glossiness conversion no longer aliases packed
  specular RGB plus glossiness A into the incompatible roughness G plus metallic B texture slot. It
  clears that destination deterministically while preserving scalar approximation and compatible maps;
  dedicated GL sampling or an explicit texture bake remains depth work.

## Backlog

- OKLab/OKLCH.
- Package Map description update.
- Materials math home.
