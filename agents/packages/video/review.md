---
package: '@flighthq/video'
status: solid
score: 75
updated: 2026-09-02
ingested:
  - source
  - tests
  - types
  - consumers
---

# video — Review

**Domain:** Video resource lifecycle -- the resource-carrier and acquisition layer for video: media-element-backed entities with ownership tracking, async loading from URLs and blobs with codec negotiation, MediaStream wrapping, format identification (extension and magic-byte), element inspection, and capability-backend management. Runtime playback (channels, gain, looping) belongs to `@flighthq/media`; on-screen presentation belongs to the `Video` display object in `@flighthq/scene2d`. Neither is counted here.

## Verdict

The package has matured from a four-function stub into a well-structured resource lifecycle manager with 25 exported functions across 3 source files, backed by 3 colocated test files with roughly 86 individual test cases. The loader is abort-safe, ownership-aware, and configurable via `VideoResourceLoadOptions`. Object-URL lifecycle transfers ownership correctly through the blob path. The capability-backend system is clean and mirrors the audio/image pattern. Within its declared scope (resource lifecycle, not playback), the package is largely complete.

The remaining gaps are principally cross-package design decisions (frame-capture seam, resource-family failure-convention fork, playback types cohabiting in `@flighthq/types`) rather than missing within-package implementation. The score reflects a package that does its job well but has not resolved these family-wide questions and lacks a diagnostics/guard layer.

## Present capabilities

### Resource creation and teardown (videoResource.ts -- 9 functions)

- `createVideoResource(element?, objectUrl?, ownsElement?)` -- factory returning `VideoResource` with three fields (`element`, `objectUrl`, `ownsElement`). No-arg produces the null-element sentinel. The `objectUrl` parameter transfers blob-URL ownership; `ownsElement` records whether the resource created the element or received it from the caller.
- `destroyVideoResource(resource)` -- ownership-aware teardown. For owned elements: nulls `srcObject` (without stopping caller-owned MediaStream tracks), detaches `src` via `removeAttribute`, calls `load()` to free the decoder. For borrowed elements: drops the reference only. Revokes a held `objectUrl` in either case. Idempotent (a second call is a no-op).
- `disposeVideoResource(resource)` -- legacy unconditional teardown that releases the decoder regardless of the `ownsElement` flag. Retained for loader error paths where the element is known-owned but an ownership flag was not set. Also revokes any held `objectUrl`.
- `getVideoResourceDuration(resource)` -- returns `element.duration` or `0` when no element is attached. May return `NaN` (pre-metadata) or `Infinity` (live stream), passed through from the element.
- `getVideoResourceHeight(resource)` / `getVideoResourceWidth(resource)` -- read `videoHeight`/`videoWidth` from the element, or `0` without one.
- `hasVideoResourceElement(resource)` -- true when `element !== null`.
- `isVideoResourceEmpty(resource)` -- true when no element or dimensions are zero.
- `isVideoResourceReady(resource)` -- true when `readyState >= HAVE_CURRENT_DATA` (at least one decodable frame available).

### Async loading (videoResourceFrom.ts -- 4 functions)

- `loadVideoResourceFromUrl(url, options?, signal?)` -- creates a video element via the capability backend, applies `VideoResourceLoadOptions` (crossOrigin, muted, playsInline, preload, readiness), assigns `src`, and resolves on the configured readiness event (`loadedmetadata`, `canplay`, or `canplaythrough`, defaulting to `canplay`). Rejects on error or abort. Both rejection paths route element release through `disposeVideoResource`. Pre-aborted signals fast-path to rejection without creating an element. Marks the returned resource with `ownsElement: true`.
- `loadVideoResourceFromUrls(sources, options?, signal?)` -- runs `selectVideoResourceUrl` for codec negotiation, then delegates to `loadVideoResourceFromUrl`. Returns the null-element sentinel (not a rejection) when no source is playable.
- `loadVideoResourceFromBlob(blob, options?, signal?)` -- wraps a `Blob` in an object URL, delegates to `loadVideoResourceFromUrl`, then transfers the URL to the resource via `resource.objectUrl`. On failure, revokes the URL since no resource is returned to own it. The URL is deliberately kept live after load settlement because the element continues fetching from it during playback and seek.
- `createVideoResourceFromMediaStream(stream)` -- wraps a `MediaStream` by assigning `element.srcObject` and returns an owned resource. Returns `null` when the backend cannot create a video element.

### Format identification and capability backend (videoFormat.ts -- 12 functions)

- `inferVideoMimeType(url)` -- extension-to-MIME mapping (mp4, m4v, webm, mkv, ogv, ogg, mov, 3gp, m3u8, mpd), query-string-safe. Returns `null` for unrecognized extensions.
- `detectVideoMimeType(data)` -- magic-byte sniffing for mp4 (ftyp box at bytes 4-7), WebM/Matroska (EBML header), and Ogg (OggS). Accepts both `ArrayBuffer` and `Uint8Array`. Returns `null` for unrecognized or insufficient data.
- `canPlayVideoType(mimeType)` -- probes the selected backend; rejects empty MIME types without invoking the backend; normalizes exceptions and non-boolean returns to `false`.
- `selectVideoResourceUrl(sources)` -- picks the first source whose MIME type (explicit `type` or inferred from URL) the backend can play. Pins the backend reference at the start of iteration to prevent reentrant changes. Returns `null` when nothing is playable.
- `installVideoCapabilityHostBackend(backend)` / `setVideoCapabilityBackend(backend)` -- host registration (first-write-wins, conflict flag on distinct second) and custom override (replaces on each call, `null` clears). Custom takes priority over host; host over the built-in sentinel that rejects everything.
- `getVideoCapabilityBackend()` -- returns `custom ?? host ?? sentinel`.
- `hasVideoCapabilityHostBackend()` -- true when a host backend has been installed.
- `hasVideoCapabilityOperation(operation)` / `explainVideoCapabilityOperation(operation)` / `explainVideoCapabilityBackend()` -- diagnostics returning structured `BackendExplanation` / `BackendOperationExplanation` data. Reports layer (custom/host/sentinel/none), viability (available/runtime-api-unavailable/unobserved), and conflict status.
- `observeVideoCapabilityHostResult(operation, succeeded)` -- records runtime viability of a host operation after real use.
- `resetVideoCapabilityBackendForTest()` -- clears all backend state for test isolation.

### Export lanes

- `index.ts` (public): 20 named re-exports from `contract.ts`. Omits the 5 backend-management functions (`getVideoCapabilityBackend`, `hasVideoCapabilityHostBackend`, `installVideoCapabilityHostBackend`, `observeVideoCapabilityHostResult`, `setVideoCapabilityBackend`) plus `resetVideoCapabilityBackendForTest`.
- `contract.ts`: barrel re-export of all 3 source files (25 functions total).
- The two lanes are correctly aligned -- the public lane is a strict subset of the contract lane, and the contract-only functions are all internal-SDK backend plumbing appropriately kept off the public surface.

### Types (all in @flighthq/types)

- `VideoResource` -- `element: HostImageSource | null`, `objectUrl: string | null`, `ownsElement: boolean`. The `objectUrl` field was added for blob-URL lifecycle ownership; the `ownsElement` field distinguishes caller-provided from loader-created elements for `destroyVideoResource`.
- `VideoResourceLoadOptions` -- `crossOrigin?`, `muted?`, `playsInline?`, `preload?`, `readiness?`.
- `VideoResourceUrl` -- `url`, `type?`.
- `VideoCapabilityBackend` -- `canPlayType(mimeType): boolean`, `createVideoElement?(): HostImageSource | null`.
- `VideoCapabilityOperation` -- `keyof VideoCapabilityBackend`.

### Tests

86 individual test cases across 3 colocated test files. Coverage highlights:

- `destroyVideoResource`: 7 tests covering owned vs borrowed elements, MediaStream srcObject handling (nulls without stopping tracks), object-URL revocation ordering (detach before revoke), idempotency, and reference clearing.
- `disposeVideoResource`: 6 tests covering the unconditional decoder release, double-dispose safety, revocation ordering, and no-revoke when no object URL is held.
- `loadVideoResourceFromUrl`: 10 tests covering default behavior, all three readiness modes, option application, error rejection, pre-aborted and mid-load abort, and decoder release on both rejection paths.
- `loadVideoResourceFromBlob`: 4 tests covering object-URL ownership transfer (URL stays live after settlement), metadata-readiness URL preservation, and revocation on failure/abort since no resource is returned.
- `selectVideoResourceUrl`: 7 tests including edge cases for empty type strings, unknown extensions, reentrant backend changes, backend exceptions, and caller property-access exceptions.
- `detectVideoMimeType`: 6 tests covering all three container signatures, both input types, short buffers, and unrecognized headers.

Tests use constructors (`createVideoResource`) rather than literals for SDK entities per convention. `afterEach` blocks restore mocks and reset backend state.

### Consumers

- `@flighthq/sdk` re-exports the public lane via `resources.ts`.
- `@flighthq/host-web` uses the contract lane (`installVideoCapabilityHostBackend`, `hasVideoCapabilityHostBackend`, `observeVideoCapabilityHostResult`) in `webVideoCapability.ts` to wire up the browser's `HTMLVideoElement.canPlayType` and element creation.

### Conventions adherence

- Full type names in all exported function names (`getVideoResourceWidth`, not `getWidth`).
- `Readonly<T>` on input parameters throughout (`Readonly<VideoResource>`, `Readonly<VideoResourceLoadOptions>`, `Readonly<VideoResourceUrl[]>`).
- `sideEffects: false` in `package.json`; no top-level registrations or mutations. Backend installation is opt-in via explicit function calls.
- Module-level state (`_custom`, `_host`, `_hostConflict`, `_hostObservation`, `HAVE_CURRENT_DATA`) placed at the bottom of files, after exported functions.
- `dispose*` vs `destroy*` verb distinction is correct: `disposeVideoResource` is unconditional legacy teardown, while `destroyVideoResource` respects the ownership model. Both release the decoder (a non-GC browser resource), so `destroy*` is the correct primary verb per the teardown convention; `dispose*` is retained for specific internal use.
- Sentinel returns: `createVideoResource()` produces the null-element sentinel; `loadVideoResourceFromUrls` resolves to this sentinel when no source is playable.
- No `@flighthq/sdk` imports from within the package. Single dependency on `@flighthq/types`.

## Gaps

### Within-package

1. **No `loadVideoResourceFromBytes` / `loadVideoResourceFromArrayBuffer`.** A `Uint8Array`/`ArrayBuffer` path wrapping through a `Blob` and then `loadVideoResourceFromBlob` would complete the input-source coverage. The blob path exists, so the implementation would be trivial, but the convenience function is absent -- callers must manually wrap `new Blob([data], { type })` themselves.

2. **No diagnostics/guard layer.** There is no `enableVideoResourceGuards` module. Silent sentinels (null element, empty resource) have no `explain*` query; the backend diagnostics (`explainVideoCapabilityBackend`, `explainVideoCapabilityOperation`) exist but there is no user-facing guard that warns through `@flighthq/log` when, for example, `loadVideoResourceFromUrl` is called without a backend installed, or when `destroyVideoResource` is called on an already-destroyed resource. Per the diagnostics convention, the silent sentinels should have matching shakeable `explain*` queries and the guard layer should be separately importable.

3. **`disposeVideoResource` naming tension.** The function is labeled "Legacy unconditional teardown" in its comment, but it is still publicly exported and used in production paths (`loadVideoResourceFromUrl` error/abort handlers route through it). Its unconditional decoder release regardless of `ownsElement` blurs the `dispose*`/`destroy*` distinction the codebase conventions draw. If it is internal plumbing for known-owned elements, it could be contract-only rather than public. If it is the user-facing "I don't care about ownership" path, the "Legacy" comment is misleading.

### Cross-package (design decisions, not sweep-safe)

4. **Frame-capture seam (video to bitmap/image).** Grabbing a video frame into pixel data (`drawImage` / `ImageBitmap` from the element) is the standard bridge to `@flighthq/bitmap` / `@flighthq/image`. No seam exists on either side. The charter and assessment both name this as a design question.

5. **`*FromUrl` (reject) vs `*FromUrls` (empty-resource sentinel) failure convention fork.** `loadVideoResourceFromUrl` rejects its promise on failure; `loadVideoResourceFromUrls` resolves to a null-element sentinel when no source is playable. The same asymmetry exists in `@flighthq/audio` and `@flighthq/image`. A family-wide ruling is needed.

6. **Playback types cohabiting in `VideoResource.ts` in `@flighthq/types`.** `VideoChannel`, `VideoChannelState`, and `VideoPlayOptions` share the same file as `VideoResource` and `VideoResourceLoadOptions`. These belong to `@flighthq/media`'s layer, not the resource layer. The assessment notes this as a backlog item for when the types file is next touched.

## Charter contradictions

No active contradictions. The charter's three north-star principles hold:

1. **Resource lifecycle, not playback** -- the package owns creation, loading, inspection, and teardown. No playback control code is present. The `destroyVideoResource` ownership model and the blob-URL lifecycle are both within scope.
2. **Honest async APIs** -- the fire-and-forget `create*FromUrl` patterns named in charter Decision [2026-07-02] have been removed. The async `loadVideoResourceFromUrl` is the URL path, and `createVideoResource` is the sync wrapper for an already-available element.
3. **`Uint8Array` for byte seams** -- `detectVideoMimeType` accepts both `ArrayBuffer` and `Uint8Array`, consistent with the convention.

Charter Decision [2026-07-02] to DRY `inferVideoType` into a shared pattern: `inferVideoMimeType` lives in `videoFormat.ts` with the same structure as `audio` and `image`. Whether this becomes a shared utility remains an open direction.

## Contract and docs fit

- `package.json` declares `sideEffects: false`, two export lanes, and a single dependency on `@flighthq/types`. Correct.
- The `status.md` (updated 2026-08-08) accurately describes the current state: object-URL ownership is settled, abandonment paths release via `disposeVideoResource`, and the open work is parked and cross-cutting.
- The `assessment.md` correctly records all six original Recommended items as Landed. Its Backlog items (frame-capture seam, failure convention fork, types cohabitation, `createVideoResource` wrapper question, Rust crate) are all still open and accurately described.
- The existing review (scored 60, dated 2026-07-09) is stale: it was written at the time the lifecycle additions landed but before the ownership model (`ownsElement`, `destroyVideoResource`) was added and before the object-URL revocation timing was resolved. This review supersedes it.

## Candidate open directions

1. **Diagnostics/guard layer.** An `enableVideoResourceGuards` module emitting through `@flighthq/log` for: backend-absent loads, double destruction, and explanation queries for silent sentinels. This is within-package and convention-driven.

2. **`loadVideoResourceFromBytes` convenience.** Wraps `Uint8Array`/`ArrayBuffer` through `Blob` and `loadVideoResourceFromBlob`, completing the input-source family alongside the convention of `Uint8Array` byte seams.

3. **Resolve the `disposeVideoResource` public/contract-only question.** Either promote it to a deliberate "unconditional teardown" public API and document it as such, or demote it to contract-only where `loadVideoResourceFromUrl` can still use it internally.

4. **Family-wide failure convention ruling.** `*FromUrl` rejects; `*FromUrls` returns a sentinel. This spans video, audio, and image -- a single ruling covers all three.

5. **Frame-capture seam.** The bridge from a video element to `@flighthq/bitmap` / `@flighthq/image` pixel data. Cross-package and needs a design decision about which side owns the API.
