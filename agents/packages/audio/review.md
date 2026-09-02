---
package: '@flighthq/audio'
status: solid
score: 68
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# audio — Review

**Domain:** Audio resource lifecycle — decoded-buffer entities, loading/decoding from multiple source types, codec negotiation via a pluggable decoder registry, format identification (extension and magic-byte), buffer inspection, and a resource-reference resolution pipeline for embedded and external audio. Playback (channels, mixing, buses) belongs to `@flighthq/media`.

**Verdict:** solid — 68/100

Since the 2026-07-13 review (62/100), the package has grown from 20 exports across 3 source files to 41 exports across 6 source files (34 public, 7 contract-only). Three new modules landed: `audioBackend.ts` (the SDK-standard backend seam: get/set/install/explain/observe/reset, with custom-over-host priority and conflict detection), `audioDecoderRegistry.ts` (MIME-keyed decoder registry for formats the platform cannot decode natively, e.g. SWF ADPCM), and `audioResourceReference.ts` (the embedded/external resource-reference lifecycle: create, resolve, explain, reset-failed, find-by-name). The loader family also migrated from raw `fetch` to the explicit `HasNetHttp` host dependency model via `@flighthq/net`, adding `net` as a second runtime dependency alongside `types`. Test coverage grew from ~55 cases to 110 across 6 colocated test files. The bump is earned: the reference-resolution pipeline is the real integration seam for document-embedded audio (SWF sounds, timeline cues), and the backend/decoder registry pair makes codec support opt-in and tree-shakable. The score remains in the solid band because the same structural gaps from the prior review persist (streaming carrier, processing tier, WAV codec, failure-convention split).

## Present capabilities (verified 2026-09-02)

### audioResource.ts (10 exports)

- `createAudioResource(buffer?)` — wraps an `AudioBuffer` or creates an empty resource.
- `cloneAudioResource` — shares the buffer by reference, independent resource identity.
- `disposeAudioResource` — nulls the buffer reference (dispose, not destroy; AudioBuffer is GC-managed).
- `hasAudioResourceBuffer`, `isAudioResourceEmpty` — boolean guards.
- `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceByteSize` — thin accessors; byte size matches the SDK memory-budgeting convention (channels x length x 4).
- `getAudioResourceChannelData(resource, channel)` — returns `Float32Array` by reference or `null` sentinel for out-of-range/empty.

### audioResourceFrom.ts (7 exports)

- `createAudioResourceFromSamples(channels, sampleRate)` — builds an AudioBuffer from raw PCM channel data without an AudioContext (uses the AudioBuffer constructor). Returns empty resource for zero-length input.
- `loadAudioResourceFromBytes(context, bytes, mimeType?, signal?)` — core decode path via `context.decodeAudioData`. Copies the viewed region to avoid detaching the caller's Uint8Array. Post-decode abort barrier: checks `signal.throwIfAborted()` both before and after the await, because `decodeAudioData` cannot be cancelled.
- `loadAudioResourceFromBase64`, `loadAudioResourceFromBlob` — delegate to `loadAudioResourceFromBytes`.
- `loadAudioResourceFromUrl(host, context, url, signal?)` — routes through `sendNetRequest` from `@flighthq/net/contract` with the explicit `HasNetHttp` host dependency. Checks `response.ok` before paying for a decode. Throws on non-2xx.
- `loadAudioResourceFromUrls(host, context, sources, signal?)` — codec negotiation via `selectAudioResourceUrl`; returns empty resource when no source is playable (sentinel, not throw).
- `selectAudioResourceUrl(sources)` — picks the first playable URL using `canPlayAudioType`; explicit `type` on the source overrides extension inference.

### audioFormat.ts (5 exports)

- `canPlayAudioType(mimeType)` — delegates to the active `AudioBackend`; returns false for empty string without probing.
- `detectAudioMimeType(data)` — magic-byte sniffing for WAV, FLAC, Ogg, MP3 (ID3 and MPEG frame sync), M4A/AAC (ISO-BMFF ftyp), WebM (EBML). Accepts both ArrayBuffer and Uint8Array.
- `getAudioMimeTypeEssence(mimeType)` — strips parameters, lowercases. Decoders register against the essence.
- `getAudioMimeTypeParameter(mimeType, name)` — extracts one MIME parameter value; handles quoted values containing semicolons correctly. This is how a container-less format decoder reads sample rate and channel count.
- `inferAudioMimeType(url)` — extension-based (mp3, ogg, wav, aac, flac, webm, m4a). Query-parameter safe.

### audioDecoderRegistry.ts (5 exports)

- `registerAudioDecoder(mimeType, decoder)` / `unregisterAudioDecoder(mimeType)` — MIME-keyed registry for non-platform codecs; keys on essence so one registration serves all parameter combinations. Last-write-wins.
- `getAudioDecoder(mimeType)` / `hasAudioDecoder(mimeType)` — lookup by essence; null sentinel.
- `getAudioDecoderMimeTypes()` — insertion-ordered snapshot; returned array is disconnected from the registry.

### audioResourceReference.ts (7 exports)

- `createEmbeddedAudioResourceReference(bytes, mimeType?, name?)` — borrows the caller's bytes (no copy). Allocates an empty `AudioResource` that cues can hold before decoding.
- `createExternalAudioResourceReference(uri, basePath?, mimeType?, name?)` — names a URI to fetch.
- `resolveAudioResourceReference(ref, context, fetch, signal)` — the core lifecycle driver. Embedded refs go through a registered decoder (if one exists for the MIME type) then fall back to platform `decodeAudioData`; external refs go through the swappable `AudioResourceFetch` seam. Binds decoded samples into the reference's pre-existing resource (all cues holding it come alive at once). Abort reverts state to Unresolved; decode failure records an `AudioResourceFailure` and sets state to Failed.
- `resetFailedAudioResourceReference` — returns Failed refs to Unresolved for retry; no-ops on other states.
- `findAudioResourceReferenceByName(refs, name)` — linear scan by authoring-time name; null sentinel.
- `explainAudioResourceReferenceResolution(ref)` — detached plain-data explanation for diagnostics.
- `createAudioResourceFailure(cause)` — reduces Error/thrown value to serialization-safe `{kind, message, name}`.

### audioBackend.ts (7 exports, contract-only)

- `createWebAudioBackend()` — creates a backend using `new Audio().canPlayType`.
- `getAudioBackend()` / `setAudioBackend(backend | null)` — custom-over-host-over-sentinel priority chain.
- `installAudioHostBackend(backend)` — first-write-wins with conflict detection on double install.
- `explainAudioBackend()` — returns layer/conflict/viability/operation for diagnostics.
- `observeAudioHostResult(operation, succeeded)` — records runtime viability observation.
- `resetAudioBackendForTest()` — test-only cleanup.

### Package shape

- 6 source files, 6 colocated test files, 110 test cases.
- Dependencies: `@flighthq/types`, `@flighthq/net`.
- `sideEffects: false`. Two export lanes: `.` (34 public) and `./contract` (41 total, adds the 7 backend functions).
- The decoder registry is empty at import — populated only through explicit `registerAudioDecoder` calls.

## Gaps vs an authoritative audio-resource library

- **No streaming-source carrier.** `AudioResource` models only fully-decoded `AudioBuffer`s. A long music track is unrepresentable in the data layer. Every mature audio engine distinguishes decode-in-memory (SFX) from streamed sources (music). Whether this lives here or in `media` is a boundary question (charter Open direction #3).
- **No processing tier.** No peak/waveform extraction, no trim/slice/concat/normalize buffer operations. This is the audio analogue of `@flighthq/bitmap` — the strongest identity argument for this package beyond resource loading.
- **No WAV encode/decode.** A context-free PCM codec is the standard escape hatch for tests (jsdom has no `decodeAudioData`), capture pipelines, and the Rust port. Could live here or in a `-formats` neighbor.
- **Failure-convention split.** `loadAudioResourceFromUrl` rejects on failure; `loadAudioResourceFromUrls` returns an empty-resource sentinel. Two conventions one function apart, still undecided family-wide (shared with image/video). Status.md flags this explicitly.
- **Two decode paths, one registry.** `resolveAudioResourceReference` decodes embedded bytes through the registered decoder for the reference's MIME type, while the `loadAudioResourceFrom*` family goes straight to `context.decodeAudioData` and never consults `audioDecoderRegistry`. A decoder registered for a format the platform cannot decode therefore serves references but not loaders. Status.md flags this.

## Charter contradictions

**North star #3 tension.** The charter states: "No module-level mutable singletons. The `AudioContext` singleton (`let context`) is module-level mutable state in a `sideEffects: false` package." Decision #1 executed the removal of `getAudioContext()`. However, `audioBackend.ts` introduces four new module-level mutable variables (`_custom`, `_host`, `_hostConflict`, `_hostObservation`). This matches the SDK-wide backend seam pattern (the same pattern `video`, `image`, `net`, and other packages use), and the charter's north star was written specifically about the AudioContext singleton, not the backend seam. But the letter of north star #3 applies to any module-level mutable state. This is a tension the charter should acknowledge: the backend seam is sanctioned SDK infrastructure, not the ad-hoc singleton the north star banned. **Candidate charter update** rather than a code defect.

No other contradictions. Decisions #1-#4 are all verified executed.

## Contract & docs fit

**Contract fit is clean.** Types live in `@flighthq/types` (`AudioResource`, `AudioBackend`, `AudioDecoder`, `AudioResourceReference`, etc.). Unabbreviated function names throughout. `Readonly<>` on non-mutating parameters. Sentinel `null` returns (not throws) for expected failures. `sideEffects: false` with no top-level side effects. Two export lanes (`.` and `./contract`). Colocated tests per source file.

**`index.ts` is not alphabetized.** Lines 2-14 (the newer reference/decoder/format exports) are in reverse alphabetical order, while lines 15-35 are alphabetized. This violates the source style rule that exported names are alphabetized within a file. Status.md flags this.

**Charter "What it is" is stale.** Still reads "6 exports across 2 source files ... plus a shared AudioContext singleton." The package now has 41 exports across 6 source files, the singleton is long gone (Decision #1), and the identity has broadened significantly with the backend seam, decoder registry, and resource-reference pipeline. Candidate update for the next direction session.

**Dependency change since last review.** The prior review stated "deps `types` only." The package now also depends on `@flighthq/net` (for `sendNetRequest` in the URL loader). This is correct usage — the explicit host dependency model is the SDK convention — but the charter's "What it is" does not mention the `net` dependency. Minor candidate update.

**Types file colocation note (carried from prior review).** In `@flighthq/types`, `AudioResource.ts` also defines `AudioChannel`, `AudioChannelState`, and `AudioPlayOptions` — playback-layer types that belong to `media` cohabiting with the resource type. This is the types-layer echo of the old resources/media boundary blur. Worth splitting when the file is next touched.

## Candidate open directions

1. **Backend seam and north star #3 reconciliation.** The charter should acknowledge the SDK-wide backend seam pattern as sanctioned infrastructure distinct from ad-hoc singletons. This reconciles the letter of north star #3 with the actual SDK architecture.

2. **Streaming-carrier boundary** (charter Open direction #3). Still the biggest unmodeled capability. A `StreamingAudioSource` or `MediaElementAudioSource` carrier is needed for music-length tracks.

3. **Processing tier scope.** Whether peak/waveform extraction, trim/slice/concat/normalize operations are in-scope identity or edge into the charter's "effects processing" non-goal.

4. **WAV codec placement.** In-package escape hatch vs. codec neighbor (`audio-formats`?) under the plurality guard.

5. **Family-wide reject-vs-sentinel ruling.** One ruling across audio/image/video for single-source (throws) vs. multi-source (sentinel) loaders. The current split is consistent across the three resource families but undocumented as a deliberate choice.

6. **Decoder registry reachability from loaders.** The `loadAudioResourceFrom*` family bypasses the decoder registry, so a registered decoder is invisible to direct loaders. Decide whether this is by design (loaders are always platform-decode) or whether loaders should consult the registry when the MIME type is known.

7. **Types file split.** `AudioResource.ts` in `@flighthq/types` mixes resource types with playback types (`AudioChannel`, `AudioPlayOptions`). Separate when `media`'s types reach their own file.
