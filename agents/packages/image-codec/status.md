---
package: '@flighthq/image-codec'
updated: 2026-07-31
---

# image-codec — Status Log

## 2026-07-31 — registry capability enumeration

- Completed registry enumeration in `9b3ab49da` with symmetric public
  `getImageDecoderMimeTypes` / `getImageEncoderMimeTypes` queries.
- Both queries return insertion-ordered snapshots, so callers can inspect runtime codec capability
  without receiving a mutable registry view.
- Snapshot-isolation tests mutate the returned arrays and confirm subsequent queries still report only
  registered entries.
- Focused `npm run check -- image-codec` passed all gates; the package suite passed 47 tests; the API
  report exposes both `readonly string[]` signatures. No matching size fixture consumes image-codec.

## 2026-07-31 — image MIME sniffing breadth

- Completed the two MIME-detection Recommended items in `bd2c1a778`.
- `detectImageMimeType` now recognizes AVIF image and sequence brands (`avif` / `avis`) in a bounded
  ISO-BMFF `ftyp` box, including compatible-brand entries rather than only the major brand.
- Added the standard ICO signature as `image/x-icon` and both TIFF byte orders as `image/tiff`.
- Pinned malformed/non-AVIF `ftyp` rejection so the detector does not accept a brand outside the
  declared box or infer every ISO-BMFF file as AVIF.
- Focused `npm run check -- image-codec` passed all seven gates, and the package test suite passed 43
  tests across seven files.

## 2026-07-09 — first build ("Bronze" scope shipped)

Package built per the blessed charter (Decisions 2026-07-09). DOM-free byte↔pixel seam, depends only on `@flighthq/types`.

### Shape

Types (header-first in `@flighthq/types`): `DecodedImage { data: Uint8ClampedArray; width; height }` (straight RGBA8), `ImageDecodeOptions { premultiplyAlpha? }`, `ImageEncodeOptions { quality? }`, `ImageDecoder = (bytes, options?) => Promise<DecodedImage>`, `ImageEncoder = (image, options?) => Promise<Uint8Array>`.

Source (7 files, colocated tests, 38 tests green):

- `imageDecoderRegistry.ts` / `imageEncoderRegistry.ts` — global MIME-keyed `Map` registries, empty at import (no side effects). `register*`/`get*`/`has*`/`unregister*`/`clear*`, last-write-wins.
- `decodeImage.ts` — `decodeImage(bytes, mimeType?)` (straight) and `decodeImagePremultiplied(bytes, mimeType?)` (passes `{ premultiplyAlpha: true }`); auto-detect MIME via `detectImageMimeType` when omitted; `null` when type unknown or no decoder.
- `encodeImage.ts` — `encodeImage(image, mimeType, options?)`; `null` when no encoder.
- `detectImageMimeType.ts` — migrated verbatim from `@flighthq/image` (magic-byte sniffer, param widened to `Readonly<Uint8Array> | ArrayBuffer`).
- `registerWebImageDecoders.ts` — one `createImageBitmap`→`OffscreenCanvas`→`getImageData` decoder registered under png/jpeg/webp/gif/avif/bmp. `getImageData` is always straight, so the premultiplied path applies a JS premultiply pass over the straight result.
- `registerWebImageEncoders.ts` — per-MIME `OffscreenCanvas.convertToBlob({ type, quality })` encoders under png/jpeg/webp.

### Migration

`detectImageMimeType` moved out of `@flighthq/image`; `image` gained an `image-codec` dep (package.json + tsconfig reference), imports it at the `loadImageResourceFromBytes` site, and re-exports it from its barrel (no break for image consumers). Its detection tests moved here.

### Registration

`tsconfig.base.json` paths, `tsconfig.build.json` reference, and `@flighthq/sdk` (barrel + package.json dep + tsconfig reference). `packages:check`, `typecheck`, `exports:check`, `order:check` all green.

## Next (deferred per charter Open directions)

- Per-format wasm codec packages (`image-codec-png` / `-jpeg` / `-webp` / `-avif`) for tree-shaking.
- Worker pool for off-thread decode.
- Animation: `decodeImageSequence` + spritesheet bridge.

Judgment call to revisit: the web decoder is registered as ONE shared function across all decodable MIME types (per the brief's "ONE decoder"), so the `Blob` is created without an explicit `type` — `createImageBitmap` sniffs the format from the bytes. Encoders, by contrast, close over their MIME type since `convertToBlob` must name the output format.

## 2026-07-02 — blessed as neighbor

Package blessed during image direction session. Named `image-codec` (not `image-formats`) — codec operation, not data format parsing. Breadth review spec exists at `agents/reviews/maturation/breadth/image-codec.md`.
