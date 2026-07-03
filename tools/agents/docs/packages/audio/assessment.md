---
package: '@flighthq/audio'
updated: 2026-07-03
basedOn: ./review.md
---

# audio — Assessment

Based on the 2026-07-03 review (stub, 18/100). All three previously approved sweep items have landed and are verified in source: the fire-and-forget `create*FromUrl` loaders are gone, `loadAudioResourceFromUrl(s)` take an explicit `AudioContext` parameter, and `inferAudioType` lives in a shared `audioFormat.ts`. The review's verdict is that what exists is well-made but is ~one-fifth of one sub-area of the domain; the items below build the layer out, mirroring the `@flighthq/image` sibling wherever a direct analogue exists.

## Recommended

Sweep-safe: within `@flighthq/audio`, no cross-package coupling, no open design decision.

1. **Complete the loader matrix — `loadAudioResourceFromBytes`, `FromBlob`, `FromBase64`.** The bytes loader is literally the middle of the existing URL loader left unexported (review calls it a textbook missing-primitive extraction); `FromBlob`/`FromBase64` follow trivially. Mirrors `@flighthq/image`'s loader family exactly. Bytes loading matters for bundled assets, IndexedDB caches, and filesystem reads.

2. **Lifecycle parity with image — `disposeAudioResource`, `cloneAudioResource`, `hasAudioResourceBuffer`, `isAudioResourceEmpty`.** Today a caller cannot even test emptiness through the API surface. Restores the SDK's dispose symmetry and the resource-family predicate set.

3. **Buffer inspection getters — `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceByteSize`.** Thin accessors over `AudioBuffer`; `get*ByteSize` is the SDK memory-budgeting convention and decoded PCM is the largest asset class by RAM.

4. **Format family symmetry — rename `inferAudioType` → `inferAudioMimeType`; add magic-byte `detectAudioMimeType`.** The current name is doubly off-convention (it returns a MIME type, and is asymmetric with image's `detectImageMimeType`). The magic-byte signatures are well-known (`ID3`/MPEG sync, `fLaC`, `OggS`, `RIFF….WAVE`, `ftyp` M4A, EBML) and are the reliable path when URLs have no extension. No consumers outside the package barrel.

5. **Export the codec-negotiation primitive — `selectAudioResourceUrl` / `canPlayAudioType`.** The `canPlayType` probe-and-pick inside `loadAudioResourceFromUrls` is the most valuable logic in the package but is unavailable standalone; exporting it also makes the `HTMLAudioElement` probe's DOM coupling visible and testable.

6. **Sample-tier constructors — `createAudioResourceFromSamples(channels, sampleRate)` and `getAudioResourceChannelData`.** Procedural audio / tone generation entry point plus the channel-data accessor; the entity layer should own its constructors.

7. **Fix the stale package.json description.** It still claims "the shared audio context"; `getAudioContext()` was removed per charter Decision #1 and exists nowhere in the repo.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Streaming-source carrier (buffer vs media-element source).** _Parked — design decision / cross-package; candidate Open direction for the charter._ The data layer cannot represent a long music track at all; whether the streaming carrier lives here or in `@flighthq/media` is exactly charter Open direction #3, and today the gap is invisible because neither package models it.
- **Audio-processing tier — peak/waveform extraction, trim/slice/concat/normalize.** _Parked — design decision; candidate Open direction for the charter._ The review frames this tier as the package's `surface`-equivalent identity and its most defensible reason to exist as its own subject — a scope/identity ruling, not a sweep item. Edges toward the charter's "effects processing" non-goal.
- **WAV encode/decode (PCM↔WAV codec).** _Parked — design decision / cross-package; candidate Open direction for the charter._ The standard escape hatch for tests, capture, and the Rust port (no `decodeAudioData` in jsdom), but it is a codec — likely a `-formats`/codec neighbor subject to the bedrock test and the plurality guard, i.e. a register candidate, not in-package work.
- **Unify the `*FromUrl` (reject) vs `*FromUrls` (empty-resource sentinel) failure convention.** _Parked — design decision._ A family-wide convention fork shared with video and image: the SDK sentinel rule favors the empty resource, but the charter's "honest async APIs" north star argues for surfaced failure. Needs one ruling across the resource family.
- **Split playback types out of `AudioResource.ts` in `@flighthq/types`.** _Parked — cross-package._ `AudioChannel`, `AudioChannelState`, and `AudioPlayOptions` (media-layer) cohabit with the resource type, violating the one-concept-per-file rule; a types-package edit for when that file is next touched.
- **Rust `flighthq-audio` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: remove fire-and-forget URL loaders, move AudioContext out, DRY inferAudioType
