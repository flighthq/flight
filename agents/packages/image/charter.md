---
package: '@flighthq/image'
role: package
crate: flighthq-image
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# image — Charter

## What it is

`@flighthq/image` owns host-backed `ImageResource` construction/loading and `CompressedImage`
construction. `ImageResource`, `Bitmap`, and `CompressedImage` are sibling `ImageBacking` variants,
not nullable representations on one entity. Dependencies: `entity`, `image-codec`, `types`.

Two halves: `imageResource` (host-resource creation/cloning/invalidation plus compressed-image
construction) and `imageResourceFrom` (explicit Bitmap transcode, construction from DOM sources, and
async loading from URL/bytes/Base64/Blob via `img.decode()`).

All current load paths are DOM-bound (`HTMLImageElement.decode()`). The DOM-free decode/encode seam is the responsibility of a neighbor package (`@flighthq/image-codec`) — this package stays focused on entity lifecycle and DOM-based loading.

## North star

1. **Host resource and compressed backing construction, not pixel manipulation.** Image owns
   `ImageResource` creation/loading and the explicit `Bitmap` → `ImageResource` transcode.
   CPU-pixel operations and readback belong to `@flighthq/bitmap`; decode/encode belongs to
   `@flighthq/image-codec`.
2. **Dependency bottleneck — stay small.** Many packages depend on image. Keep the API surface minimal and the dependency footprint light (entity + types only).
3. **`Uint8Array` for byte input seams.** Standardize on `Uint8Array` for byte-level input (matches Rust `&[u8]`, more ergonomic than `ArrayBuffer`). `Uint8ClampedArray` for pixel output (matches `ImageData.data`, `Bitmap.data`).

## Boundaries

**In scope:**

- ImageResource entity lifecycle: `createImageResource`, `cloneImageResource`, `invalidateImageResource`,
  `isImageResourceEmpty`.
- Compressed backing construction: `createCompressedImage`.
- Explicit byte-backed conversion: `createImageResourceFromBitmap`.
- DOM-based construction: `createImageResourceFromCanvas`, `createImageResourceFromImageBitmap`, `createImageResourceFromImageElement`.
- Async loading (DOM-bound): `loadImageResourceFromUrl`, `loadImageResourceFromArrayBuffer`, `loadImageResourceFromBlob`, `loadImageResourceFromBase64`.
- Utility: `detectImageMimeType` (magic-byte sniffing — stays here until image-codec exists, then migrates), `isImageResourceSameOrigin`.

**Non-goals:**

- Pixel manipulation — `@flighthq/bitmap`.
- DOM-free decode/encode — `@flighthq/image-codec` (neighbor, not yet built).
- GPU texture upload — render backends.
- Format-specific encode/decode — `@flighthq/image-codec` per-format backends.
- Image metadata/EXIF — `@flighthq/image-codec`.
- CPU-readable pixel ownership and host-image readback — `@flighthq/bitmap`.

## Decisions

- **[2026-07-02] Package is at its natural scope ceiling.** 18 exports covering entity lifecycle + DOM-based loading. No missing capabilities within this scope — resize/crop is surface, format conversion is codec, metadata is codec. Growth comes from the image-codec neighbor, not from expanding image.

  **Why:** Image is a dependency bottleneck. Adding capabilities here adds weight to every downstream consumer. Keep it minimal.

- **[2026-07-02] `image-codec` is the blessed neighbor for DOM-free decode/encode.** Named `image-codec` (not `image-formats`) because it performs compressed pixel data ↔ raw RGBA decode/encode, which is fundamentally different from the `-formats` packages that parse structured data (JSON, XML containers). "Codec" is the precise industry term. Per-format registries (`registerImageDecoder(kind, decoder)`) — needed for native Rust (no DOM in the box).

  **Why:** The `-formats` suffix is reserved for data serialization parsers in this SDK. Image decode/encode is a codec operation, not a format parser. The distinction is immediately clear to users seeing both `textureatlas-formats` and `image-codec`.

- **[2026-07-02] `detectImageMimeType` migrates to image-codec when it exists.** Magic-byte format detection is codec territory (byte-level format identification), not resource lifecycle. Currently here because image-codec doesn't exist yet. When image-codec is built, detection moves there; image re-exports or drops the function.

  **Why:** Detection is logically part of the decode pipeline (sniff → dispatch to registered decoder). It lives here temporarily only because this was the first package extracted from resources.

- **[2026-07-02] Standardize byte input on `Uint8Array`.** `loadImageResourceFromArrayBuffer` currently takes `ArrayBuffer`. The SDK-wide convention should be `Uint8Array` for byte input seams (matches Rust `&[u8]`, has methods, callers trivially wrap `ArrayBuffer`). Rename or accept `Uint8Array`.

  **Why:** One consistent buffer convention at byte-level seams across the SDK. `ArrayBuffer` is the outlier — most APIs and the Rust port use typed array views.

- **[2026-07-02] Update Package Map description.** The Resources section lists image but could be more descriptive.

  **Why:** The Package Map is the orientation surface.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

- **[2026-09-02] `ImageResourceReference` keeps its name.** `Resource` stays in the reference type's name rather than shortening to `ImageReference`. The name says what it refers to: a reference to an image **resource**, not to an image in some looser sense, and it reads consistently beside the type that owns it, `ImageResource`. A reader meeting the pair together can tell which is the thing and which is the handle without checking either definition.

  **Why:** The shorter form would drop the one word that identifies the referent, and identifying the referent is the whole job of a reference type's name. Exported names in this SDK carry the full, unabbreviated name of the type they operate on, and a reference is named for what it points at.

## Open directions

1. **`loadImageResourceFromArrayBuffer` rename/signature.** When switching to `Uint8Array`, decide whether to rename the function (e.g. `loadImageResourceFromBytes`) or keep the name and change the parameter type. The function name convention includes the full type name — `loadImageResourceFromArrayBuffer` with a `Uint8Array` parameter would be misleading.

2. **image-codec package shape.** The breadth review has a detailed spec (Bronze/Silver/Gold). Key design questions: per-format registry shape, web fallback registrar, worker pool for off-thread decode, premultiplied alpha default, and animation home. These are image-codec charter questions, not image charter questions.

3. **image-codec-\* format backends.** Per-format packages (`image-codec-png`, `image-codec-jpeg`, etc.) vs a single `image-codec` with all built-in formats. The breadth review proposes per-format packages for tree-shaking. Confirm when image-codec direction session happens.
