# New Package Spec: @flighthq/image-codec

**Represents:** A DOM-free image decode/encode seam — `registerImageDecoder` / `registerImageEncoder` over swappable per-format backends (PNG, JPEG, WebP, AVIF) that turn an encoded byte buffer into raw RGBA pixels (and back) without an `HTMLImageElement`, so the native Rust host, web workers, and off-main-thread decode all share one path to/from `@flighthq/surface` / `@flighthq/resources`.

**Requested by:** asset-pipeline

## Fits

- **Position.** A leaf utility between the byte loader and the GPU/surface layer. Today `@flighthq/resources` decodes by handing bytes to a browser `Image`/`ImageBitmap`, which only exists on the DOM main thread and yields an opaque `CanvasImageSource` (no readable pixels). This package is the DOM-free alternative: bytes in → RGBA `Uint8ClampedArray` out, format-detected and dispatched to a registered backend.
- **Dependencies.** `@flighthq/types` (header layer; the codec types live there), `@flighthq/entity` (for the decoded-image entity/runtime split if needed), `@flighthq/geometry` (for size/rect out-params). It must **not** depend on `@flighthq/resources` or `@flighthq/surface` — they depend _on it_. The decoded output is a plain `{ width, height, pixels: Uint8ClampedArray }` (the same RGBA layout `Surface` and `tiny-skia`'s `Pixmap` use 1:1), so `@flighthq/surface` can wrap a decode result with `createSurface` and `@flighthq/resources` can offer `loadImageResourceFromArrayBuffer` a codec path with zero new coupling at the type level.
- **Backend seam.** Two registries keyed by `ImageFormatKind` string identifiers: `registerImageDecoder(kind, decoder)` and `registerImageEncoder(kind, encoder)` (last-write-wins, vendor-prefix for custom formats), mirroring the renderer registry and the `registerTextShaper` seam rather than the singleton `set*Backend` shape — image codecs are per-format, not one global capability. A web default backend (`createWebImageCodecBackend`, lazily registering decoders/encoders over `createImageBitmap` + `OffscreenCanvas`) keeps it working in the browser with no host; the native Rust host registers real codec crates.
- **Neighbor package.** `@flighthq/image-codec-formats` is **not** the right split (the formats _are_ the backends here, not parsers of a container). Instead the concrete backends are their own optional packages so a small example pulls only the formats it imports: `@flighthq/image-codec-png`, `@flighthq/image-codec-jpeg`, `@flighthq/image-codec-webp`, `@flighthq/image-codec-avif`. The root package ships only the seam, the format detection, and the web fallback. This matches `textshaper` (seam) + `textshaper-canvas` (backend).
- **Rust crate.** `flighthq-image-codec` plus `flighthq-image-codec-png` (the `png` crate), `-jpeg` (`jpeg-decoder`/`zune-jpeg` + `jpeg-encoder`), `-webp` (`image-webp`), `-avif` (`ravif`/`libavif`). The native default backend ships in-crate behind a `native` cargo feature (off for wasm), consistent with the host-layer "native ambient default" flip. The decoded `{ width, height, pixels }` is a value-typed leaf, so this is in the **mixable** set — a `surface-rs`-style wasm drop-in is viable and is a good early conformance target (deterministic, no GPU, headlessly fingerprintable).

## Bronze

The minimum DOM-free decode path: bytes → RGBA, format-detected, with PNG + JPEG covered (the two formats every asset pipeline needs) and a web fallback so nothing regresses in the browser.

- **Types in `@flighthq/types`** (header first):
  - `ImageFormatKind` — string-kind identifiers: `ImageFormatPngKind = 'image/png'`, `ImageFormatJpegKind`, `ImageFormatWebpKind`, `ImageFormatAvifKind` (canonical MIME-string values so they double as the serialized form).
  - `DecodedImage` — `{ readonly width: number; readonly height: number; readonly pixels: Uint8ClampedArray; readonly format: ImageFormatKind }` (RGBA8, non-premultiplied, top-left origin — documented).
  - `ImageDecoder` — `{ decode(bytes: Readonly<Uint8Array>): DecodedImage | null }` (returns `null` on malformed/unsupported input — sentinel, not throw).
  - `ImageEncoder` — `{ encode(image: Readonly<DecodedImage>, options?: Readonly<ImageEncodeOptions>): Uint8Array | null }`.
  - `ImageEncodeOptions` — `{ quality?: number }` (Bronze: quality only).
- **Seam functions (`@flighthq/image-codec`):**
  - `registerImageDecoder(kind, decoder)`, `getImageDecoder(kind): ImageDecoder | null`.
  - `registerImageEncoder(kind, encoder)`, `getImageEncoder(kind): ImageEncoder | null`.
  - `detectImageFormat(bytes: Readonly<Uint8Array>): ImageFormatKind | null` — magic-byte sniff (the DOM-free, byte-buffer analogue of `detectImageMimeType`, which is currently `ArrayBuffer`-typed and lives in `resources`).
  - `decodeImage(bytes: Readonly<Uint8Array>): DecodedImage | null` — sniff format, dispatch to the registered decoder, return `null` if none registered or decode fails.
  - `encodeImage(image, format, options?): Uint8Array | null` — dispatch to the registered encoder.
- **Web fallback backend:** `createWebImageCodecBackend(): void`-style registrar (`registerWebImageDecoders()` / `registerWebImageEncoders()`) over `createImageBitmap` + `OffscreenCanvas.getContext('2d').getImageData` for decode and `OffscreenCanvas.convertToBlob` for encode. Guards on availability; the registrars are explicit opt-in (no top-level side effects).
- **First two format backends:** `@flighthq/image-codec-png` (`registerPngImageCodec()`), `@flighthq/image-codec-jpeg` (`registerJpegImageCodec()`), each registering both decoder and encoder.
- **Tests:** colocated `*.test.ts` per source file; round-trip (encode → decode → compare), malformed-input → `null`, format detection from magic bytes, registry last-write-wins.
- **Rust:** `flighthq-image-codec` seam + `flighthq-image-codec-png` and `-jpeg` with the `png` / `jpeg-decoder`+`jpeg-encoder` crates behind `native`. Conformance: decode the same committed test image in TS and Rust, fingerprint-compare the RGBA.

## Silver

Competitive with `image-rs` / browser-grade decoders: full common-format set, metadata, sub-decode for memory, and the off-thread story the breadth review explicitly asked for.

- **Types (`@flighthq/types`):**
  - `ImageMetadata` — `{ width, height, format, hasAlpha: boolean, colorSpace: ImageColorSpace, bitDepth: number, frameCount: number, orientation: ImageOrientation }` (read header without decoding pixels).
  - `ImageColorSpace` (`'srgb' | 'display-p3' | 'linear'`), `ImageOrientation` (EXIF 1–8).
  - `ImageDecodeOptions` — `{ premultiplyAlpha?: boolean; applyOrientation?: boolean; targetColorSpace?: ImageColorSpace; subRegion?: Readonly<Rectangle> }`.
  - Extend `ImageEncodeOptions` — `{ quality?: number; lossless?: boolean; chromaSubsampling?: ChromaSubsampling; premultipliedAlpha?: boolean }`.
  - `ImageDecoder.probe?(bytes): ImageMetadata | null` and `ImageDecoder.decode(bytes, options?)` overload accepting `ImageDecodeOptions`.
- **Seam additions:**
  - `probeImage(bytes): ImageMetadata | null` — header-only metadata, no pixel allocation.
  - `decodeImageInto(out: Uint8ClampedArray, bytes, options?): DecodedImage | null` — caller-owned buffer, explicit-allocation `out` variant for hot/streaming paths.
  - `getRegisteredImageFormats(): ReadonlyArray<ImageFormatKind>` — capability query so callers can pick formats they can actually decode.
  - `canDecodeImageFormat(kind): boolean` / `canEncodeImageFormat(kind): boolean`.
  - EXIF orientation application and sRGB/ICC-aware color handling at decode (gated by `ImageDecodeOptions`).
- **Format coverage:** add `@flighthq/image-codec-webp` (`registerWebpImageCodec()`) and `@flighthq/image-codec-avif` (`registerAvifImageCodec()`), each with both directions. Add GIF/BMP as part of the WebP/animated package or a small `-gif` sibling if scope warrants.
- **Off-thread decode:** `decodeImageOnWorker(bytes, options?): Promise<DecodedImage | null>` plus `createImageCodecWorkerPool(size)` / `disposeImageCodecWorkerPool(pool)` — transfers the `Uint8Array` in and the decoded `pixels` buffer out via `Transferable`, so large decodes never block the main thread (the review's "off-main-thread decode" requirement). Mirrors as a thread-pool in Rust.
- **Resources integration (in `@flighthq/resources`, not here):** a codec-backed `loadImageResourceFromArrayBuffer` path that, when a decoder is registered, produces a readable-pixel `ImageResource` rather than an opaque `CanvasImageSource` — closing the "image decode is browser-DOM-bound" gap the review names.
- **Signals (opt-in):** `enableImageCodecSignals()` exposing a decode-progress/error signal group for progressive formats (progressive JPEG, interlaced PNG) — only paid for when enabled, owned by this package.
- **Rust parity:** all four format crates, the worker-pool analogue, EXIF/color handling, `probe`/`decode_image_into`. Recorded in the conformance map; decode fingerprints compared cell-by-cell in the parity matrix (`rust:png` vs `ts:png`, etc.).

## Gold

Authoritative: animation, streaming, every production format/quirk, performance, and exhaustive conformance — nothing a codec expert would find missing.

- **Animated / multi-frame decode (types in `@flighthq/types`):**
  - `DecodedImageSequence` — `{ width, height, frames: ReadonlyArray<DecodedImageFrame>, loopCount, format }`; `DecodedImageFrame` — `{ pixels, durationMs, disposalMode, blendMode, offsetX, offsetY }`.
  - `decodeImageSequence(bytes): DecodedImageSequence | null` and `encodeImageSequence(sequence, format, options?): Uint8Array | null` for animated WebP/AVIF/GIF/APNG.
  - Streaming/incremental decode: `createImageDecodeStream(format): ImageDecodeStream` with `pushImageDecodeStream(stream, chunk)`, `readImageDecodeStream(stream): DecodedImageSplit | null` (partial rows for progressive display), `disposeImageDecodeStream(stream)`.
- **Full format/quirk coverage:** PNG (all bit depths/interlace/tRNS/16-bit), JPEG (progressive, CMYK, restart markers, EXIF thumbnails), WebP (lossy+lossless+alpha+animation), AVIF (HDR/10-12-bit, film grain), plus APNG, GIF (LZW + disposal), BMP, TGA, and an HDR tier (`'image/x-exr'`, `'image/vnd.radiance'`) producing `Float32Array` pixels via a `DecodedImageHdr` variant. ICC profile parsing and accurate color management to `targetColorSpace`.
- **Encoder depth:** per-format quality/effort knobs, lossless modes, chroma-subsampling control, palette/quantization for GIF/indexed PNG, metadata preservation (EXIF/XMP write-through), deterministic byte output for reproducible builds (key for fingerprint conformance).
- **Performance:** SIMD/wasm-SIMD decode paths, zero-copy where the source is already RGBA, `decodeImageInto` everywhere, the worker pool as the default for large images, and a documented allocation budget. Benchmarks committed alongside.
- **Error model:** rich-but-non-throwing — `getLastImageCodecError(): ImageCodecError | null` (a value, not an exception), `ImageCodecErrorKind` enum (`'unsupported-format' | 'truncated' | 'corrupt' | 'unsupported-feature' | 'dimensions-too-large'`), and a hard `maxImageDimension` guard against decompression bombs. Public functions still return sentinels; the error detail is queryable.
- **Docs:** a package doc covering the RGBA layout contract, premultiplied-alpha and color-space conventions, the register-per-format model, the worker pool, and the format support matrix.
- **Rust 1:1:** every format crate (rustybuzz-style native crates: `png`, `zune-jpeg`/`jpeg-encoder`, `image-webp`, `ravif`/`libavif`, `gif`, `apng`, `exr`), animation, streaming, HDR, color management, SIMD, and the worker/thread-pool. Full divergence map entries for any web-only format (e.g. browser-native AVIF where no Rust crate matches). The mixable `image-codec` wasm drop-in (`@flighthq/image-codec-rs`) validated by the conformance suite as a faithful replacement for the TS seam.

## Boundaries

- **Byte loading stays in `@flighthq/loader` / `@flighthq/resources`.** This package never fetches a URL, reads a file, or touches the network. It takes a buffer and returns pixels (or the reverse). Source-agnostic loading, retry, concurrency, and caching are the loader/resources/asset-cache domain.
- **GPU upload stays in the render backends.** Decoded RGBA → GPU texture is `render-gl`/`render-wgpu`'s `*TextureEntry` path. This package produces the CPU-side pixels they upload.
- **Compressed/GPU-native formats (KTX2, Basis, DDS, ASTC/BC) are a separate `@flighthq/texture-formats` package**, not here. Those are block-compressed container formats decoded _into GPU memory_, not RGBA — a different seam with a different output type. The review lists them as a distinct gap.
- **Pixel manipulation stays in `@flighthq/surface`.** Once decoded, blur/color-matrix/composite is surface territory. This package only owns the encoded↔RGBA boundary.
- **`ImageResource` and `Surface` wrap the output; they are not defined here.** The codec output is the plain `DecodedImage` data shape so it stays a leaf with no upward dependency. The convenience `createSurfaceFromDecodedImage` / codec-backed `loadImageResourceFromArrayBuffer` live in `surface` / `resources` respectively.
- **No `displayobject-canvas`-style DOM dependency in the core or Rust crate.** The web fallback (`createImageBitmap`/`OffscreenCanvas`) lives only in the optional web-default registrar; the seam, detection, and native crates are DOM-free by construction.

## Open design questions

- **Registry shape: per-format `register*` vs singleton `set*Backend`.** This spec proposes per-format `registerImageDecoder(kind, …)` (like the renderer registry) rather than one `setImageCodecBackend`, because formats are independently available (a host might have native PNG but rely on the browser for AVIF). Confirm this against the platform-suite convention, which leans on the singleton `set*Backend` shape.
- **Premultiplied alpha default.** Renderers use premultiplied RGBA8; `Surface` is documented as straight alpha. Should `decodeImage` return straight alpha (matching `Surface`) and require an explicit `premultiplyAlpha: true`, or premultiply by default to match the GPU path? Pick one convention SDK-wide.
- **`Uint8Array` vs `ArrayBuffer` at the seam.** `resources.detectImageMimeType` takes `ArrayBuffer`; surfaces use `Uint8ClampedArray`. Standardize the codec on `Uint8Array` in / `Uint8ClampedArray` out and decide whether to deprecate/realign the `resources` `ArrayBuffer` signature.
- **Color-space ambition vs bundle/parity cost.** Full ICC/CMS is heavy and a parity risk (TS `OffscreenCanvas` color handling vs a Rust CMS crate may diverge). Where should the Silver/Gold line sit, and which color paths are conformance-exact vs documented divergences?
- **Animation home.** Should animated decode live here (`decodeImageSequence`) or feed `@flighthq/spritesheet`'s frame model directly? A bridge (`createSpritesheetFromImageSequence`) likely belongs in `spritesheet`, but the raw multi-frame decode belongs here — confirm the seam.
- **AVIF on native.** `ravif`/`libavif` pull a C dependency that complicates the pure-Rust, cross-compile story. Decide whether AVIF native is a first-class Gold target or a documented web-only divergence with a pure-Rust fallback when one matures.
