---
package: '@flighthq/audio'
status: solid
score: 62
updated: 2026-07-13
ingested:
  - source
  - tests
---

# audio — Review

_LIGHT re-verification 2026-07-13 of the 2026-07-03 depth review plus the 2026-07-09 deepening (commit 52004502: AudioResource lifecycle to image parity). All 20 current exports re-checked against source; verdict re-judged._

**Domain:** Audio data primitives — the resource-carrier and acquisition layer for sound: decoded-buffer entities, loading/decoding from sources, codec negotiation, format identification, and buffer inspection. (Runtime playback — channels, mixing, bus routing — is `@flighthq/media`'s layer and is not counted here.)

**Verdict:** solid — 62/100

The 2026-07-09 deepening executed the previous review's build-out plan essentially in full, taking the package from a four-function stub (18/100) to image-family parity: the loader matrix now covers URL/URLs/bytes/Blob/Base64, the lifecycle set (`clone`/`dispose`/`hasBuffer`/`isEmpty`) and the inspection getters (duration/sampleRate/channelCount/byteSize) exist, the sample tier has its constructor and channel-data accessor, format identification has both the extension-based `inferAudioMimeType` and the magic-byte `detectAudioMimeType`, and the codec-negotiation primitives (`canPlayAudioType`, `selectAudioResourceUrl`) are exported standalone. The stale package.json description was rewritten. What keeps it in the low-solid band is the tiers the deepening deliberately did not touch: no streaming-source carrier (a long music track is still unrepresentable in the data layer), no processing tier (peaks/waveform extraction, trim/slice/concat/normalize — the package's `surface`-equivalent identity), no context-free WAV codec for tests/Rust, and the unresolved `*FromUrl`-rejects vs `*FromUrls`-sentinel failure-convention split.

## Present capabilities (verified 2026-07-13)

- **Lifecycle:** `createAudioResource(buffer?)`, `cloneAudioResource`, `disposeAudioResource`, `hasAudioResourceBuffer`, `isAudioResourceEmpty` — the full image-family lifecycle set over `AudioResource { buffer: AudioBuffer | null }`.
- **Inspection:** `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceByteSize` — thin accessors over `AudioBuffer`, byte-size following the SDK memory-budgeting convention.
- **Sample tier:** `createAudioResourceFromSamples(context, channels, sampleRate)` and `getAudioResourceChannelData` — procedural-audio entry point and channel access.
- **Loading:** `loadAudioResourceFromUrl` (fetch → `decodeAudioData`, abortable), `FromUrls` (codec negotiation, empty-resource sentinel), `FromBytes`, `FromBlob`, `FromBase64` — explicit `AudioContext` parameter throughout (no hidden singleton, per charter Decision #1).
- **Negotiation:** `canPlayAudioType(type)` and `selectAudioResourceUrl(sources)` exported standalone — the `HTMLAudioElement.canPlayType` probe coupling is now visible and testable.
- **Identification:** `inferAudioMimeType(url)` (extension→MIME, seven containers, query-safe, `null` sentinel) and `detectAudioMimeType(bytes)` (magic bytes: ID3/MPEG sync, fLaC, OggS, RIFF/WAVE, ftyp M4A, EBML).

Tests are colocated per file; the package is `sideEffects: false` with a thin barrel, deps `types` only.

## Gaps vs an authoritative audio-data library

- **No streaming-source carrier.** `AudioResource` models only fully-decoded `AudioBuffer`s. Every mature engine (howler, Unity) distinguishes decode-in-memory (SFX) from streamed media-element sources (music). Whether the streaming carrier lives here or in `media` is a boundary decision (charter Open direction #3), but today the data layer cannot represent a long music track at all.
- **No processing tier.** No peak/waveform extraction (`computeAudioResourcePeaks` — the standard visualization primitive in wavesurfer/waveform-data), no trim/slice/concat/normalize buffer ops. This tier — the audio analogue of what `@flighthq/surface` is to images — is the most defensible reason for the package to exist as its own subject and remains absent.
- **No WAV encode/decode.** A context-free PCM↔WAV codec is the standard escape hatch for tests, capture, and native ports (jsdom has no `decodeAudioData`; the Rust port needs a decode path that is not Web-Audio-bound). Could be a `-formats`/codec neighbor, but nothing exists.
- **Failure-convention split.** `*FromUrl` rejects on failure while `*FromUrls` resolves to an empty-resource sentinel — two conventions one line apart, still undecided family-wide.

## Naming / API-shape notes

- The 2026-07-09 rename resolved the `inferAudioType` asymmetry: `inferAudioMimeType`/`detectAudioMimeType` now mirror image's family exactly.
- Boundary note: in `@flighthq/types`, `AudioResource.ts` also defines `AudioChannel`, `AudioChannelState`, and `AudioPlayOptions` — playback-layer (media) types cohabiting with the resource type in a file named for the resource. Not this package's code, but it is the header-layer echo of the old resources/media blur and worth splitting when the types file is next touched.
- House style is well kept: `create*` allocation verb, explicit `context` parameter, `AbortSignal` support, types owned by `@flighthq/types`, sentinel `null` returns, `Readonly<>` on non-mutating parameters.

## Charter contradictions

None. Decisions #1–#3 (context singleton removed, fire-and-forget loaders removed, format helper DRY'd) are all verified executed; Decision #4 ("audio needs expansion — scope ceiling not here") is exactly what the deepening did.

## Contract & docs fit

Contract fit is clean (single root export, `sideEffects: false`, colocated tests, unabbreviated names). Doc staleness: the charter's "What it is" still says "6 exports across 2 source files … plus a shared `AudioContext` singleton" — it is now 20 exports across 3 files with the singleton long gone (its own Decision #1); candidate touch-up next direction session. The codebase-map Package Map line for audio is still the bare `@flighthq/audio` with no descriptor — candidate revision now that the package has real shape.

## Candidate open directions

- Streaming-carrier boundary with `@flighthq/media` (charter Open direction #3) — still the biggest unmodeled capability.
- Whether the processing tier (peaks, trim/slice/concat/normalize) is in-scope identity or edges into the charter's "effects processing" non-goal.
- WAV codec placement (in-package escape hatch vs codec neighbor under the plurality guard).
- One family-wide ruling on reject-vs-sentinel for single- vs multi-source loaders (shared with image/video).
