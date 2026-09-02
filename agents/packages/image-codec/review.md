---
package: '@flighthq/image-codec'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# image-codec — Review

**Verdict:** solid — 78/100. The Bronze scope (2026-07-09 Decisions) is fully shipped and every gap the prior review found has been addressed: AVIF/ICO/TIFF sniffing landed, registry enumeration via `get*MimeTypes()` landed, and `explain*` diagnostics for the silent sentinels landed. A new bitmap-composer registry adds format-neutral image-composition dispatch consumed by `@flighthq/image`. What keeps the score from higher is that the remaining gaps are all cross-package or charter-level direction decisions (encoder failure signaling, per-format wasm codecs, worker pool, animation), none of which are within-package sweep work.

## Present capabilities

Nine source files, nine colocated test files, 53 tests (counted from describe/it blocks across all test files).

- **Decoder registry** (`imageDecoderRegistry.ts`, 32 lines): global MIME-keyed `Map`, empty at import, last-write-wins. Full sextet: `registerImageDecoder`, `getImageDecoder`, `hasImageDecoder`, `unregisterImageDecoder`, `clearImageDecoders`, `getImageDecoderMimeTypes`. The enumeration function returns an insertion-ordered snapshot array isolated from registry state. Tests (84 lines, 6 describe blocks) cover all six functions including last-write-wins and snapshot isolation.

- **Encoder registry** (`imageEncoderRegistry.ts`, 32 lines): symmetric twin of the decoder registry. Same six-function surface: `registerImageEncoder`, `getImageEncoder`, `hasImageEncoder`, `unregisterImageEncoder`, `clearImageEncoders`, `getImageEncoderMimeTypes`. Tests (80 lines, 6 describe blocks) mirror the decoder registry tests.

- **Bitmap composer registry** (`imageBitmapComposerRegistry.ts`, 30 lines): format-neutral registry keyed by `kind` string, mapping to `ImageBitmapComposer` callbacks. Full sextet: `registerImageBitmapComposer`, `getImageBitmapComposer`, `hasImageBitmapComposer`, `unregisterImageBitmapComposer`, `clearImageBitmapComposers`, `getImageBitmapComposerKinds`. Consumed by `@flighthq/image` (`imageResourceReference.ts`) for composing pixel data from non-standard bitmap sources. Exposed on the contract lane only, not on the public `.` lane -- this is correct since it is an intra-SDK seam, not an end-user API. Tests (72 lines, 6 describe blocks) cover all six functions.

- **Dispatchers** (`decodeImage.ts`, 30 lines; `encodeImage.ts`, 15 lines):
  - `decodeImage(bytes, mimeType?)` auto-detects via `detectImageMimeType` when the MIME type is omitted, dispatches to the registered decoder, returns `null` when the type cannot be determined or no decoder is registered.
  - `decodeImagePremultiplied(bytes, mimeType?)` passes `{ premultiplyAlpha: true }` to the resolved decoder per the straight-default/opt-in-premultiplied charter decision.
  - `encodeImage(image, mimeType, options?)` dispatches to the registered encoder, forwarding `ImageEncodeOptions`; returns `null` when no encoder is registered.
  - Tests: `decodeImage.test.ts` (70 lines, 2 describe blocks, 8 tests covering auto-detect, explicit MIME, both null sentinels, premultiply option forwarding, and the auto-detect premultiplied path). `encodeImage.test.ts` (37 lines, 1 describe block, 3 tests covering dispatch, options forwarding, and null sentinel).

- **MIME sniffing** (`detectImageMimeType.ts`, 70 lines): magic-byte detection for PNG, JPEG, GIF, WebP (RIFF+WEBP), AVIF (ISO-BMFF `ftyp` box with major and compatible brand scanning for `avif`/`avis`), ICO, TIFF (both endiannesses), BMP. Accepts `Readonly<Uint8Array> | ArrayBuffer`; returns `null` for buffers shorter than 4 bytes or unrecognized headers. Tests (102 lines, 1 describe block, 11 tests) cover every format including AVIF major brand, AVIF via compatible brand, rejection of non-AVIF ftyp boxes, and the `Uint8Array` input path.

- **Diagnostics** (`explainImageDecodeFailure.ts`, 16 lines; `explainImageEncodeFailure.ts`, 10 lines): `explainImageDecodeFailure(bytes, mimeType?)` returns `ImageDecodeFailureExplanation` distinguishing `'mime-type-undetected'` from `'decoder-not-registered'`, or `null` when a decoder can handle the request. `explainImageEncodeFailure(mimeType)` returns `ImageEncodeFailureExplanation` with `'encoder-not-registered'`, or `null`. Both are read-only queries that never invoke a codec. Types are discriminated unions in `@flighthq/types`. Tests: decode (37 lines, 3 tests), encode (24 lines, 2 tests), both verifying non-invocation of registered codecs.

- **Web decoder registrar** (`registerWebImageDecoders.ts`, 54 lines): registers a shared `createImageBitmap` + `OffscreenCanvas` + `getImageData` decoder under png/jpeg/webp/gif/avif/bmp. `bytes.slice()` detaches from pooled input. JS `premultiplyRgbaInPlace` fallback since `getImageData` is always straight alpha. Tests (80 lines, 3 tests) cover MIME registration, straight decode, byte-view slicing, and premultiply math (`[200,100,50,128] -> [100,50,25,128]`).

- **Web encoder registrar** (`registerWebImageEncoders.ts`, 27 lines): per-MIME `convertToBlob({ type, quality })` closures under png/jpeg/webp. Copies `image.data` via `new Uint8ClampedArray(image.data)` so a `Readonly` input is never aliased into `ImageData`. Tests (78 lines, 3 tests) cover MIME registration, byte extraction, and quality forwarding.

- **Types in `@flighthq/types`**: `DecodedImage` (straight RGBA8, `Uint8ClampedArray` + dimensions), `ImageDecoder` (function type), `ImageEncoder` (function type), `ImageDecodeOptions` (`premultiplyAlpha`), `ImageEncodeOptions` (`quality`), `ImageDecodeFailureExplanation` (discriminated union), `ImageEncodeFailureExplanation`, `ImageBitmapComposition` (plain data: `kind` + `payload`), `ImageBitmapComposer` (callback type). All in individual files with durable semantic comments.

- **Export lanes**: public `.` lane (`index.ts`) exports 21 named functions covering the decoder/encoder registries, dispatchers, MIME detection, diagnostics, web registrars, and enumeration. Contract lane (`contract.ts`) re-exports everything including the bitmap-composer registry functions. This correctly keeps the composer registry as an intra-SDK seam.

- **Manifest**: `package.json` declares `sideEffects: false`, depends only on `@flighthq/types`, exports both `.` and `./contract` lanes, and excludes test artifacts from the published package.

## Gaps

- **Web encoder silent-fallback hazard.** `convertToBlob({ type })` falls back to PNG when the platform cannot encode the requested type (e.g. `image/webp` on older engines); `createCanvasImageEncoder` never checks `blob.type`, so `encodeImage(img, 'image/webp')` can silently return PNG bytes. The `ImageEncoder` return type (`Promise<Uint8Array>`, no failure sentinel) has no channel to report this. Fixing this touches the `ImageEncoder` type in `@flighthq/types` (cross-package).

- **No DOM-free codecs.** The "DOM-free seam" currently has only DOM-backed implementations (web registrars). Per-format wasm codec packages (`image-codec-png` / `-jpeg` / `-webp` / `-avif`) are charter Open direction 1 -- deliberately deferred, not an in-package gap.

- **No worker pool for off-thread decode.** Charter Open direction 2; shape and ownership undecided.

- **No animated/multi-frame decode.** `decodeImageSequence` is charter Open direction 3; needs a multi-frame `DecodedImage` shape decision in `@flighthq/types`.

- **Pixel-format breadth beyond RGBA8.** `DecodedImage` is fixed to `Uint8ClampedArray` RGBA. 16-bit, grayscale, and HDR decode are outside the current shape. The charter does not say whether RGBA8-only is permanent.

- **EXIF orientation policy.** `createImageBitmap` applies `imageOrientation: 'from-image'` by default in modern browsers; whether decoded pixels are orientation-applied is unstated in the charter or the `ImageDecoder` contract.

- **No `enableImageCodecGuards()` guard layer.** The diagnostics convention calls for a separately importable guard module that emits warnings through `@flighthq/log`. The `explain*` queries provide the plain-data seam, but there is no guard that wraps `decodeImage`/`encodeImage` with runtime warnings on null returns. This is a within-package gap, though it matches the broader pattern of guard layers being a later addition across many packages.

- **No real-file decode verification.** All tests use synthetic byte headers and mocked globals. No test decodes actual encoded image bytes through a real decoder, so orientation, color profile, corrupt input, and truncated-file behavior are unverified.

## Charter contradictions

None found. Every charter Decision is honored in source:

- **Registry keyed by MIME type, per-format** -- confirmed in `imageDecoderRegistry.ts` and `imageEncoderRegistry.ts` (`Map<string, ImageDecoder/ImageEncoder>`).
- **Straight-alpha default, opt-in premultiplied** -- `decodeImage` dispatches without `premultiplyAlpha`; `decodeImagePremultiplied` passes `{ premultiplyAlpha: true }`. The web decoder implements the JS fallback since `getImageData` is always straight.
- **`detectImageMimeType` migrated here from `@flighthq/image`** -- confirmed. `image` imports it from `@flighthq/image-codec/contract` at `imageResourceFrom.ts:2` and does NOT re-export it from its barrel (verified: `packages/image/src/index.ts` has no `detectImageMimeType`).
- **First-build scope = Bronze** -- all Bronze items (core registry, web registrars, MIME migration) are present and tested.
- **Depends only on `@flighthq/types`** -- `package.json` confirms a single runtime dependency.
- **No import side effects** -- `sideEffects: false`, all registries are empty at import, module state at file bottom.

## Contract & docs fit

**Package to contract (good):**
- Types header-first in `@flighthq/types` (one concept per file, durable comments).
- Unabbreviated self-identifying function names (`registerImageDecoder`, `detectImageMimeType`, `explainImageDecodeFailure`).
- `null` sentinels for expected failures; no throws.
- Two blessed export lanes (`.` and `./contract`).
- `sideEffects: false` with module-scoped mutable state at file bottom.
- `Readonly<>` on all inputs consistently.
- Free functions only, no classes.
- Exported functions alphabetized in `index.ts`.
- `explain*` diagnostics provide the plain-data seam for silent sentinels (diagnostics inversion rule partially met; guard layer not yet present).

**Candidate docs revisions:**
- The prior review's candidate revision about the Package Map stale `image` line (claiming re-export of `detectImageMimeType`) should be checked for whether it was addressed. The claim was stale in 2026-07-13; if the Package Map still carries it, it remains a candidate revision.
- The charter's `Open directions` section lists three items but does not mention the bitmap-composer registry that was added post-charter-direction (`029f05417`). The composer registry is a significant addition that sits outside any charter Decision. Whether it should be retroactively acknowledged in the charter's Decisions or its absence there is intentional is a question for direction.

## Candidate open directions

These are questions the charter does not answer that this review had to assume or work around. They feed the charter's Open directions for the user to settle.

1. **Encoder failure signaling.** Should `ImageEncoder` be able to report "cannot produce this format" (return-type change to `Promise<Uint8Array | null>` in `@flighthq/types`), or should registrars only register verified-supported types? Needed to close the silent-PNG-fallback hazard.
2. **EXIF orientation policy.** Should the `ImageDecoder` contract state whether decoded pixels are orientation-applied? The web decoder inherits the browser default (`imageOrientation: 'from-image'`), but this is never documented.
3. **Pixel-format breadth.** Is RGBA8-only permanent, or should `DecodedImage` accommodate 16-bit/grayscale/HDR in the future?
4. **Bitmap-composer charter acknowledgment.** The `imageBitmapComposerRegistry` was added post-direction session. Should it be blessed via a charter Decision, and does its contract-lane-only exposure need explicit mention in the charter's Boundaries?
5. **Guard layer (`enableImageCodecGuards`).** Should this package provide a guard layer that wraps the dispatchers with `@flighthq/log` warnings, or is the `explain*` plain-data seam sufficient for this package's scope?
