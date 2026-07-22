---
package: '@flighthq/materials'
updated: 2026-07-21
basedOn: ./review.md
---

# materials — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Replace the standalone PBR-extension material families with one composable lane.** Keep a lean `StandardPbrMaterial`; add `ExtendedPbrMaterial` carrying ordered, typed `PbrExtension` descriptors; remove the old clearcoat/sheen/anisotropy/iridescence/specular/subsurface/transmission-volume material kinds, creators, and compatibility aliases. Pre-release consumers migrate directly.
2. **Keep `PbrExtension` open and individually tree-shakable.** The descriptor contract is kind-based and vendor-extensible rather than a closed union. Each built-in extension has its own 1:1 header and implementation module, creator/validator, and backend registration, so importing standard PBR never pulls extension implementations and importing one extension never pulls the set; do not group every concrete variant into the base-contract file.
3. **Make the lane taxonomy explicit.** Lambert/Phong/Blinn-Phong are mutually exclusive complete lighting models. PBR extensions are physically meaningful lobes or transport terms composed into PBR. Shader feature/modifier work belongs in `@flighthq/shading`; `@flighthq/adjustments` transforms an already-produced value. Do not blur these lanes under a generic “extension” noun.
4. **Model full extension inputs, including textures and coherent combinations.** Clearcoat, sheen, anisotropy, iridescence, specular, subsurface, and transmission/volume descriptors expose their canonical scalar/color/map inputs—including clearcoat normal scale—and per-map UV selection. Each map's own texture transform must survive binding rather than inheriting the base-color map's transform. Descriptor-level validation should reject domain-invalid data and invalid cross-field relationships, not combinations merely unsupported by one backend.
5. **Preserve the Entity constructor invariant.** Every public `create*Material` and `create*PbrExtension` that produces a Flight entity must use the entity constructor path; descriptors intentionally defined as `*Like` remain structural inputs.
6. **Compose the standard property block, not a nested material.** Extended presets such as glass must
   populate `standard` with `createStandardPbrMaterialProperties`; embedding a full
   `StandardPbrMaterial` entity smuggles a second kind/runtime/surface trailer into a value block whose
   contract does not consume them.
7. **Make extension names honest about their transport model.** A `SubsurfacePbrExtension` promises
   subsurface transport; a wrapped-diffuse lighting approximation is a smaller, different primitive.
   Either implement a thickness/profile/backlighting transport contract or name and type the existing
   atom `WrappedDiffusePbrExtension` so composition does not conceal the approximation.
8. **Keep specular-glossiness conversion texture-truthful.** Specular-glossiness is a complete legacy
   PBR workflow, not a `PbrExtension`: its packed map contains sRGB specular RGB plus linear glossiness
   alpha, while a metallic-roughness map contains linear roughness G plus metallic B. The scalar
   approximation may convert factors, but it must leave `metallicRoughnessMap` empty unless the caller
   supplies an explicitly baked/remapped texture. Never alias the packed source map into the destination
   descriptor. Expose any texture bake as a separately imported operation with explicit output ownership,
   color-space, resolution, and failure semantics.

## Recommended

1. Migrate `LinearColor`, `HslColor`, `HsvColor` type definitions to `@flighthq/types`.
2. Fix stale `hslToRgb` doc comment (copy-pasted from `rgbToHsl`).
3. Rename `createColorTransform` parameter from `obj` to `options` and add `Readonly<>`.

## Approved

None.

## Backlog

- OKLab/OKLCH.
- Package Map description update.
- Materials math home.
