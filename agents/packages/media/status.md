---
package: '@flighthq/media'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# media — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the `## Recommended` section of `assessment.md`. It contained exactly one sweep-safe item, which had to be **parked** because the assessment is stale relative to the live `src/`.

**Parked:**

- **Document the `getAudioChannelInputNode` transient-node lifetime contract.** The target function does not exist in `packages/media/src/`. The current `src/audioChannel.ts` is the older/simpler implementation (`playAudioResource`, WeakMap `channelRuntime`, no `get*InputNode`/`get*OutputNode`, no mixer). The richer surface the assessment describes (`getAudioChannelInputNode`, `getAudioChannelOutputNode`, `audioMixer`, `busToMixerRuntimes`) is present only as build artifacts under `packages/media/dist/` — output from the prior `builder-67dc46d64` session whose `src/` changes are absent in this worktree. Executing the item would require either adding the unblessed `getAudioChannelInputNode` function or relocating the ownership comment onto a different function (e.g. the `gainNode` in `setAudioChannelGain`) — both are API/contract guesses outside the sweep mandate. Parked for the assessment to be re-run against the live `src/`.

**Note for next reviewer:** `assessment.md` (and the `dist/` artifacts) describe a media surface that is not in this tree's `src/`. The assessment should be regenerated from the current `src/` before another sweep.

**Tests:** `npm run test --workspace=packages/media` — 2 files, 18 tests, all passing (unchanged; no source edits made).

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/media

**Session date:** 2026-06-24 **Previous score:** 67/100 (Silver partial) **Estimated new score:** 82/100 (Silver+)

## Implemented APIs (Cumulative — Passes 1 and 2)

### Bronze (complete)

**New `@flighthq/types` fields — `AudioResource.ts`:**

- `AudioChannel.muted: boolean`
- `AudioChannel.pan: number`
- `AudioChannel.loopStart: number`
- `AudioChannel.loopEnd: number`
- `AudioPlayOptions.muted?: boolean`
- `AudioPlayOptions.pan?: number`
- `AudioPlayOptions.loopStart?: number`
- `AudioPlayOptions.loopEnd?: number`

**New `@flighthq/types` fields — `VideoResource.ts`:**

- `VideoChannel.muted: boolean`
- `VideoPlayOptions.muted?: boolean`

**New `@flighthq/types` files:**

- `packages/types/src/AudioBus.ts` — `AudioBus`, `AudioBusOptions`, `AudioMixer`, `AudioMixerOptions`
- `packages/types/src/MediaChannelSignals.ts` — `MediaReadyState`, `MediaChannelSignals`

**Audio channel (`audioChannel.ts`):**

- `connectAudioChannelToNode(channel, destinationNode)` — disconnects the channel's output `GainNode` and reconnects to a new destination; called by `routeAudioChannelToMixerBus` / `unrouteAudioChannelFromMixerBus` to wire bus routing
- `disposeAudioChannel(channel)` — disconnects `onComplete` signal, clears media signals (`onBuffering`/`onError`/`onReady`/`onSeeked`), drops the WeakMap runtime entry
- `enableAudioChannelSignals(channel)` — opt-in `MediaChannelSignals` group; idempotent; signals are disconnected on `disposeAudioChannel`
- `fadeAudioChannelGain(channel, targetGain, durationMs)` — ramps gain via `linearRampToValueAtTime`
- `getAudioChannelCurrentTime(channel)` — live playhead in ms
- `getAudioChannelDuration(channel)` — convenience returning `channel.length`
- `getAudioChannelInputNode(channel)` — exposes the underlying source node for insert effects
- `getAudioChannelOutputNode(channel)` — exposes the gain node for insert effects
- `getAudioChannelPan(channel)`
- `getAudioChannelSignals(channel)` — returns the enabled `MediaChannelSignals` or `null`
- `isAudioChannelMuted(channel)` — boolean helper
- `isAudioChannelPlaying(channel)` — boolean helper
- `pauseAudioChannel(channel)` — preserves playback position
- `playAudioResource(source, options?)` — creates a channel with `StereoPannerNode` inserted in graph when available; initializes pan/muted/loopStart/loopEnd from options
- `resumeAudioChannel(channel)` — restarts from stored position
- `setAudioChannelCurrentTime(channel, value)` — seek, clamped
- `setAudioChannelGain(channel, value)` — live gain update
- `setAudioChannelLoopEnd(channel, value)` — clamped to `[0, length]`
- `setAudioChannelLoopStart(channel, value)` — clamped to `[0, length]`
- `setAudioChannelMuted(channel, muted)` — preserves stored `gain`
- `setAudioChannelPan(channel, value)` — clamped to `[-1, 1]`, wired to `StereoPannerNode`
- `setAudioChannelPlaybackRate(channel, value)`
- `stopAudioChannel(channel)` — resets to position 0

**Audio graph internals:**

- `AudioChannelRuntime` carries a `destinationNode: AudioNode` field (defaults to `context.destination`); `startAudioChannel` connects the gain node to it — enabling bus routing without re-creating the source node
- `StereoPannerNode` inserted between source and gain when `context.createStereoPanner` is available; degrades gracefully to no-op panning when absent

**Audio mixer (`audioMixer.ts`):**

- `addAudioBusToMixer(mixer, bus)` — registers the bus in the Web Audio graph: creates a `GainNode` (gain/muted-aware) and optional `StereoPannerNode` (pan-aware) between the bus gain node and the mixer's master `GainNode`; idempotent; registers the bus in the reverse lookup map so `setAudioBusGain`/`setAudioBusMuted`/`setAudioBusPan` can update the audio graph without requiring the mixer as a parameter
- `createAudioBus(options?)` — plain data bus with gain/pan/muted/name
- `createAudioMixer(options?)` — creates a mixer with a real `GainNode` master output connected to `context.destination`; runtime held in `WeakMap<AudioMixer, AudioMixerRuntime>`
- `fadeAudioBusGain(mixer, bus, targetGain, durationMs)` — ramps the bus `GainNode` via `linearRampToValueAtTime`; falls back to data-only update if bus not yet in Web Audio graph
- `getAudioMixerActiveChannels(mixer)` — returns channels registered via `routeAudioChannelToMixerBus`
- `pauseAllAudioMixerChannels(mixer)` — marks playing channels as paused (state update only; does not stop the Web Audio source node)
- `resumeAllAudioMixerChannels(mixer)` — marks paused channels as playing
- `routeAudioChannelToMixerBus(mixer, channel, bus)` — registers the channel with the mixer, calls `addAudioBusToMixer` to ensure the bus is in the audio graph, then calls `connectAudioChannelToNode` to reroute the channel's output to the bus `GainNode`
- `setAudioBusGain(bus, value)` — updates `bus.gain` and applies to the bus `GainNode` in every mixer that contains the bus
- `setAudioBusMuted(bus, muted)` — same pattern as `setAudioBusGain`
- `setAudioBusPan(bus, value)` — clamped to `[-1, 1]`; applies to the bus `StereoPannerNode` (if present)
- `setAudioMixerMasterGain(mixer, value)` — updates master `GainNode`
- `setAudioMixerMasterMuted(mixer, muted)` — zeroes master `GainNode` without touching `masterGain`
- `stopAllAudioMixerChannels(mixer)` — stops all channels and clears the active set
- `unrouteAudioChannelFromMixerBus(mixer, channel)` — removes from active set and reconnects channel output to `context.destination`

**Video channel (`videoChannel.ts`):**

- `disposeVideoChannel(channel)` — removes the `ended` listener and all signal listeners, pauses, disconnects `onComplete` and all media signals, clears runtime
- `enableVideoChannelSignals(channel)` — opt-in `MediaChannelSignals` group; idempotent; wires DOM events to signals when called on a channel with an attached element: `waiting` → `onBuffering`, `canplay` → `onReady`, `error` → `onError`, `seeked` → `onSeeked`; DOM listeners stored in `VideoChannelRuntime.signalListeners` and removed on dispose
- `getVideoChannelCurrentTime(channel)` — reads `element.currentTime` when playing
- `getVideoChannelDuration(channel)` — convenience returning `channel.length`
- `getVideoChannelHeight(channel)` — reads `element.videoHeight`; returns 0 when element is null
- `getVideoChannelSignals(channel)` — returns the enabled `MediaChannelSignals` or `null`
- `getVideoChannelWidth(channel)` — reads `element.videoWidth`; returns 0 when element is null
- `isVideoChannelMuted(channel)` — boolean helper
- `isVideoChannelPlaying(channel)` — boolean helper
- `pauseVideoChannel(channel)` — preserves position, calls `element.pause()`
- `playVideoResource(source, options?)` — creates a channel; cleans up old signal listeners if the same element is reused; initializes muted from options and sets `element.muted`
- `resumeVideoChannel(channel)` — calls `element.play()`
- `setVideoChannelCurrentTime(channel, value)` — seek, clamped
- `setVideoChannelGain(channel, value)` — updates `channel.gain`; `element.volume` clamped to `[0, 1]`
- `setVideoChannelMuted(channel, muted)` — sets `element.muted`; preserves stored `gain`
- `setVideoChannelPlaybackRate(channel, value)` — sets `element.playbackRate`
- `stopVideoChannel(channel)` — pauses, resets to position 0

## Deferred Items

### Gold

- **3D / spatial audio** — `setAudioChannelPosition`/`setAudioListenerPosition` over `PannerNode`. Substantial new surface covering position, velocity, orientation, distance-model, rolloff-factor, and cone parameters. Requires a new `spatialAudio.ts` and types in `@flighthq/types` (`AudioListener`, `AudioPannerModel*Kind`, `AudioDistanceModel*Kind`). Headline Gold feature for the domain.
- **Analyser / metering** — `enableAudioChannelMetering(channel)` → `getAudioChannelPeakLevel` / `getAudioChannelRmsLevel` / `getAudioChannelFrequencyData(out: Uint8Array)`, and bus-level metering. Needs `AnalyserNode` in the graph chain.
- **Streaming / progressive audio** — `MediaElementAudioSourceNode`-backed audio for long-form music that does not require a fully decoded `AudioBuffer`; would unify buffer vs. stream under one `playAudioResource` API or introduce a `playAudioStream(url)` variant.
- **`@flighthq/media-formats` neighbor package** — duration/metadata probing, ID3/cue extraction, caption parsing. A new package following the `-formats` pattern. Raise with user before creating.
- **Captions / multiple audio tracks** — `getVideoChannelTextTracks`, `setVideoChannelTextTrack`, `getVideoChannelAudioTracks`, `setVideoChannelAudioTrack`, with caption cues delivered via a signal group.
- **Fullscreen / picture-in-picture** — `requestVideoChannelFullscreen` / `requestVideoChannelPictureInPicture` (web backend; sentinel no-op where unsupported), behind the backend seam.
- **Backend seam** — `AudioBackend`/`VideoBackend` in `@flighthq/types` for native host (Electron/native) and Rust parity. Stabilize the Silver API before defining the seam.
- **Full edge-case and error handling** — autoplay-policy resolution surfaced as a typed signal, device-change/`AudioContext` interruption handling, sample-rate mismatch, zero-length/NaN-duration media, seek-while-buffering, rapid play/stop churn.
- **Rust `flighthq-media`** — trails the stabilized backend seam.

### Cross-package / requires user input

- **Video-frame → `ImageSource` bridge** — `getVideoChannelImageSource(channel)` / `copyVideoChannelFrame(channel, out)` for renderer compositing. Touches `@flighthq/surface`, `@flighthq/displayobject`, and the renderer image-cache contracts. Do not proceed autonomously.
- **`@flighthq/media-formats` neighbor package** — creating a new package; raise with user before proceeding.

## Design Choices Made

### Pass 1

1. **Explicit mixer vs. ambient master** — `createAudioMixer()` per the "no top-level mutable state / explicit allocation" rule. No hidden global; callers create their own. Consistent with `createAudioContext`-style patterns.
2. **`gain` vocabulary** — canonical noun is `gain` (Web Audio). `VideoChannel.gain` maps to `element.volume` (which is `[0, 1]`); the stored `channel.gain` may exceed 1 but `element.volume` is clamped. Documented in `setVideoChannelGain`.
3. **`clamp` as file-private util** — not imported from `@flighthq/geometry` to keep bundle footprint zero. Inline in each file.
4. **`StereoPannerNode` guard** — conditionally created only if `context.createStereoPanner` exists; panning degrades gracefully to no-op in environments that lack it.

### Pass 2

5. **Bus gain routing implementation** — `AudioChannelRuntime` carries a `destinationNode: AudioNode` field (defaults to `context.destination`). `startAudioChannel` connects the gain node to `runtime.destinationNode`. `connectAudioChannelToNode(channel, node)` disconnects and reconnects the gain node, and updates `destinationNode`. This lets `routeAudioChannelToMixerBus` wire a channel to a bus gain node and `unrouteAudioChannelFromMixerBus` restore it to `context.destination` — all without re-creating the source node. The channel continues playing uninterrupted during rerouting.

6. **Reverse bus-to-mixer-runtimes map** — `setAudioBusGain`/`setAudioBusMuted`/`setAudioBusPan` must update the Web Audio graph without the caller passing the mixer. A module-level `Map<AudioBus, Set<AudioMixerRuntime>>` (populated by `addAudioBusToMixer`) provides the reverse lookup. This map holds strong references to both the bus and the runtime, which is intentional: buses are data objects that should outlive mixer runtimes in practice. The map could grow without bound if many mixers are created and GC'd; the correct long-term fix is `destroyAudioMixer(mixer)` which removes the mixer's runtimes from the reverse map — deferred alongside the full lifecycle/teardown tier.

7. **`enableAudioChannelSignals` / `enableVideoChannelSignals`** — follow the `enable*` signal group convention. Audio signals (`onBuffering`, `onError`, `onReady`, `onSeeked`) are defined in `@flighthq/types/MediaChannelSignals.ts` and created lazily in a `WeakMap<AudioChannel, MediaChannelSignals>`. For audio channels, these signals are available for the caller to populate manually (e.g., surface decode errors). For video channels, DOM events are wired at `enableVideoChannelSignals` call time: `waiting` → `onBuffering`, `canplay` → `onReady`, `error` → `onError`, `seeked` → `onSeeked`. Listeners are stored in `VideoChannelRuntime.signalListeners` and removed on `disposeVideoChannel`.

8. **`fadeAudioBusGain` signature** — takes `(mixer, bus, targetGain, durationMs)` rather than `(bus, targetGain, durationMs)` because the `GainNode` is stored per-mixer-runtime (the same bus can be in multiple mixers). Passing `mixer` makes the audio context available without extra lookup. If the bus is not yet in the mixer's Web Audio graph, it falls back to a data-only update.

## Concerns / Known Limitations

- `busToMixerRuntimes` is a regular `Map` (strong references). Calling `createAudioMixer()` repeatedly without cleanup will accumulate entries. The correct fix is `destroyAudioMixer` — deferred.
- `MediaChannelSignals` for audio channels are not automatically emitted by any internal event. They exist as signal objects that the caller or a future streaming/decode path can emit into. The `MediaReadyState` type is defined but the channel does not yet carry a `readyState` field; that field belongs on `AudioChannel` / `VideoChannel` in `@flighthq/types` (a future Gold item).
- `crossfadeAudioChannels` (mentioned in first-pass roadmap) is not yet implemented. It naturally belongs in `audioMixer.ts` (two-channel coordination).
- `clamp` is still duplicated three times across the three source files. This is intentional for zero-extra-bundle reasons (would need `@flighthq/geometry` for a shared import, which is too heavy for just a three-line helper).

## Suggestions for Future Sessions

1. Add `destroyAudioMixer(mixer): void` to clean up the master gain node and remove the mixer's runtimes from `busToMixerRuntimes`, preventing the reverse-map growth noted above.
2. Add `getAudioChannelBus(channel): AudioBus | null` — useful when the caller needs to know which bus a channel is routed to.
3. Implement `crossfadeAudioChannels(from, to, durationMs): void` in `audioMixer.ts`.
4. Add a `readyState: MediaReadyState` field to `AudioChannel` and `VideoChannel` in `@flighthq/types`, updated by the channel when buffering/ready/error transitions occur.
5. Implement 3D spatial audio (`PannerNode` + `AudioListener`) — the headline Gold feature.
6. Resolve the video-frame `ImageSource` bridge design with the user (touches `@flighthq/surface` and `@flighthq/displayobject`).
7. Consider `@flighthq/media-formats` (raise with user first).
8. Define `AudioBackend`/`VideoBackend` seam in `@flighthq/types` once Silver API is stable.
