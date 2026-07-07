---
package: '@flighthq/video'
crate: flighthq-video
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# video — Charter

## What it is

`@flighthq/video` is the **VideoResource lifecycle manager** — create and load `VideoResource` entities wrapping `HTMLVideoElement`. 5 exports across 2 source files. Dependencies: `types` only. Extracted from the old `@flighthq/resources`. Consumed by `@flighthq/media` (playback) and `@flighthq/displayobject` (Video display object).

## North star

1. **Resource lifecycle, not playback.** Video owns creating and loading VideoResource. Playback control (play, pause, seek, volume) belongs to `@flighthq/media`.
2. **Honest async APIs.** Loading a video from a URL is async. The sync `create*FromUrl` fire-and-forget pattern (silently swallows errors, returns null-element resource) is dishonest — the async `load*` variants are the correct API for URL-based loading.
3. **`Uint8Array` for byte seams if applicable.** SDK-wide convention.

## Boundaries

**In scope:**

- VideoResource creation from `HTMLVideoElement`.
- Async loading from URL / multiple URLs with codec probing.
- Video format/codec inference from file extensions.

**Non-goals:**

- Video playback control — `@flighthq/media`.
- Video display object — `@flighthq/displayobject`.
- Video decoding/encoding — future codec package if needed.

## Decisions

- **[2026-07-02] Remove fire-and-forget `create*FromUrl` patterns.** `createVideoResourceFromUrl` and `createVideoResourceFromUrls` start loading silently and swallow errors. APIs should be honest: if loading is async, the API should be async. The sync `create*` should only exist for wrapping an already-available `HTMLVideoElement`. On native (Rust), sync loading from a file path may be valid — that's a different seam.

  **Why:** Fire-and-forget hides failure. A user calling `createVideoResourceFromUrl` gets back a resource with `element: null` on error with no way to know it failed. The async `loadVideoResourceFromUrl` is the honest path.

- **[2026-07-02] DRY the `inferVideoType` helper.** Share a pattern with font's `inferFontFormat` and audio's `inferAudioType` — either a shared utility or a consistent internal pattern across resource packages.

  **Why:** Three packages have the same extension→MIME inference pattern with duplicated structure.

- **[2026-07-02] Scope ceiling TBD — needs breadth review.** No depth or maturation review exists. Whether the package needs growth for AAA completeness is unknown.

  **Why:** Can't assess completeness without understanding the full video resource domain.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Breadth review for AAA completeness.** What does a complete video resource package look like? Thumbnail extraction? Metadata (duration, resolution, codec)? Adaptive streaming (HLS/DASH)?

2. **Sync `createVideoResource` — is the plain wrapper needed?** `createVideoResource(element?)` just returns `{ element: element ?? null }`. Is this enough value to justify a function, or should callers just create the object directly?

3. **Relationship to media.** Video and media have a producer/consumer relationship — video creates resources, media manages playback channels. Is this the right boundary?
