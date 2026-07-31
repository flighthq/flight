---
package: '@flighthq/image-codec'
updated: 2026-07-31
basedOn: ./review.md
---

# image-codec — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Depth gaps

1. **Verify decode behavior with canonical real files.** Synthetic headers prove dispatch but not decoder correctness, orientation, color profile handling, animation, HDR/bit depth, or corrupt/truncated-input behavior. Add small provenance-recorded fixtures and decoded-pixel assertions.
2. **Expose progressive/multi-frame decode as separate seams when demanded.** Animated images and incremental decode should not inflate the one-shot RGBA8 primitive; add independently imported decoder capabilities and honest capability enumeration.

## Recommended

Sweep-safe: within `@flighthq/image-codec`, no cross-package coupling, no breaking change, no open design fork. MIME detection and registry enumeration completed 2026-07-31.

1. **Add `explain*` queries for the silent sentinels** per the diagnostics convention: e.g. `explainImageDecodeFailure(bytes, mimeType?)` and `explainImageEncodeFailure(mimeType)` returning plain data distinguishing unknown-MIME vs. no-codec-registered. Shakeable, no `@flighthq/log` dependency required for the query form.
2. **Test the `decodeImagePremultiplied` auto-detect path** (currently only the explicit-registration path and null sentinel are covered in `decodeImage.test.ts`). Small coverage close-out.

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
