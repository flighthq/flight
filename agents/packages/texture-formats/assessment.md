---
package: '@flighthq/texture-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# texture-formats — Assessment

## Recommended

Sweep-safe: within `@flighthq/texture-formats`, no cross-package coupling, no breaking public-API change, no open design fork.

1. **Correct `parseBasis` to the published basisu header layout.** Re-derive every offset from `basisu_file_headers.h`: 24-bit `m_total_slices`/`m_total_images` at 14/17, `m_tex_format` at 20, `m_slice_desc_file_ofs` at 63, 23-byte `basis_slice_desc` with 24-bit `m_image_index` — and rebuild `parseBasis.test.ts`'s builder to the corrected layout. Directly serves charter Open direction 5 and fixes the review's highest-severity finding; the public signature (`parseBasis(bytes): TextureContainer | null`) is unchanged.
2. **Add `explain*` diagnostics for parse rejection.** Per the diagnostics inversion rule every silent `null` needs a shakeable companion — e.g. `explainTextureContainerParse(bytes)` returning plain data (which container was detected, and the rejection reason: truncated header, unmapped vkFormat/DXGI/FourCC code, level range overrun, unsupported ATF format code). Separately importable so parsers stay lean.
3. **Barrel-export the level-layout helpers.** `getTextureContainerLevelByteLength` and `computeTextureContainerLevels` are public-shaped, fully tested, and consumer-useful (upload byte-size validation, staging allocation); re-export them from `index.ts`. Purely additive.
4. **Deepen tests on unexercised paths.** KTX2 Zstd/ZLIB supercompression schemes and `layerCount > 1` (per-layer sub-image split), DDS DX10 `arraySize > 1` layer layout, and a `selectTextureContainer` preference-order case with multiple supported peers.
5. **Refresh the stale self-descriptions.** `package.json` description to include ATF and the peer-array/`selectTextureContainer` story (the Package Map lines in `agents/index.md`/`agents/packages/map.md` are the same staleness — flagged there as candidate revisions for the user, since admin docs are outside a package sweep).

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

None.
