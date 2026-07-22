---
package: '@flighthq/texture-formats'
updated: 2026-07-21
basedOn: ./review.md
---

# texture-formats — Assessment

## Depth gaps

1. **Complete the compressed-payload realization seam.** Container parsing must hand BasisLZ/UASTC/ETC/BC/ASTC payloads to separately registered transcoders/decoders with explicit target-format capability selection; identifying byte ranges alone is not end-to-end texture support.
2. **Validate against real tool outputs.** KTX2/DDS/Basis/ATF fixtures from canonical encoders must prove mip/layer/face offsets, supercompression metadata, corrupt-range rejection, and eventual GPU upload. Synthetic header builders remain useful unit tests but are not sufficient evidence.
3. **Preserve remaining source interpretation metadata.** KTX2 DFD orientation/swizzle/color-model data and DDS volume depth are currently dropped or rejected. Basis now maps 2D/array, cubemap-array, and volume shapes onto the common descriptor and truthfully rejects video frames; video sequencing needs a separately paid temporal descriptor. Add small container-specific descriptors rather than widening the common level record into a kitchen-sink; keep actual transcoding separately paid.

## Recommended

Sweep-safe: within `@flighthq/texture-formats`, no cross-package coupling, no breaking public-API change, no open design fork.

1. **Add `explain*` diagnostics for parse rejection.** Per the diagnostics inversion rule every silent `null` needs a shakeable companion — e.g. `explainTextureContainerParse(bytes)` returning plain data (which container was detected, and the rejection reason: truncated header, unmapped vkFormat/DXGI/FourCC code, level range overrun, unsupported ATF format code). Separately importable so parsers stay lean.

## Backlog

Parked, with why:

- **ATF JPEG-XR identify-only blocks** — blessed by Decision 2026-07-11 but not mechanical: a JPEG-XR block has no `TextureContainerFormat` (the vocabulary is GPU-consumable formats), so representing it needs a vocabulary ruling (candidate open direction 3 in the review). Waiting on that decision.
- **Real binary fixtures (toktx/texconv/png2atf/basisu outputs)** — the only way to truly validate any parser, but committing binaries needs a repo-level fixture policy the charter doesn't give (candidate open direction 1).
- **KTX2 SGD/DFD byte-range exposure** — needed for the BasisLZ transcoder handoff, but changes the `TextureContainer` descriptor shape in `@flighthq/types` and ties to the chartered transcoder seam (Open direction 1). Cross-package + design fork.
- **DDS volume (3D) textures** — `TextureContainer.depth` exists but `TextureContainerLevel` has no depth/slice granularity; supporting them cleanly touches the level-index-granularity question (charter Open direction 6) and likely the types package.
- **DDS/DXGI vocabulary expansion** (R16F/RG16F/R32F/RGB10A2/BGRX, legacy luminance/565 masks, HDR ASTC) — each new format is a `TextureContainerFormat` member in `@flighthq/types`; vocabulary growth has been decision-gated in this charter (the ATF members were blessed explicitly). Cross-package.
- **PKM / PVR v3 / `.astc` raw containers** — charter Open direction 2; real scope growth the user sequences, and new formats again touch the types vocabulary.
- **`image-codec` detect integration** — charter Open direction 4; explicitly cross-package.
- **Write/repack (emit KTX2)** — charter Open direction 3; read-first boundary stands.
- **Cross-container `(mip, layer, face)` index helper** — charter Open direction 6; the helper itself could be in-package, but its shape depends on whether `TextureContainerLevel` gains the triple (a types decision), so parked with it.

## Approved

- [2026-07-22 · completed] `parseBasis` now matches the published packed basisu layout: 24-bit
  `m_total_slices`/`m_total_images` at offsets 14/17, `m_tex_format` at 20,
  `m_slice_desc_file_ofs` at 63, and 23-byte slice descriptors with 24-bit image indices. The byte
  reader has a separately tested little-endian U24 atom; fixtures use the corrected layout and prove
  values beyond 16 bits rather than reproducing the old parser's assumptions.
- [2026-07-22 · completed] Basis `m_tex_type` is no longer flattened unconditionally: 2D/array
  images retain layers, cubemap arrays expose six faces and their array-layer count, and volumes expose
  depth. Video frames and malformed cube counts return the existing unsupported sentinel because a
  static `TextureContainer` cannot truthfully represent temporal replenishment semantics.
- [2026-07-22 · completed] `computeTextureContainerLevels` and
  `getTextureContainerLevelByteLength` are root exports. KTX2 Zstd/ZLIB indivisible levels,
  uncompressed array splitting, DDS DX10 arrays, and multi-peer preference are all exercised. The
  package and package-map descriptions now include ATF, peer selection, and level layout.
