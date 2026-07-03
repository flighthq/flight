---
package: '@flighthq/video'
status: stub
score: 15
updated: 2026-07-03
ingested:
  - source
  - tests
---

# video — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/video.md)._

**Domain:** Video data primitives — the resource-carrier and acquisition layer for video: media-element-backed entities, loading from sources with codec negotiation, format identification, and resource inspection. (Runtime playback — channels, gain, looping — is `@flighthq/media`'s layer; on-screen presentation is the `Video` display object; neither is counted here.)

**Verdict:** stub — completeness 15/100

The package exports exactly four functions: `createVideoResource(element?)`, `inferVideoType(url)`, `loadVideoResourceFromUrl(url, signal?)`, and `loadVideoResourceFromUrls(sources, signal?)`. The URL loader is carefully written — abort-safe before and during load, listener cleanup on every exit path — and the multi-source loader does real `canPlayType` negotiation. But that is the entire package. Judged against the source-handling layer of a dedicated video library (video.js's source/tech selection, hls.js's capability probing, the WebCodecs/mp4box.js data tier) there is no lifecycle, no inspection, no configuration of the element it creates, no non-URL sources, and no byte-level format work. The carrier type itself (`{ element: HTMLVideoElement | null }`) is the thinnest in the resource family.

## Present capabilities

- `createVideoResource(element?: HTMLVideoElement): VideoResource` — constructs the carrier (`@flighthq/types`); null-element default doubles as the empty-resource sentinel.
- `loadVideoResourceFromUrl(url, signal?)` — creates a `preload='auto'` element, resolves on `canplay`, rejects on `error`, and handles `AbortSignal` correctly (pre-aborted fast-path, mid-load abort clears `src` to stop the network fetch, all listeners removed on every path). The best-crafted code in the package.
- `loadVideoResourceFromUrls(sources, signal?)` — first-playable selection over `VideoResourceUrl[]` via `canPlayType`, falling back to `inferVideoType`; empty-resource sentinel when nothing is playable.
- `inferVideoType(url)` — extension→MIME for mp4/m4v/webm/ogv/ogg/mov, query-string-safe, `null` sentinel.

Tests are colocated, cover the abort paths (unusually good for a stub), and the package is `sideEffects: false`.

## Gaps vs an authoritative video-data library

- **The loader cannot be configured, which breaks the SDK's own primary use case.** A video rendered as a WebGL/WebGPU texture must be loaded with `crossOrigin='anonymous'` or the texture upload taints; games almost always need `muted` + `playsInline` for mobile autoplay. `loadVideoResourceFromUrl` exposes none of these — no `crossOrigin`, `muted`, `playsInline`, `loop`, `poster`, or `preload` control. This is the single most consequential gap: the loader as shipped produces elements that cannot legally feed the SDK's GPU renderers cross-origin.
- **No readiness policy.** Resolution is hard-wired to `canplay`. Real pipelines need `loadedmetadata` (dimensions only — cheap, enough to size a display object) and `canplaythrough` (gapless start) as options; there is no `loadVideoResourceMetadataFromUrl` or readiness parameter.
- **No non-URL sources.** No `loadVideoResourceFromBlob` / `FromBytes` (object-URL wrapping — needed for filesystem/IndexedDB-sourced video, and the object URL must be owned and revoked by the resource, which is exactly why the primitive belongs here), and no `createVideoResourceFromMediaStream` — the seam `@flighthq/webcam` output would flow through to become an on-stage video.
- **No lifecycle.** No `disposeVideoResource` — and video is the asset type where teardown matters most: the canonical release sequence (`removeAttribute('src')`, `load()`) frees the platform decoder; a dropped reference alone can keep decoders alive on some browsers. Also no `hasVideoResourceElement` / `isVideoResourceEmpty` predicates and no clone (arguably N/A for an element carrier — a documented decision would do).
- **No inspection.** No `getVideoResourceWidth` / `Height` (`videoWidth`/`videoHeight` — needed by every consumer that sizes a `Video` display object or allocates a texture), `getVideoResourceDuration`, or `isVideoResourceReady` (readyState). Consumers currently must reach through `.element`, making the carrier type pure ceremony.
- **No byte-level format identification.** Only extension inference; no magic-byte `detectVideoMimeType` (`ftyp` boxes, EBML/Matroska, `OggS`). The MIME table is also missing the streaming-era entries a source-selection library carries: `m3u8` (`application/vnd.apple.mpegurl`), `mpd` (`application/dash+xml`), `mkv`, `3gp`.
- **Selection primitive not exported.** As in audio, the negotiation inside `loadVideoResourceFromUrls` is unavailable standalone (`selectVideoResourceUrl` / `canPlayVideoType`), so capability probing without loading requires reimplementation.
- **No frame-capture seam.** Grabbing a frame into pixels (`drawImage`/`ImageBitmap` from the element) is the standard bridge to `@flighthq/surface`/`@flighthq/image`. Cross-package, so a design decision rather than a within-package miss — but no seam exists on either side.

## Naming / API-shape notes

- `inferVideoType` shares audio's double naming miss: it returns a MIME type (not a "video type") and is asymmetric with image's magic-byte `detectImageMimeType`. `inferVideoMimeType` + future `detectVideoMimeType` restores the triad.
- Same split-failure convention as audio: `*FromUrl` rejects with an `Error` while `*FromUrls` resolves to an empty-resource sentinel. Pick one (the SDK's sentinel rule favors the empty resource) or document the asymmetry.
- `loadVideoResourceFromUrl` hard-codes element policy (`preload='auto'`, resolve-on-`canplay`) inside the function — the within-unit missing-primitive smell. An options parameter (or a `VideoResourceLoadOptions` type in `@flighthq/types`) keeps the free-function shape while exposing the policy.
- Boundary note: in `@flighthq/types`, `VideoResource.ts` also defines `VideoChannel`, `VideoChannelState`, and `VideoPlayOptions` — playback (media-layer) types cohabiting with the resource type. A `VideoChannel` also carries `gain`, which an `HTMLVideoElement` expresses as `volume`; that is media's concern, but it shows the header file still mixes the two layers the `resources` dissolution was meant to separate.
- What exists follows house style: full type words (`loadVideoResourceFromUrls`), `create*` verb, sentinel returns, types in `@flighthq/types`, no top-level side effects, no hidden singletons.

## Recommendation

Treat this as the seed of the video subject. Priorities, in order of leverage:

1. **Loader options** — `crossOrigin`, `muted`, `playsInline`, `preload`, and a readiness mode (`metadata` | `canplay` | `canplaythrough`). Without `crossOrigin` the package cannot serve the SDK's own GPU-texture path; this is a one-file change with outsized value.
2. **Lifecycle + inspection** — `disposeVideoResource` (with the decoder-releasing `removeAttribute('src')` + `load()` sequence), `hasVideoResourceElement` / `isVideoResourceEmpty` / `isVideoResourceReady`, and `getVideoResourceWidth` / `Height` / `Duration`, so consumers stop reaching through `.element`.
3. **Non-URL sources** — `loadVideoResourceFromBlob` (owning and revoking the object URL) and `createVideoResourceFromMediaStream` (the webcam seam).
4. **Format family symmetry** — rename to `inferVideoMimeType`, add magic-byte `detectVideoMimeType`, and extend the MIME table with the streaming entries (`m3u8`, `mpd`, `mkv`).
5. **Export the negotiation primitive** (`selectVideoResourceUrl`) and raise the frame-capture seam (video → `ImageResource`/`Surface`) to the user as a cross-package design question.

The abort handling shows the right instincts; the package now needs the other four-fifths of its layer.
