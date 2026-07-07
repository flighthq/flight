---
package: '@flighthq/image-codec'
crate: flighthq-image-codec
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# image-codec — Charter

> **PRE-DIRECTION STUB.** This package was blessed during the image direction session (2026-07-02). No source exists yet. The breadth review at `agents/reviews/maturation/breadth/image-codec.md` has a detailed Bronze/Silver/Gold spec. Awaiting its own direction session.

## What it is

`@flighthq/image-codec` is the **DOM-free image decode/encode seam** — `registerImageDecoder` / `registerImageEncoder` over swappable per-format backends that turn encoded bytes (`Uint8Array`) into raw RGBA pixels (`Uint8ClampedArray`) and back, without `HTMLImageElement` or any DOM dependency. Needed for the native Rust host, web workers, and off-main-thread decode.

Named `image-codec` (not `image-formats`) per image charter Decision #2: this is a codec operation (compressed pixel data ↔ raw RGBA), not a data format parser (the `-formats` suffix is reserved for structured data serialization in this SDK).

## Origin decisions (from image charter)

- **Blessed as neighbor of `@flighthq/image`.** Image owns entity lifecycle; image-codec owns the byte↔pixel boundary.
- **Per-format registries** (`registerImageDecoder(kind, decoder)`), not singleton `set*Backend` — formats are independently available.
- **`detectImageMimeType` migrates here** from image when this package is built.
- **`Uint8Array` input, `Uint8ClampedArray` output** — SDK-wide byte convention.

## Open directions

1. **Registry shape.** Per-format `registerImageDecoder(kind, decoder)` vs batch registration. Confirm against the renderer registration pattern and the platform-suite `set*Backend` convention.
2. **Web fallback registrar.** `registerWebImageDecoders()` over `createImageBitmap` + `OffscreenCanvas` — explicit opt-in, no top-level side effects.
3. **Per-format backend packages.** `image-codec-png`, `image-codec-jpeg`, `image-codec-webp`, `image-codec-avif` — per-format for tree-shaking, or bundled?
4. **Premultiplied alpha default.** Decode to straight alpha (matching Surface) or premultiplied (matching GPU path)?
5. **Worker pool for off-thread decode.** Shape and ownership.
6. **Animation home.** `decodeImageSequence` here, bridge to spritesheet from spritesheet.
