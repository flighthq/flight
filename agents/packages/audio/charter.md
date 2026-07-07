---
package: '@flighthq/audio'
crate: flighthq-audio
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# audio — Charter

## What it is

`@flighthq/audio` is the **AudioResource lifecycle manager** — create and load `AudioResource` entities wrapping `AudioBuffer`, plus a shared `AudioContext` singleton. 6 exports across 2 source files. Dependencies: `types` only. Extracted from the old `@flighthq/resources`. Consumed by `@flighthq/media` (audio channel playback).

## North star

1. **Resource lifecycle, not playback.** Audio owns creating and loading AudioResource. Playback control (channels, mixing, buses) belongs to `@flighthq/media`.
2. **Honest async APIs.** Decoding audio is async. Fire-and-forget patterns that silently swallow errors are dishonest.
3. **No module-level mutable singletons.** The `AudioContext` singleton (`let context`) is module-level mutable state in a `sideEffects: false` package. Context management should move to the caller or to `@flighthq/media`.

## Boundaries

**In scope:**

- AudioResource creation from `AudioBuffer`.
- Async loading from URL / multiple URLs with codec probing.
- Audio format/codec inference from file extensions.

**Non-goals:**

- Audio playback, channels, mixing, buses — `@flighthq/media`.
- AudioContext lifecycle management — caller or `@flighthq/media`.
- Spatial audio, effects processing — future expansion (needs breadth review).

## Decisions

- **[2026-07-02] Move AudioContext singleton out of this package.** `getAudioContext()` holds a module-level `let context: AudioContext | null` — mutable singleton state in a `sideEffects: false` package. The AudioContext should be managed by `@flighthq/media` or passed explicitly by the caller, not owned by the resource package. The load functions should accept an `AudioContext` parameter instead of calling `getAudioContext()` internally.

  **Why:** Module-level mutable state is a side-effect smell. The AudioContext is a runtime resource with significant lifecycle implications (browser autoplay policy, suspend/resume, hardware allocation). It belongs in the playback/application layer, not the resource layer.

- **[2026-07-02] Remove fire-and-forget `create*FromUrl` patterns.** `createAudioResourceFromUrl` and `createAudioResourceFromUrls` start fetching/decoding silently and swallow errors. APIs should be honest: decoding is async, so the API should be async. Sync `createAudioResource(buffer?)` stays (wrapping an already-decoded buffer is valid).

  **Why:** Same reasoning as video — fire-and-forget hides failure.

- **[2026-07-02] DRY the `inferAudioType` helper.** Share a pattern with font and video's format inference helpers.

  **Why:** Three packages have the same extension→MIME inference pattern.

- **[2026-07-02] Audio needs expansion — scope ceiling not here.** Audio context and audio features need significant expansion for AAA completeness. This package is a starting point, not a finished product. Needs a breadth review to determine what "complete" looks like.

  **Why:** The current 6 exports are bare-minimum resource loading. A mature audio resource layer would likely include format detection, metadata extraction, streaming decode, and potentially spatial audio primitives.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Breadth review for AAA completeness.** What does a complete audio resource package look like? Streaming decode? Audio metadata (duration, sample rate, channel count)? Format detection (magic bytes)? Audio codec seam (parallel to image-codec)?

2. **AudioContext parameter threading.** When `getAudioContext()` is removed, load functions need an `AudioContext` parameter. Decide whether this is a required parameter or an optional one with a fallback to a context provided by media/application.

3. **Relationship to media.** Audio creates resources; media manages channels, buses, mixing. Is this the right boundary, or should audio absorb some of media's audio-specific functionality?
