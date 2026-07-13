---
package: '@flighthq/texture-formats'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# texture-formats — Review

**Verdict:** solid — 68/100. All four chartered containers (KTX2, DDS, Basis, ATF) parse into the common `TextureContainer` descriptor with clean sentinel-null handling and strong synthetic-buffer tests, but the Basis parser's field offsets disagree with the published basisu header layout (the charter's own flagged highest-risk path), the blessed ATF JPEG-XR identify-only behavior is unimplemented, and no parser has ever been validated against a real file.

## Present capabilities

- **`detectTextureContainer`** (`detectTextureContainer.ts`) — magic-byte sniff returning `'ktx2' | 'dds' | 'basis' | 'atf' | null`; the single container-identification point, sibling of `detectImageMimeType`. Handles too-short buffers and a truncated-KTX2 lookalike (tested).
- **`parseKtx2`** (`parseKtx2.ts`) — 12-byte identifier, fixed header, level index. Curated `vkFormat` table (~60 codes: uncompressed 8-bit/float, full BC1–7 with sRGB/snorm twins, ETC2/EAC, all 14 ASTC LDR block sizes). Supercompression map (None/BasisLZ/Zstd/ZLIB); `vkFormat 0` → `etc1s` (BasisLZ) or `uastc`. Non-supercompressed multi-image levels split into per-`(layer, face)` sub-images in KTX2 mip→layer→face order; supercompressed levels stay one blob (documented — cannot split without inflating). Level ranges bounds-checked against the buffer.
- **`parseDds`** (`parseDds.ts`) — `DDS_HEADER` + `DDS_HEADER_DXT10` extension. Format via the DXGI table (~22 codes), the FourCC table (DXT1–5, ATI1/2, BC4/5 U/S, D3DFMT 113/116 float), or 32-bit RGBA channel masks. Cubemaps (caps2 + DX10 miscFlag), array layers via DX10 `arraySize`. Level ranges computed (DDS has no level index) via `computeTextureContainerLevels` in D3D subresource order (layer→face→mip). Volume textures explicitly rejected (`null`).
- **`parseBasis`** (`parseBasis.ts`) — `.basis` signature, header fields, slice table walk; ETC1S/UASTC; each slice one level, images as layers, `mipLevels` = max level index + 1; slice ranges bounds-checked.
- **`parseAtf`** (`parseAtf.ts`) — the blessed peer-array shape (`TextureContainer[] | null`, Decision 2026-07-11): versioned (`0xFF` marker) + legacy version-0 headers, u24/u32 big-endian block lengths, fixed DXT/ETC1/PVRTC(/ETC2 from v3) slot order following OpenFL's `ATFReader`, cube flag, populated-mip counting (handles png2atf "empty mipmaps" files), payload-length and per-block overrun checks.
- **`selectTextureContainer`** (`selectTextureContainer.ts`) — the consumer side of the peer array: first container whose format the GPU supports; format-agnostic.
- **Internal primitives** — `byteReader.ts` (guarded LE/BE cursor; u64 as sub-2^53 number) and `textureLevelLayout.ts` (block-size math; the `formatBlockInfo` table is an exhaustive `Record<TextureContainerFormat, …>` so the compiler flags any new format lacking block sizing; `etc1s` deliberately `null` as variable-rate). Neither is barrel-exported.
- **Header types** — `TextureContainer` / `TextureContainerFormat` (~55 members) / `TextureContainerLevel` / `TextureContainerSupercompression` live in `@flighthq/types` per Decision 2026-07-10, each with substantial durable semantic comments.
- **Tests** — 46 cases across 7 colocated files; every parser covers happy paths, cubemaps/mips, and malformed input (non-magic, truncated, unknown format, range overrun). Builders construct containers byte-by-byte.

## Gaps

- **Basis offsets very likely wrong for real files.** The tests build buffers from the same reconstructed layout the parser reads, so they cannot catch it, and the charter itself flags this (Open direction 5). Spot-checking against the published basisu `basis_file_header`/`basis_slice_desc` packed layout: `m_total_slices`/`m_total_images` are 24-bit fields at offsets 14/17 (not u16 at 12/14), `m_tex_format` is at 20 (not 16), `m_slice_desc_file_ofs` at 63 (not 61), and `basis_slice_desc` is 23 bytes with a 24-bit `m_image_index` (not 22 with u16). A real `.basis` file would mis-parse. Also unread: `m_tex_type` (cubemap/video/array), acknowledged in a comment (`faces` always 1).
- **No real-file validation anywhere.** KTX2/DDS/ATF are likewise tested only against synthetic buffers; no fixtures from `toktx`, `texconv`, `png2atf`, or `basisu` exist.
- **KTX2 skips the DFD, key/value data, and supercompression global data.** ASTC sRGB codes collapse onto unorm (a deliberate vocabulary choice, documented); ETC1S-vs-UASTC is inferred from the supercompression scheme rather than the DFD colorModel; the SGD byte range (the BasisLZ codebooks a transcoder needs) is not exposed, which weakens the chartered "route a level to a transcoder" story; `KTXorientation`/`KTXswizzle` are dropped.
- **DDS coverage is curated, not complete.** No volume (3D) textures (rejected, though `TextureContainer.depth` exists), no legacy luminance/16-bit/565/24-bit masks, no R16F/RG16F/R32F/RGB10A2/BGRX DXGI codes, no HDR ASTC. A texbook DDS reader (texconv/DirectXTex-adjacent) covers these.
- **ATF raw-BGRA (codes 0/1) and JPEG-XR/LZMA-wrapped variants return `null`** — see charter contradiction below for the JPEG-XR half.
- **Missing raw mobile containers** — PKM (ETC), PVR v3, `.astc` — already charter Open direction 2.
- **No `explain*` diagnostics.** Every parser is a silent `null` sentinel with no shakeable `explain*` query saying *why* bytes were rejected (truncated vs unknown vkFormat vs overrun) — the diagnostics inversion rule says every silent sentinel gets one. For a codec package, malformed-input diagnosis is the textbook consumer story.
- **No cross-container `(mip, layer, face)` addressing** — `levels` is flat with per-container nesting order; already charter Open direction 6.
- **Tests light on some paths:** KTX2 Zstd/ZLIB schemes and `layerCount > 1`, DDS DX10 `arraySize > 1` are unexercised.

## Charter contradictions

One: Decision 2026-07-11 blesses ATF "JPEG-XR/JPEG fallback blocks are **identify-only** (locate the byte range)", but `parseAtf` rejects the JPEG-XR/LZMA-wrapped format codes outright (`null`), so the blessed identify-only behavior is unimplemented. (Note it also raises a vocabulary question — a JPEG-XR block has no `TextureContainerFormat`, which is documented as GPU-consumable formats — so implementing it is not purely mechanical.) Everything else conforms: peer-array ATF return, single-format `TextureContainer`, no-transcode boundary, types-only deps, sentinel nulls.

## Contract & docs fit

- **Conforms well:** types-first (the descriptor quartet in `@flighthq/types`), full unabbreviated names (`parseKtx2`, `selectTextureContainer`, `getTextureContainerLevelByteLength`), sentinels-not-throws throughout (guarded reads prevent `DataView` throws), single root `.` export, `"sideEffects": false`, `@flighthq/types` as the only dependency, `Readonly<>` on inputs and tables, alphabetized exports, colocated tests for every exported function, exemplary durable semantic comments.
- **Diagnostics convention gap:** the silent-null sentinels lack the mandated `explain*` companion (see Gaps).
- **Barrel question:** `computeTextureContainerLevels` / `getTextureContainerLevelByteLength` (textureLevelLayout.ts) are public-shaped, tested, and consumer-useful (upload byte-size validation, staging allocation) but not re-exported from `index.ts`; `byteReader` staying internal is right.
- **Candidate doc revisions:** `package.json` description says "KTX2 / DDS / Basis" — omits ATF and `selectTextureContainer`; the Package Map line in `agents/index.md` and `agents/packages/map.md` likewise predates the ATF decision. `detectTextureContainer`'s return union is an inline string literal type — arguably belongs as a named type in the header layer for navigability.

## Candidate open directions

1. **Binary fixture policy** — the charter asks for validation against a real `.basis` file but is silent on whether small committed binary fixtures (toktx/texconv/png2atf/basisu outputs) are acceptable in-repo; without a policy, real-file validation has no home.
2. **Transcoder handoff completeness for KTX2 BasisLZ** — should the descriptor (or a KTX2-side extension) expose the SGD/DFD byte ranges a transcoder needs? Ties to Open direction 1 (transcoder seam); the current descriptor cannot feed a BasisLZ transcode.
3. **JPEG-XR identify-only representation** — what does an identify-only, non-GPU-format block carry as `format`? Needs a ruling before the blessed ATF behavior can land.
4. **Color-space axis in the format vocabulary** — ASTC sRGB collapses onto unorm while BC/ETC2 keep sRGB twins; is that asymmetry intended?
5. **Barrel policy for the level-layout helpers** — export or keep internal.
