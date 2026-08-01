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

_None open._ Re-verified against live source on 2026-07-31 (9 source files, 9 test files, 53 tests).
Both close-out items landed and are recorded under [Landed](#landed), outside this section so the TODO
generator stops reporting them as work.

## Landed

1. ~~**Add `explain*` queries for the silent sentinels.**~~ Landed.
   `explainImageDecodeFailure(bytes, mimeType?)` distinguishes an undetected MIME type from a missing
   registered decoder, and `explainImageEncodeFailure(mimeType)` reports a missing encoder. Both are
   separately importable, return plain data, do not invoke codecs, and preserve the async dispatchers'
   existing `null` contracts. The decode distinction is mutation-proven.
2. ~~**Test the `decodeImagePremultiplied` auto-detect path.**~~ Landed. The explicit MIME dispatch and
   omitted-MIME detection paths now have separate named cases, both pinning the premultiplication option.

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
