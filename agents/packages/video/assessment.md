---
package: '@flighthq/video'
updated: 2026-07-03
basedOn: ./review.md
---

# video — Assessment

Based on the 2026-07-03 review (stub, 15/100). Both previously approved sweep items have landed and are verified in source: the fire-and-forget `create*FromUrl` loaders are gone and `inferVideoType` lives in a shared `videoFormat.ts`. The abort handling in the URL loader is the best-crafted code in the package; the review's verdict is that the package now needs the other four-fifths of its layer. Items mirror the `@flighthq/image` sibling where a direct analogue exists.

## Recommended

_None open._ All six original items landed in commit `2ef652b3` and were re-verified against live source on 2026-07-30; they are recorded under [Landed](#landed) below, deliberately outside this section so the TODO generator stops reporting them as work. The next actionable step for this package is the re-review the [review](./review.md) already calls for, which should re-score from the current surface rather than the 15/100 stub this assessment was written against.

## Landed

1. ~~**Loader options — `crossOrigin`, `muted`, `playsInline`, `preload`, readiness mode.**~~ Landed; all five are applied in `videoResourceFrom.ts`, readiness mapped to `loadedmetadata` / `canplay` / `canplaythrough`.
2. ~~**Lifecycle — `disposeVideoResource`, `hasVideoResourceElement`, `isVideoResourceEmpty`, `isVideoResourceReady`.**~~ Landed in `videoResource.ts`, with the `removeAttribute('src')` + `load()` sequence and the clone-is-N/A decision documented at the top of the file.
3. ~~**Inspection getters — `getVideoResourceWidth`, `getVideoResourceHeight`, `getVideoResourceDuration`.**~~ Landed.
4. ~~**Non-URL sources — `loadVideoResourceFromBlob`, `createVideoResourceFromMediaStream`.**~~ Landed. The Blob loader's object-URL ownership is _not_ settled, though — see the revoke-timing entry in Backlog.
5. ~~**Format family symmetry — `inferVideoMimeType`, `detectVideoMimeType`, extended MIME table.**~~ Landed.
6. ~~**Export the codec-negotiation primitive — `selectVideoResourceUrl` / `canPlayVideoType`.**~~ Landed; both are in the package barrel.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **`loadVideoResourceFromBlob` revokes its object URL at readiness, not at end of life.** _Parked — design decision; needs a ruling on who owns the URL._ The `finally` revoke fires as soon as the load settles, but settling means only that the chosen readiness event fired — not that the media data has been fetched. With `readiness: 'metadata'` the element has read the container header and nothing else, so revoking there reliably breaks playback; even at `canplay` the element still fetches (and re-fetches on seek) from a URL that no longer resolves. The function's comment claims ownership ("revokes it once the load settles, so the caller never has to"), which is the right instinct at the wrong moment — the revoke belongs at disposal. Every fix crosses a seam, which is why this is parked and not swept: revoking in `disposeVideoResource` means `VideoResource` grows an `objectUrl` field in `@flighthq/types` (and raises whether freeing a blob-URL-store entry is `dispose*` or `destroy*` under the teardown-verb rule); returning the URL to the caller contradicts the ownership the function advertises. Note the two existing tests pin the current timing, so they encode the defect and would need to move with the ruling.

- **Frame-capture seam (video → `ImageResource` / `Bitmap`).** _Parked — design decision / cross-package; candidate Open direction for the charter._ Grabbing a frame into pixels is the standard bridge to `@flighthq/bitmap`/`@flighthq/image`, but no seam exists on either side — the review explicitly raises it as a cross-package design question.
- **Unify the `*FromUrl` (reject) vs `*FromUrls` (empty-resource sentinel) failure convention.** _Parked — design decision._ Same family-wide fork as audio; needs one ruling across the resource family rather than a per-package fix.
- **Split playback types out of `VideoResource.ts` in `@flighthq/types`.** _Parked — cross-package._ `VideoChannel`, `VideoChannelState`, and `VideoPlayOptions` cohabit with the resource type (and `VideoChannel.gain` vs the element's `volume` shows the resource/media blur persisting in the header layer); a types-package edit for when that file is next touched.
- **Sync `createVideoResource(element?)` wrapper — keep or drop.** _Parked — charter Open direction #2._ Whether a `{ element: element ?? null }` literal wrapper earns a function is a direction question.
- **Rust `flighthq-video` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: remove fire-and-forget URL loaders, DRY inferVideoType
