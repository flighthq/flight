---
package: '@flighthq/texture'
draft: false
crate: flighthq-texture
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# texture — Charter

## What it is

GPU texture bindings — the data descriptors that tell a renderer _how_ to read an image as a texture: sampling state (wrap, filter, anisotropy), color space, UV transform (offset/rotation/scale), and the cubemap aggregate. Sits between `@flighthq/image` (the pixel source) and the material/renderer layer (the backend that uploads and samples). The package owns the texture **descriptor** and its CPU-side composition; it does not own pixel manipulation (`@flighthq/surface`) or GPU upload (`render-gl` / `render-wgpu`'s texture entries).

Within the 3D family it sits beside `mesh` / `lighting` / `camera` / `materials` as the texture-binding half of the pipeline, but its descriptors are dimension-agnostic — a 2D display object with a UV-transformed bitmap consumes the same `Texture` and `Sampler` as a 3D PBR material.

## North star

1. **Plain data descriptors, not GPU objects.** A `Texture` is sampling state + a source reference + a UV transform; a `Sampler` is wrap/filter/anisotropy. Neither carries GPU state — the render backend creates the GPU binding from the descriptor. This keeps texture side-effect-free and tree-shakable.
2. **Types in the header first.** `Texture`, `CubeTexture`, `Sampler`, and `CubeFace*` constants live in `@flighthq/types`; this package implements against them. The full texture surface is navigable from the header alone.
3. **Symmetric quartets.** Every entity gets the create/clone/copy/equals quartet. Size accessors, readiness gates, and UV-matrix composition fill out the API surface a user expects from a texture library.
4. **Explicit allocation, alias-safe out-params.** `create*` allocates; `copy*`/`set*` write in place; `getTextureUvMatrix` reads all fields into locals before writing `out`. Alias-safe throughout.
5. **Sampler presets as compositions, not config.** Named presets (`createPixelArtSampler`, `createAnisotropicSampler`, etc.) are thin factory calls over `createSampler` — assemblies that tree-shake independently.

## Boundaries

**In scope**

- The `Texture` descriptor: image source binding, UV transform (offset/rotation/scale), color space, and the UV-matrix compose.
- The `CubeTexture` descriptor: six-face aggregate, per-face mutators, completeness gate, size accessor.
- The `Sampler` descriptor: wrap modes, min/mag/mip filter, anisotropy, compare function.
- Named sampler presets (pixel-art, anisotropic, tiling, clamp-linear, etc.).
- The `CubeFace*` index constants (six faces, defined in `@flighthq/types`).
- Create/clone/copy/equals quartets and readiness predicates for all three entities.

**Out of scope (non-goals)**

- Pixel manipulation and image processing — `@flighthq/surface`.
- Image resource loading and lifecycle — `@flighthq/image`.
- GPU texture upload, mip generation, format transcoding — `render-gl` / `render-wgpu`.
- Compressed-texture file formats (KTX2/Basis) — a future `@flighthq/texture-formats` neighbor or `scene-formats`.
- Materials that _consume_ textures — `@flighthq/materials`.

## Decisions

- **2026-07-03 — CubeFace constants belong in `@flighthq/types`.** Six bare numeric constants (`CubeFacePositiveX` = 0 through `CubeFaceNegativeZ` = 5), not an enum. Why: they are cross-package identifiers consumed by texture, materials, and render backends.
- **2026-07-03 — TS-leads, Rust conforms later.**

## Open directions

1. **`CubeTexture.faces` readonly vs mutable.** The field is typed `readonly (ImageResource | null)[]`, but `setCubeTextureFace` and `copyCubeTexture` cast away readonly internally. The cast is runtime-correct (the array is freshly sliced at creation), but a package that owns in-place face mutators writing through a `readonly` field is a types-shape question. Options: make `faces` mutable on the entity (it is an entity, not a value), or accept the internal cast as the intended pattern.
2. **Texture-descriptor completeness.** The current `Texture` carries source + UV transform + color space. Missing fields that a mature texture library would carry: `format` (pixel format hint for the GPU), `mipPolicy` (auto-generate / manual / none), `usage` flags. These couple to the GPU upload layer — adding them requires agreeing the seam with `render-gl`/`render-wgpu`.
3. **Texture2DArray and 3D volume textures.** Neither is modeled. Texture arrays are load-bearing for sprite atlases on GPU backends; volume textures for 3D effects (fog LUTs, noise). Each would be a new kind and a new descriptor.
4. **Compressed-texture format home.** KTX2/Basis parsing was deferred behind the unresolved `ImageResource.compressed` slot. When it lands, does it go in a `texture-formats` neighbor or fold into `scene-formats`? The `scene-formats` decision covers mesh/scene file formats, but compressed textures are a different concern (no scene structure).
5. **Unused `@flighthq/resources` dependency.** `package.json` lists it but no source file imports it. Carried over from before the image/resource split. Mechanical removal, but flagged because it is the only stale dep in the package.
