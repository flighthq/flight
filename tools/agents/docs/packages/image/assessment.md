---
package: '@flighthq/image'
updated: 2026-07-03
basedOn: ./review.md
---

# image — Assessment

Based on the 2026-07-03 review (solid, 62/100). Both previously approved sweep items have landed and are verified in source: `loadImageResourceFromBytes` (Uint8Array, correct `byteOffset` slicing) replaced `loadImageResourceFromArrayBuffer`, and the Package Map carries the fuller description. The review confirms the lifecycle core is the strongest part and close to final shape.

The review also surfaces several capability gaps (decode path, data constructor, encode, metadata probe) that sit in tension with charter Decision #1 ("package is at its natural scope ceiling — no missing capabilities within this scope"). Those are routed to Backlog as candidate Open directions rather than recommended against a blessed decision; the Recommended list below is confined to correctness fixes and convention alignment within the existing scope.

## Recommended

Sweep-safe: within `@flighthq/image`, no cross-package coupling, no open design decision.

1. **Fix `loadImageResourceFromUrl` abort handling.** The abort race leaves the underlying fetch running (no `img.src = ''` cancel on abort) and the abort listener leaks on the success path. Straight bug fix in the existing loader.

2. **Type `crossOrigin` as `'anonymous' | 'use-credentials'`** instead of `string` on `loadImageResourceFromUrl`.

3. **Extend `detectImageMimeType` with AVIF/HEIC (ISO BMFF `ftyp` brands), SVG (`<?xml`/`<svg` text sniff), and ICO signatures.** AVIF is mainstream browser content in 2026 and an `HTMLImageElement` decodes SVG fine. Same function, more magic bytes — the charter already keeps the sniffer here until image-codec exists (Decision #3), at which point the extended table migrates with it.

4. **Rename `isImageResourceSameOrigin` → `isImageUrlSameOrigin`.** It takes a URL, not an `ImageResource`, so the current name violates the "function name includes the type it operates on" rule. No consumers outside the package barrel.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **`createImageBitmap` decode path (worker-safe loading, `imageOrientation`/EXIF, `premultiplyAlpha` wired to `alphaType`).** _Parked — design decision; candidate Open direction for the charter._ The review calls this the single biggest missing capability (all loading funnels through `new Image()` + `decode()`, which needs a DOM document), but the API shape is a fork (variant loader vs an options bag selecting the decoder) and it challenges charter Decision #1's scope ceiling.
- **`createImageResourceFromPixels(data, width, height, format?)`.** _Parked — design decision; candidate Open direction for the charter._ The `ImageResource` doc describes data-only resources yet only `surface` can mint them — a layering inversion the entity layer should own. Contradicts charter Decision #1 ("no missing capabilities within this scope"), so it needs the charter revisited, not a sweep.
- **`encodeImageResourceToBlob(resource, format, quality?)`.** _Parked — design decision; candidate Open direction for the charter._ OpenFL's `Image.encode` is in the feature target and the review argues the browser-native `toBlob` wrapper belongs at this layer even with byte-level codecs destined for image-codec — but the charter currently routes all encode to the codec neighbor.
- **Header-only `getImageDimensionsFromBytes` probe (PNG IHDR / JPEG SOFn / GIF / WebP VP8X) and `isAnimatedImage`.** _Parked — charter routes metadata to image-codec (Decision #1/#2)._ Standard loader capabilities, but blessed as codec territory.
- **Backend seam for the load layer.** _Parked — cross-package design._ Loading and the same-origin check hard-reference `Image`, `URL.createObjectURL`, and `location`; the Rust port and worker/native hosts need the layer behind a `*Backend` seam (or the DOM loaders acknowledged as its web fill). Cross-cutting with the platform-suite pattern.
- **`loadImageResourceFromBytes` throw → sentinel on undetectable type.** _Parked — breaking change with cross-package callers._ Per the sentinel rule arbitrary bytes are expected failure, but resolving `null` changes the return type for `tileset` and `textureatlas` callers and ties into the family-wide failure-convention decision shared with audio/video.
- **Meet `detectImageMimeType` and `ImageFormat`.** _Parked — cross-package (`@flighthq/types`), tied to image-codec direction._ The sniffer returns a raw MIME string while `ImageFormat` (`'jpeg' | 'png'`) has zero producers or consumers; widening the type to the sniffable set is a header-layer change best decided with the codec charter.
- **`detectImageMimeType` migration to image-codec.** _Parked — image-codec doesn't exist yet._ Per charter Decision #3. When `@flighthq/image-codec` is built, magic-byte detection moves there; image re-exports or drops the function.
- **image-codec package creation.** _Parked — new package, needs its own direction session._ Per charter Decision #2. Registry shape, web fallback, worker pool, alpha convention, and animation home are image-codec charter questions.
- **Rust `flighthq-image` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: loadImageResourceFromArrayBuffer → Uint8Array/rename, Package Map description update
