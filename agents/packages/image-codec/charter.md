---
package: '@flighthq/image-codec'
crate: flighthq-image-codec
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# image-codec — Charter

Directed 2026-07-09 (first-build "Bronze" scope blessed). Blessed during the image direction session (2026-07-02); the origin decisions below are from that session.

## What it is

`@flighthq/image-codec` is the **DOM-free image decode/encode seam** — `registerImageDecoder` / `registerImageEncoder` over swappable per-format backends that turn encoded bytes (`Uint8Array`) into raw RGBA pixels (`Uint8ClampedArray`) and back, without `HTMLImageElement` or any DOM dependency. Needed for the native Rust host, web workers, and off-main-thread decode.

Named `image-codec` (not `image-formats`) per image charter Decision #2: this is a codec operation (compressed pixel data ↔ raw RGBA), not a data format parser (the `-formats` suffix is reserved for structured data serialization in this SDK).

## Origin decisions (from image charter)

- **Blessed as neighbor of `@flighthq/image`.** Image owns entity lifecycle; image-codec owns the byte↔pixel boundary.
- **Per-format registries** (`registerImageDecoder(kind, decoder)`), not singleton `set*Backend` — formats are independently available.
- **`detectImageMimeType` migrates here** from image when this package is built.
- **`Uint8Array` input, `Uint8ClampedArray` output** — SDK-wide byte convention.

## North star

The one place in the SDK where compressed image bytes become raw RGBA pixels and back, with **no DOM dependency in the contract**. A global per-format registry (`registerImageDecoder('image/png', …)`) that the entity layer (`@flighthq/image`), the native Rust host, and workers all dispatch through, so `image` never needs `HTMLImageElement` and a native host swaps in wasm codecs with zero API change.

## Boundaries

- **Bytes ↔ pixels only.** `image-codec` owns `Uint8Array` (encoded) ↔ `Uint8ClampedArray` (raw RGBA). It does not own the `ImageResource` entity (that is `@flighthq/image`), GPU upload, or pixel editing (that is `@flighthq/surface`).
- **DOM is a backend, not the contract.** The decoder/encoder types are DOM-free; the web registrars (`registerWeb*`) are the opt-in DOM implementation, importing no DOM types into the public type surface.
- **Registry is opt-in.** Empty at import; only explicit `register*` populates it. No import side effects.
- **Depends only on `@flighthq/types`.** Browser globals are used ambiently by the web registrars, not as package deps.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-09] Registry keyed by MIME type string; per-format.** `registerImageDecoder(mimeType, decoder)` / `registerImageEncoder(mimeType, encoder)` over a global registry, plus `getImageDecoder`/`hasImageDecoder`/`unregisterImageDecoder`/`clearImageDecoders` (and encoder twins), and dispatchers `decodeImage(bytes, mimeType?)` / `encodeImage(image, mimeType, options?)` returning `null` sentinels when no codec is registered. `decodeImage` auto-detects the MIME via `detectImageMimeType` when omitted.
  **Why:** detection yields a MIME type, so a MIME-keyed registry dispatches with no mime↔kind mapping layer; matches the web/HTTP vocabulary and the existing `detect*MimeType` family.
- **[2026-07-09] Straight-alpha default, opt-in premultiplied path.** `decodeImage` returns straight (non-premultiplied) RGBA matching `@flighthq/surface` and `getImageData`. `decodeImagePremultiplied` returns premultiplied, backed by an `ImageDecodeOptions.premultiplyAlpha` flag on the `ImageDecoder` contract so a capable decoder produces premultiplied in one pass; the web/canvas decoder falls back to a JS premultiply (`getImageData` is always straight).
  **Why:** the pixel-manipulation layer is straight-alpha, so that is the honest default; but premultiplied-in-one-pass is a real decoder capability (e.g. `createImageBitmap({premultiplyAlpha:'premultiply'})` for GPU consumers), so the contract exposes it rather than forcing every caller to premultiply after.
- **[2026-07-09] `detectImageMimeType` migrates here from `@flighthq/image`.** `image` gains an `image-codec` dependency and imports it internally (at `loadImageResourceFromBytes`). It is NOT re-exported from `@flighthq/image` — there were no consumers importing it from there, so the single canonical export lives in `image-codec` (and reaches users via the SDK barrel), keeping `api:check`'s no-duplicate-export rule satisfied.
  **Why:** the origin decision (image charter #2) blessed the move; MIME detection is a codec concern, and centralizing it lets `decodeImage` auto-detect.
- **[2026-07-09] First-build scope = "Bronze": core registry + web registrars + the MIME migration.** Types (`ImageDecoder`, `ImageEncoder`, `DecodedImage`, `ImageDecodeOptions`, `ImageEncodeOptions`) header-first.

## Open directions (deferred, per this session)

1. **Per-format backend packages.** `image-codec-png` / `-jpeg` / `-webp` / `-avif` — per-format wasm codecs for tree-shaking; the registry already supports them.
2. **Worker pool** for off-thread decode — shape and ownership.
3. **Animation.** `decodeImageSequence` here; bridge to spritesheet from spritesheet.
