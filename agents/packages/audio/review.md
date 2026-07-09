---
package: '@flighthq/audio'
status: solid
score: 60
updated: 2026-07-09
ingested:
  - source
  - tests
---

# audio — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/audio.md)._

**Domain:** Audio data primitives — the resource-carrier and acquisition layer for sound: decoded-buffer entities, loading/decoding from sources, codec negotiation, format identification, and buffer inspection. (Runtime playback — channels, mixing, bus routing — is `@flighthq/media`'s layer and is not counted here.)

**Verdict:** stub — completeness 18/100

The package exports exactly four functions: `createAudioResource(buffer?)`, `inferAudioType(url)`, `loadAudioResourceFromUrl(context, url, signal?)`, and `loadAudioResourceFromUrls(context, sources, signal?)`. What exists is competent — the URL loader is abortable, the multi-source loader does real `canPlayType` codec negotiation, and the extension→MIME table covers the seven web-relevant containers — but this is one thin slice of the loading sub-area and nothing else. Judged against what an expert expects from a dedicated audio-data library (the decode/inspect layers of howler.js, symphonia, `audiobuffer-utils`, wavesurfer's data layer), the resource-lifecycle, buffer-inspection, sample-access, and byte-level format surfaces are entirely absent. The extraction from `resources` also dropped `getAudioContext()` while the package.json description still claims "the shared audio context" — the description is stale against the actual export surface.

## Present capabilities

- `createAudioResource(buffer?: AudioBuffer): AudioResource` — constructs the carrier entity (`{ buffer: AudioBuffer | null }`, defined in `@flighthq/types`). Null-buffer default doubles as the sentinel "empty resource."
- `loadAudioResourceFromUrl(context, url, signal?)` — fetch → `arrayBuffer` → `decodeAudioData`, with `AbortSignal` plumbed into the fetch. Clean and explicit; requiring the caller to pass the `AudioContext` is good Flight style (no hidden shared state).
- `loadAudioResourceFromUrls(context, sources, signal?)` — first-playable selection over `AudioResourceUrl[]` via an `HTMLAudioElement.canPlayType` probe, falling back to `inferAudioType`; returns an empty resource as the sentinel when nothing is playable. This is the genuinely valuable primitive in the package.
- `inferAudioType(url)` — extension→MIME for mp3/ogg/wav/aac/flac/webm/m4a, query-string-safe, `null` sentinel for unknown.

Tests are colocated per file and the package is `sideEffects: false` with a thin barrel. Quality of what exists is fine; the problem is scope.

## Gaps vs an authoritative audio-data library

- **Loader matrix is one cell wide.** Sibling `@flighthq/image` loads from URL / bytes / Blob / Base64; audio has only URL(s). `loadAudioResourceFromBytes(context, ArrayBuffer)` is literally the middle of the existing URL loader left unexported — a textbook missing-primitive extraction — and `FromBlob` / `FromBase64` follow trivially. Bytes-loading matters for bundled assets, IndexedDB caches, and `@flighthq/filesystem` reads.
- **No resource lifecycle beyond `create`.** No `disposeAudioResource` (drop the buffer reference), no `cloneAudioResource`, no `hasAudioResourceBuffer` / `isAudioResourceEmpty` predicates. The image sibling has all of these; here a caller cannot even test emptiness through the API surface.
- **No buffer inspection.** No `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceByteSize` (memory budgeting — decoded PCM is the largest asset class by RAM in most games and the SDK convention is `get*ByteSize`).
- **No sample-level access or synthesis.** No `createAudioResourceFromSamples(Float32Array[], sampleRate)` (procedural audio, tone generation), no `getAudioResourceChannelData`, no peak/waveform extraction (`computeAudioResourcePeaks` — the standard visualization primitive in wavesurfer/waveform-data), no trim/slice/concat/normalize buffer ops. This whole tier — the audio analogue of what `@flighthq/surface` is to images — is missing.
- **No byte-level format identification.** `inferAudioType` is extension sniffing only. Image has magic-byte `detectImageMimeType`; audio's equivalents are easy and well-known (`ID3`/`0xFFEx` MPEG sync, `fLaC`, `OggS`, `RIFF….WAVE`, `ftyp` M4A, EBML WebM) and are the reliable path when URLs have no extension.
- **No streaming-source carrier.** `AudioResource` models only fully-decoded `AudioBuffer`s. Every mature engine (OpenFL/Lime, howler, Unity) distinguishes decode-in-memory (SFX) from streamed media-element sources (music). Whether the streaming carrier lives here or in `media` is a boundary decision, but today the data layer cannot represent a long music track at all.
- **Selection primitive not exported.** The `canPlayType` negotiation inside `loadAudioResourceFromUrls` (probe + pick) is not available standalone — no `selectAudioResourceUrl(sources)` / `canPlayAudioType(type)` — so a caller wanting negotiation without loading must reimplement it.
- **No WAV encode/decode.** A context-free PCM↔WAV codec is the standard escape hatch for tests, capture, and native ports (jsdom has no `decodeAudioData`; the Rust port needs a decode path that is not Web-Audio-bound). Could be a `-formats` neighbor, but nothing exists.

## Naming / API-shape notes

- `inferAudioType` is doubly off-convention: it does not name what it returns (a MIME type, not an "audio type") and it is asymmetric with image's `detectImageMimeType`. `inferAudioMimeType` (extension-based) alongside a future `detectAudioMimeType` (magic-byte) would restore the family symmetry.
- The `*FromUrl` rejects on failure while `*FromUrls` resolves to an empty-resource sentinel. Two failure conventions one line apart; the SDK's sentinel rule suggests both should resolve to the empty resource (or the divergence should be a documented decision).
- `loadAudioResourceFromUrls` silently allocates a throwaway `HTMLAudioElement` probe per call — fine, but it couples the function to DOM presence in a package whose decode path is otherwise Web-Audio-only; an exported probe primitive would make that coupling visible and testable.
- package.json description ("…and the shared audio context") is stale: `getAudioContext()` was dropped in the `resources` dissolution and exists nowhere in the repo. Either the description is wrong or a decided-upon context helper never landed — resolve one way or the other.
- Boundary note: in `@flighthq/types`, `AudioResource.ts` also defines `AudioChannel`, `AudioChannelState`, and `AudioPlayOptions` — playback-layer (media) types cohabiting with the resource type in a file named for the resource. Not this package's code, but it is the header-layer echo of the old resources/media blur and worth splitting when the types file is next touched.
- What does exist follows house style well: `create*` allocation verb, explicit `context` parameter (no hidden singleton), `AbortSignal` support, types owned by `@flighthq/types`, sentinel `null` returns.

## Recommendation

Treat this as the seed of the audio subject, not a finished data layer. Build out in this order:

1. **Complete the loader matrix** — export `loadAudioResourceFromBytes` (extract it from the URL loader), then `FromBlob` / `FromBase64`, mirroring `@flighthq/image` exactly.
2. **Lifecycle + inspection parity with image** — `disposeAudioResource`, `hasAudioResourceBuffer` / `isAudioResourceEmpty`, `getAudioResourceDuration` / `SampleRate` / `ChannelCount` / `ByteSize`.
3. **Byte-level `detectAudioMimeType`** and rename `inferAudioType` → `inferAudioMimeType` for family symmetry.
4. **Sample tier** — `createAudioResourceFromSamples`, channel-data access, and peak extraction; this is the package's `surface`-equivalent identity and the most defensible reason for it to exist as its own subject.
5. **Decide the streaming-carrier boundary** with `@flighthq/media` (buffer vs media-element source) and record it; today the gap is invisible because neither package models it.

The four functions present are well-made; the package is simply ~one-fifth of one sub-area of its domain.

## 2026-07-09 — deepened

AudioResource lifecycle to image parity — full loader matrix, sample-tier constructors, clone/dispose/predicates, buffer getters, MIME infer/detect, codec negotiation (commit fc5cd290). The assessment Recommended items landed and gated green; a full re-review to reconfirm this directional score is due.
