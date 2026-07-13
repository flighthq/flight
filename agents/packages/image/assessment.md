---
package: '@flighthq/image'
updated: 2026-07-13
basedOn: ./review.md
---

# image — Assessment

Based on the 2026-07-13 re-verified review (solid, 68/100). Since the prior assessment, `@flighthq/image-codec` has been built (charter Decisions #2/#3 executed): `detectImageMimeType` migrated there, so the former Recommended item "extend the sniffer with AVIF/SVG/ICO" leaves this cell with it — that work now belongs to the image-codec cell. The remaining Recommended items are re-verified as still open in source (abort leak, `crossOrigin: string`, `isImageResourceSameOrigin` name).

The review keeps the capability gaps (loader→codec-registry routing, data constructor, `toBlob` export) in tension with charter Decision #1 ("package is at its natural scope ceiling"); those stay in Backlog as candidate Open directions rather than recommended against a blessed decision.

## Recommended

Sweep-safe: within `@flighthq/image`, no cross-package coupling, no open design decision.

1. **Fix `loadImageResourceFromUrl` abort handling.** Verified 2026-07-13: the abort race still leaves the underlying fetch running (no `img.src = ''` cancel on abort) and the abort listener leaks on the success path. Straight bug fix in the existing loader.

2. **Type `crossOrigin` as `'anonymous' | 'use-credentials'`** instead of `string` on `loadImageResourceFromUrl` (verified still `string`).

3. **Rename `isImageResourceSameOrigin` → `isImageUrlSameOrigin`.** It takes a URL, not an `ImageResource`, so the current name violates the "function name includes the type it operates on" rule. No consumers outside the package barrel.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Route image's loaders through the `image-codec` registry** (worker-safe `createImageBitmap` decode, `premultiplyAlpha` wired to `alphaType`). _Parked — cross-package design fork; candidate Open direction._ Successor of the old "createImageBitmap decode path" item now that the codec neighbor exists; today `loadImageResourceFromBytes` sniffs via the codec but still decodes via `new Image()`.
- **`createImageResourceFromPixels(data, width, height, format?)`.** _Parked — design decision; candidate Open direction._ Only `surface` can mint the data-only shape the `ImageResource` doc describes — a layering inversion — but it contradicts charter Decision #1's scope ceiling, so it needs the charter revisited, not a sweep.
- **`encodeImageResourceToBlob(resource, format, quality?)`.** _Parked — design decision; candidate Open direction._ Byte-level `encodeImage` now exists in image-codec; whether the browser-native `toBlob` resource wrapper belongs here is still charter-gated (charter routes all encode to the codec).
- **Backend seam for the load layer.** _Parked — cross-package design._ Loading and the same-origin check hard-reference `Image`, `URL.createObjectURL`, and `location`; image-codec covers decode/encode but the load layer itself has no `*Backend`.
- **`loadImageResourceFromBytes` throw → sentinel on undetectable type.** _Parked — breaking change with cross-package callers._ Verified the throw is still present; resolving `null` changes the return type for `tileset` and `textureatlas` callers and ties into the family-wide failure-convention decision shared with audio/video.
- **Meet `detectImageMimeType` and `ImageFormat`.** _Parked — now an image-codec cell question._ The sniffer lives in image-codec; widening `ImageFormat` to the sniffable set is a `@flighthq/types` + image-codec decision.
- **Barrel re-export of `detectImageMimeType` vs Package Map fix.** _Parked — doc/API mismatch is a user gate._ The map says image re-exports the sniffer; source does not. Either add the re-export or revise the map line — surfaced in the review's contract-fit section.
- **Charter touch-ups.** _Parked — charter is user-gated._ North star #2's "entity + types only" and "18 exports" in What-it-is are stale post-Decision-#3 (deps now include image-codec; 17 exports).
- **Rust `flighthq-image` crate.** _Parked — global posture._ Conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: loadImageResourceFromArrayBuffer → Uint8Array/rename, Package Map description update
