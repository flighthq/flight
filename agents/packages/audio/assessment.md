---
package: '@flighthq/audio'
updated: 2026-09-08
basedOn: ./review.md
---

# audio — Assessment

Refreshed 2026-09-08 from the 2026-09-02 review and live source. Review scored 68/100 with `audioBackend.ts` singleton, `index.ts` ordering, and failure-convention split as primary findings. The backend singleton is now resolved — `audioBackend.ts` has been removed from source entirely; `canPlayAudioType` takes an explicit `host` parameter. 5 source files (down from 6), 5 test files, 96 test cases. New dependency on `@flighthq/entity` for `allocateEntity`/`finishEntity` in `audioResourceReference.ts`. Score revised to 74/100.

## Directed

_None._

## Recommended

- **Alphabetize `index.ts` exports.** Lines 2–15 are out of alphabetical order (starts with `findAudioResourceReferenceByName`, `unregisterAudioDecoder`, `resolveAudioResourceReference`).
- **Unify two decode paths.** `loadAudioResourceFromBytes` goes straight to `context.decodeAudioData` (line 57), never consulting the registry; `resolveAudioResourceReference` checks `getAudioDecoder` first (line 184). One path bypasses the extensibility seam.

## Depth gaps

1. **Failure-convention split (reject vs sentinel).** `loadAudioResourceFromUrl` throws on non-ok HTTP; `loadAudioResourceFromUrls` returns empty resource. Family-wide convention fork shared with video and image — needs one ruling across the resource family.
2. **No streaming-source carrier.** No `MediaElementAudioSourceNode` representation — long tracks must fully decode.
3. **No audio-processing tier.** No waveform/trim/slice/normalize functions. The package's `bitmap`-equivalent identity.
4. **No WAV encode/decode.** Likely a `-formats` codec neighbor, not in-package work.

## Backlog

- Split playback types out of `AudioResource.ts` in `@flighthq/types` — cross-package.
- Rust `flighthq-audio` crate conformance — cross-tree.

## Landed

1. ~~**Complete loader matrix — `loadAudioResourceFromBytes`, `FromBlob`, `FromBase64`.**~~ Landed.
2. ~~**Lifecycle parity — `disposeAudioResource`, `cloneAudioResource`, `hasAudioResourceBuffer`, `isAudioResourceEmpty`.**~~ Landed.
3. ~~**Buffer inspection getters — duration, sampleRate, channelCount, byteSize.**~~ Landed.
4. ~~**Format family symmetry — `inferAudioMimeType`, `detectAudioMimeType`.**~~ Landed.
5. ~~**Export codec-negotiation — `selectAudioResourceUrl`, `canPlayAudioType`.**~~ Landed.
6. ~~**Sample-tier constructors — `createAudioResourceFromSamples`, `getAudioResourceChannelData`.**~~ Landed.
7. ~~**Fix stale package.json description.**~~ Landed.
8. ~~**Backend singleton removal.**~~ Landed 2026-09-08. `audioBackend.ts` removed from source; `canPlayAudioType` takes explicit `host` parameter.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: remove fire-and-forget URL loaders, move AudioContext out, DRY inferAudioType
