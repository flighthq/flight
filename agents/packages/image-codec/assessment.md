---
package: '@flighthq/image-codec'
updated: 2026-07-13
basedOn: ./review.md
---

# image-codec — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe: within `@flighthq/image-codec`, no cross-package coupling, no breaking change, no open design fork.

1. **Add AVIF sniffing to `detectImageMimeType`** (ISO-BMFF `ftyp` box with `avif`/`avis` brand). Closes the registered-but-unsniffable hole: `registerWebImageDecoders` registers `image/avif` but auto-detect dispatch can never reach it. Pure additive branch in the sniffer + tests.
2. **Broaden the sniff set to ICO (`00 00 01 00`) and TIFF (`II*\0` / `MM\0*`)** while in the file — standard WHATWG image-sniffing entries; additive, null behavior unchanged for unknown headers.
3. **Add registry enumeration**: `getImageDecoderMimeTypes()` / `getImageEncoderMimeTypes()` returning the registered MIME strings. Capability discovery for accept headers/file pickers; read-only additions to the existing registry files, tree-shakable.
4. **Add `explain*` queries for the silent sentinels** per the diagnostics convention: e.g. `explainImageDecodeFailure(bytes, mimeType?)` and `explainImageEncodeFailure(mimeType)` returning plain data distinguishing unknown-MIME vs. no-codec-registered. Shakeable, no `@flighthq/log` dependency required for the query form.
5. **Test the `decodeImagePremultiplied` auto-detect path** (currently only the explicit-registration path and null sentinel are covered in `decodeImage.test.ts`). Small coverage close-out.

## Backlog

Parked, with why:

- **Web encoder silent-PNG-fallback fix** — `convertToBlob` can silently emit PNG when the requested type is unsupported; any honest fix needs `ImageEncoder` to signal failure (a `@flighthq/types` header change, hence cross-package) or an async support-probe registrar (shape decision). Routed to charter Open directions (review candidate #1).
- **Per-format DOM-free codec packages** (`image-codec-png` / `-jpeg` / `-webp` / `-avif`) — charter Open direction 1; new packages, bedrock-test + bless gate applies.
- **Worker pool for off-thread decode** — charter Open direction 2; ownership/shape undecided.
- **`decodeImageSequence` / animated formats** — charter Open direction 3; needs a multi-frame `DecodedImage` shape decision in `@flighthq/types`.
- **Pixel-format breadth beyond RGBA8** (16-bit, grayscale, HDR) — would reshape `DecodedImage`; charter currently fixes `Uint8ClampedArray` RGBA, so this is a direction question, not a sweep.
- **EXIF orientation policy** — contract wording decision (are decoded pixels orientation-applied?); needs a ruling before code.
- **Sniffer↔registrar parity rule** — whether the charter should mandate the sniff set covers every registrar MIME; item 1 above fixes today's instance, the standing rule is the charter's call.

## Approved

None.
