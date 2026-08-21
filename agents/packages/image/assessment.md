---
package: '@flighthq/image'
updated: 2026-08-01
basedOn: ./review.md
---

# image — Assessment

Based on the 2026-07-13 re-verified review (solid, 68/100). Since the prior assessment, `@flighthq/image-codec` has been built (charter Decisions #2/#3 executed): `detectImageMimeType` migrated there, so the former Recommended item "extend the sniffer with AVIF/SVG/ICO" leaves this cell with it — that work now belongs to the image-codec cell. Re-verified against live source on 2026-08-01 (4 source files, 2 test files, 32 tests, 13 exports): all three of those remaining items — the abort leak, `crossOrigin: string`, and the `isImageResourceSameOrigin` name — have since landed, so this cell has no open Recommended work.

The review keeps the capability gaps (loader→codec-registry routing, data constructor, `toBlob` export) in tension with charter Decision #1 ("package is at its natural scope ceiling"); those stay in Backlog as candidate Open directions rather than recommended against a blessed decision.

## Recommended

_None open._ All three items landed and were re-verified against live source on 2026-08-01; they are
recorded under [Landed](#landed) below, outside this section so the TODO generator stops reporting them as
work.

## Landed

1. ~~**Fix `loadImageResourceFromUrl` abort handling.**~~ Landed, both halves. Aborting now clears the
   pending load (`img.src = ''` in the abort listener) and rejects with `signal.reason`, and the listener is
   removed in a `finally` so it comes off on the success path as well as the abort path — the leak the item
   described cannot occur on either branch. `signal?.throwIfAborted()` also covers the already-aborted case
   before any element is created. Both behaviours are pinned by tests: one asserts the element's `src` is
   emptied when the signal fires mid-decode, and one asserts `addEventListener` and `removeEventListener`
   are each called once **with the same function reference**, which is what makes it a real leak check
   rather than a call-count check.

2. ~~**Type `crossOrigin` as `'anonymous' | 'use-credentials'`.**~~ Landed; the parameter carries the union,
   not `string`.

3. ~~**Rename `isImageResourceSameOrigin` → `isImageUrlSameOrigin`.**~~ Landed; the export is
   `isImageUrlSameOrigin(url: string)`, and the barrel re-exports it under that name. No occurrence of the
   old name remains.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Route image's loaders through the `image-codec` registry** (worker-safe `createImageBitmap` decode, `premultiplyAlpha` wired to `alphaType`). _Parked — cross-package design fork; candidate Open direction._ Successor of the old "createImageBitmap decode path" item now that the codec neighbor exists; today `loadImageResourceFromBytes` sniffs via the codec but still decodes via `new Image()`.
- **`createImageResourceFromPixels(data, width, height, format?)`.** _Parked — design decision; candidate Open direction._ Only `bitmap` can mint the data-only shape the `ImageResource` doc describes — a layering inversion — but it contradicts charter Decision #1's scope ceiling, so it needs the charter revisited, not a sweep.
- **`encodeImageResourceToBlob(resource, format, quality?)`.** _Parked — design decision; candidate Open direction._ Byte-level `encodeImage` now exists in image-codec; whether the browser-native `toBlob` resource wrapper belongs here is still charter-gated (charter routes all encode to the codec).
- **Backend seam for the load layer.** _Parked — cross-package design._ Loading and the same-origin check hard-reference `Image`, `URL.createObjectURL`, and `location`; image-codec covers decode/encode but the load layer itself has no `*Backend`.
- **`loadImageResourceFromBytes` throw → sentinel on undetectable type.** _Parked — breaking change with cross-package callers._ Verified the throw is still present; resolving `null` changes the return type for `tileset` and `textureatlas` callers and ties into the family-wide failure-convention decision shared with audio/video.
- **Meet `detectImageMimeType` and `ImageFormat`.** _Parked — now an image-codec cell question._ The sniffer lives in image-codec; widening `ImageFormat` to the sniffable set is a `@flighthq/types` + image-codec decision.
- **Barrel re-export of `detectImageMimeType` vs Package Map fix.** _Parked — doc/API mismatch is a user gate._ The map says image re-exports the sniffer; source does not. Either add the re-export or revise the map line — surfaced in the review's contract-fit section.
- **Charter touch-ups.** _Parked — charter is user-gated._ North star #2's "entity + types only" and "18 exports" in What-it-is are stale post-Decision-#3 (deps now include image-codec; 17 exports).
- **Rust `flighthq-image` crate.** _Parked — global posture._ Conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: loadImageResourceFromArrayBuffer → Uint8Array/rename, Package Map description update
- [2026-08-08 · picked] Backlog item "Backend seam for the load layer" — `ImageBackend` in `@flighthq/types`, then `createWebImageBackend` / `getImageBackend` / `setImageBackend` here, modelled on `@flighthq/net`. Lazy default, no top-level registration. The seam only: the codec-registry routing, fetch-based load, decode-error opacity, and abort-race items stay parked.
- [2026-08-21 · picked] SUPERSEDES the 2026-08-08 "Lazy default, no top-level registration" clause of the ImageBackend seam. The web implementation moves to `host-web` and is installed explicitly via `enableHostWeb*`; there is no lazy self-installing default. `set*Backend` remains the host-author seam and leaves the app author vocabulary. Resolution is custom > host > sentinel, order-independent, with an `explain*` query naming the live layer and the reason. User ruling, 2026-08-21; rationale in `agents/host-web-architecture.md`.
