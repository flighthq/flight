---
package: '@flighthq/video'
updated: 2026-07-03
basedOn: ./review.md
---

# video — Assessment

Based on the 2026-07-03 review (stub, 15/100). Both previously approved sweep items have landed and are verified in source: the fire-and-forget `create*FromUrl` loaders are gone and `inferVideoType` lives in a shared `videoFormat.ts`. The abort handling in the URL loader is the best-crafted code in the package; the review's verdict is that the package now needs the other four-fifths of its layer. Items mirror the `@flighthq/image` sibling where a direct analogue exists.

## Recommended

Sweep-safe: within `@flighthq/video`, no cross-package coupling, no open design decision.

1. **Loader options — `crossOrigin`, `muted`, `playsInline`, `preload`, and a readiness mode (`metadata` | `canplay` | `canplaythrough`).** The single most consequential gap: without `crossOrigin='anonymous'` the loaded element taints WebGL/WebGPU texture uploads, so the loader as shipped cannot legally feed the SDK's own GPU renderers cross-origin, and games almost always need `muted` + `playsInline` for mobile autoplay. An options parameter (a `VideoResourceLoadOptions` descriptor, header-layer-first) replaces the hard-coded `preload='auto'` / resolve-on-`canplay` policy — the within-unit missing-primitive smell. One-file change with outsized value.

2. **Lifecycle — `disposeVideoResource` (with the decoder-releasing `removeAttribute('src')` + `load()` sequence), `hasVideoResourceElement`, `isVideoResourceEmpty`, `isVideoResourceReady`.** Video is the asset type where teardown matters most — a dropped reference alone can keep platform decoders alive. Document clone as N/A for an element carrier while here (the review asks for the decision, not the function).

3. **Inspection getters — `getVideoResourceWidth`, `getVideoResourceHeight`, `getVideoResourceDuration`.** Needed by every consumer that sizes a `Video` display object or allocates a texture; today consumers must reach through `.element`, making the carrier type pure ceremony.

4. **Non-URL sources — `loadVideoResourceFromBlob` and `createVideoResourceFromMediaStream`.** The Blob loader owns and revokes its object URL (which is exactly why the primitive belongs here); the MediaStream constructor is the seam webcam output flows through, implemented purely over DOM types with no package dependency.

5. **Format family symmetry — rename `inferVideoType` → `inferVideoMimeType`; add magic-byte `detectVideoMimeType` (`ftyp` boxes, EBML/Matroska, `OggS`); extend the MIME table with `m3u8`, `mpd`, `mkv`, `3gp`.** Restores the triad with image's `detectImageMimeType`; no consumers outside the package barrel.

6. **Export the codec-negotiation primitive — `selectVideoResourceUrl` / `canPlayVideoType`.** The `canPlayType` negotiation inside `loadVideoResourceFromUrls` is unavailable standalone, so capability probing without loading requires reimplementation.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Frame-capture seam (video → `ImageResource` / `Surface`).** _Parked — design decision / cross-package; candidate Open direction for the charter._ Grabbing a frame into pixels is the standard bridge to `@flighthq/surface`/`@flighthq/image`, but no seam exists on either side — the review explicitly raises it as a cross-package design question.
- **Unify the `*FromUrl` (reject) vs `*FromUrls` (empty-resource sentinel) failure convention.** _Parked — design decision._ Same family-wide fork as audio; needs one ruling across the resource family rather than a per-package fix.
- **Split playback types out of `VideoResource.ts` in `@flighthq/types`.** _Parked — cross-package._ `VideoChannel`, `VideoChannelState`, and `VideoPlayOptions` cohabit with the resource type (and `VideoChannel.gain` vs the element's `volume` shows the resource/media blur persisting in the header layer); a types-package edit for when that file is next touched.
- **Sync `createVideoResource(element?)` wrapper — keep or drop.** _Parked — charter Open direction #2._ Whether a `{ element: element ?? null }` literal wrapper earns a function is a direction question.
- **Rust `flighthq-video` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: remove fire-and-forget URL loaders, DRY inferVideoType
