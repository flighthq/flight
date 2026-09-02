---
package: '@flighthq/media'
status: partial
score: 45
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# media — Review

## Verdict

`partial` -- **45/100**. The prior review (64/100) was scored against a surface that included ~14 functions present only in stale `dist/` -- mute, loop region, dispose, signals -- and the status log (2026-08-08) confirmed those never existed in source. Rescoring from live code resets the baseline. Against that honest baseline, genuine progress has landed since: an `AudioDeviceBackend` abstraction with sentinel, diagnostics, and a web implementation; correctness fixes to mixer pause/resume; the `busToMixerRuntimes` leak sealed; a guard layer for unmixed-bus writes; and `destroy*` teardown verbs replacing the prior `dispose*`. But the channel-level API still lacks table-stakes features (mute, loop region, `MediaChannelSignals`), one remaining correctness bug persists in `stopAllAudioMixerChannels`, video has no backend seam, and the entire Gold domain surface (spatial audio, metering, streaming, crossfade) is absent. The package is a competent stereo transport-and-mixing layer with a well-designed backend abstraction, but not yet a credible media subsystem for a graphics SDK.

## Present capabilities

Verified against `packages/media/src/` on 2026-09-02 -- 5 source files, 5 test files, 62 exported functions (53 public via `.`, 9 contract-only via `./contract`), 143 test cases.

**Audio channel** (`audioChannel.ts`, 18 exports) routed through the `AudioDeviceBackend` abstraction:

- Transport: `playAudioResource` (sentinel-`null` when `source.buffer === null`), `pauseAudioChannel` (destroys the active source), `resumeAudioChannel`, `stopAudioChannel`, current-time get/set (ms, clamped), `setAudioChannelPlaybackRate`.
- Gain/pan: `setAudioChannelGain`, `setAudioChannelPan` (clamped `[-1, 1]`, delegates to `backend.setSourcePan`).
- Fade: `fadeAudioChannelGain` via `linearRampToValueAtTime` when the backend provides web node access, with a data-only `setSourceGain` fallback otherwise.
- Loop: finite/infinite `loops` counter with `onComplete` signal on completion.
- Lifecycle: `destroyAudioChannel` (destroys source and buffer, clears the WeakMap entry).
- Web Audio node access (contract-only): `getAudioChannelInputNode` (buffer source node), `getAudioChannelOutputNode` (gain node).
- Capability query: `hasAudioChannelFade`, `hasAudioChannelNodeAccess` -- both probe the backend for web extension methods.
- Bus wiring: `connectAudioChannelToNode` reroutes the gain node to a new destination; the mixer uses this to move a playing channel onto a bus.

**Audio device backend** (`audioDeviceBackend.ts`, 12 exports) -- the backend abstraction layer for audio:

- `AudioDeviceBackend` interface in `@flighthq/types` with 15 operations (device/buffer/source lifecycle, gain/pan/rate, ended callback, resume).
- `createWebAudioDeviceBackend` -- concrete Web Audio implementation using `AudioContext`, `AudioBufferSourceNode`, `GainNode`, `StereoPannerNode`. Source graph: buffer source connects through panner into gain; gain stays the output node. Handles played in incrementing handles behind branded `AudioDeviceHandle`/`AudioBufferHandle`/`AudioSourceHandle` newtypes.
- `setAudioDeviceBackend` / `installAudioDeviceHostBackend` -- custom (user-set) overrides host (platform-provided); both override the sentinel. `getAudioDeviceBackend` returns the active layer. `resetAudioDeviceBackendForTest` clears all state for tests.
- Diagnostics: `explainAudioDeviceBackend` returns `BackendExplanation` (layer, conflict, viability); `explainAudioDeviceOperation` returns per-operation availability; `hasAudioDeviceOperation` boolean shortcut. `observeAudioDeviceHostResult` records runtime viability from actual host calls.
- Web-specific accessors (contract-only): `getAudioSourceGainNode`, `getAudioSourceBufferSourceNode`, `hasAudioDeviceWebNodeAccess` -- probes for the `AudioDeviceBackendWebExtension` shape.
- Sentinel: a no-op `AudioDeviceBackend` that returns 0-handles and absorbs all calls without throwing; ensures callers never need null-checks or feature-probing before calling.

**Audio mixer** (`audioMixer.ts`, 17 exports) over a real Web Audio graph:

- `createAudioMixer(context, options?)` -- master `GainNode` connected to `context.destination`; no global singleton.
- `createAudioBus(options?)` -- plain data object; `addAudioBusToMixer` wires bus `GainNode` + optional `StereoPannerNode` into the master.
- Routing: `routeAudioChannelToMixerBus`, `unrouteAudioChannelFromMixerBus` (reconnects to `context.destination`).
- Per-bus: `setAudioBusGain`, `setAudioBusMuted`, `setAudioBusPan` (all push to every mixer holding the bus via `busToMixerRuntimes` reverse map).
- Per-bus fade: `fadeAudioBusGain` via `linearRampToValueAtTime`.
- Master: `setAudioMixerMasterGain`, `setAudioMixerMasterMuted`.
- Collective: `pauseAllAudioMixerChannels` (calls `pauseAudioChannel` -- actually stops nodes, tracks `channelsPausedByMixer`), `resumeAllAudioMixerChannels` (resumes only what the mixer paused, re-checks channel state), `stopAllAudioMixerChannels` (**bug** -- see Gaps), `getAudioMixerActiveChannels`.
- Teardown: `destroyAudioMixer` -- stops channels via `stopAudioChannel`, disconnects bus nodes and master, clears reverse map, deletes runtime.
- Guard seam (contract-only): `setAudioBusMixerGuard` -- nullable callback invoked on bus writes that reach no mixer.

**Guard layer** (`enableAudioMixerGuards.ts`, 2 exports, contract-only):

- `enableAudioMixerGuards` / `disableAudioMixerGuards` -- installs/removes a `logOnce` warning via `@flighthq/log` for bus writes that reach no audio node. Idempotent, tree-shakeable, tested against the `@flighthq/log` memory sink.

**Video channel** (`videoChannel.ts`, 13 exports) over `HTMLVideoElement`:

- Transport: `playVideoResource` (sentinel-`null` when element is null), `pauseVideoChannel`, `resumeVideoChannel`, `stopVideoChannel`, current-time get/set (ms, clamped), `setVideoChannelGain` (element.volume), `setVideoChannelPlaybackRate`.
- Loop: finite/infinite `loops` with `onComplete` signal.
- Introspection: `getVideoChannelWidth`/`Height` (from `videoWidth`/`videoHeight`), `getVideoChannelCurrentTime`, `getVideoChannelDuration`, `isVideoChannelPlaying`.
- Teardown: `destroyVideoChannel` -- pauses element, removes ended listener, nulls source, records element in `channelElements` WeakMap at creation so it survives `destroyVideoResource` nulling `resource.element`.

**Shape compliance:**

- `sideEffects: false`, two-lane export (`.` / `./contract`), dependencies: `audio`, `video`, `signals`, `log`, `types` (dev: `texture`).
- All types in `@flighthq/types`: `AudioChannel`, `AudioBus`, `AudioMixer`, `VideoChannel`, `AudioDeviceBackend`, `BackendExplanation`, `BackendOperationExplanation`, `MediaChannelSignals`, handle newtypes, options bags.
- Runtime state in WeakMaps (`channelRuntime`, `mixerRuntimes`, `videoChannelRuntimes`, `channelElements`), off-entity.
- Contract-only exports: `createWebAudioDeviceBackend`, `installAudioDeviceHostBackend`, `observeAudioDeviceHostResult`, `resetAudioDeviceBackendForTest`, `getAudioSourceGainNode`, `getAudioSourceBufferSourceNode`, `setAudioBusMixerGuard`, `enableAudioMixerGuards`, `disableAudioMixerGuards`. Correct lane discipline: test resets and backend internals stay off the public API.

## Gaps

**Correctness bug:**

- **`stopAllAudioMixerChannels` does not stop the underlying audio sources.** It sets `channel.state = 'stopped'` and `channel.currentTime = 0` for each active channel but never calls `stopAudioChannel(channel)`. The Web Audio source nodes keep emitting sound. Contrast `pauseAllAudioMixerChannels` (which correctly delegates to `pauseAudioChannel`) and `destroyAudioMixer` (which correctly calls `stopAudioChannel`). This is the same class of bug the prior review flagged for pause/resume, and the pause fix demonstrates the pattern the stop case should use.

**Missing channel-level basics (table-stakes for the domain):**

- **No channel mute.** `AudioChannel` has no `muted` field; no `setAudioChannelMuted` / `isAudioChannelMuted`. `VideoChannel` has no `muted` field; no `setVideoChannelMuted`. Mute is separate from gain (a muted channel preserves its gain so unmute restores it). The mixer bus has mute; individual channels do not.
- **No audio loop region.** `AudioChannel` carries `loops` (loop count) but no `loopStart` / `loopEnd`. The `startAudioChannel` function starts at `channel.currentTime`; there is no way to loop a sub-region of the buffer.
- **No `MediaChannelSignals` implementation.** The type (`MediaReadyState` + `onBuffering`/`onError`/`onReady`/`onSeeked`) is defined in `@flighthq/types` but no `enableAudioChannelSignals` / `enableVideoChannelSignals` / `getAudioChannelSignals` / `getVideoChannelSignals` exists, no channel carries a `readyState`, and no internal event fires any of these signals. The type is dead weight.
- **No per-channel pan on video.** Audio channels have `setAudioChannelPan`; video has no pan equivalent.

**Missing domain surface (Gold):**

- **Spatial / 3D audio** -- no `PannerNode`, `AudioListener`, distance model, cone parameters, or HRTF. The headline feature for game audio in a graphics SDK.
- **Metering** -- no `AnalyserNode`, no peak/RMS/frequency data at channel or bus level.
- **Streaming** -- buffer-only; no `MediaElementAudioSourceNode` for long-form playback, no progressive loading path.
- **Crossfade** -- no `crossfadeAudioChannels` or equivalent.
- **Video backend seam** -- `AudioDeviceBackend` exists; there is no `VideoDeviceBackend`. Video is hard-wired to `HTMLVideoElement`.
- **Video-frame to ImageSource bridge** -- no `getVideoChannelImageSource` / `copyVideoChannelFrame` (correctly flagged as cross-package).
- **Captions / text tracks / picture-in-picture / fullscreen** -- absent.

**Minor:**

- **`clamp` is duplicated** in `audioChannel.ts`, `audioMixer.ts`, and `videoChannel.ts`. The status doc records this as deliberate (avoiding a dependency on `@flighthq/geometry`), but `@flighthq/math` now exists as a pure scalar package with `clamp`. The triplication can be replaced by a single import.
- **`getAudioChannelInputNode` exposes a transient node.** It returns the `AudioBufferSourceNode` via the backend, but this node is destroyed and recreated on every pause/resume, seek, and loop iteration. An effect chain connected to it is silently dropped. The lifetime contract is undocumented.

## Charter contradictions

The charter was substantially filled in on 2026-07-02 with a north star, boundaries, decisions, and open directions. Against the stated decisions:

- **Decision: "Fix correctness holes immediately."** `pauseAllAudioMixerChannels`/`resumeAllAudioMixerChannels` are fixed. `destroyAudioMixer` landed. `busToMixerRuntimes` is bounded. But `stopAllAudioMixerChannels` has the same class of bug (state flip without stopping the source node) and has not been addressed.
- **Decision: "Lost work must be rebuilt."** Parked pending the existence question. The ~14 functions (mute, pan, loop points, disposal, signals) are still absent from source. Since the backend seam now exists (partially answering one open direction), the rebuild destination question is narrower, but the work is still undone.
- **Boundary: "Audio channel playback (play/pause/resume/stop/fade/gain/rate)"** is implemented but missing mute and loop region, which are part of any complete channel playback surface. The boundary lists these under "in scope (current)."

## Contract & docs fit

- **Types-first, two-lane export, `sideEffects: false`, off-entity WeakMap runtime state, sentinel-`null` returns, `get*`/`is*`/`has*`/`set*`/`create*`/`destroy*` verb discipline** -- all satisfied.
- **Backend abstraction aligns with Flight's explicit-dependency model.** `AudioDeviceBackend` is a value passed to creation functions (through the device handle), not a singleton. The `getAudioDeviceBackend()` function does hold module-scoped mutable state (`_custom`, `_host`), which technically violates the "no module-scoped mutable state that functions reach for" constraint -- but this is the standing backend-seam pattern used across the SDK (`@flighthq/textshaper` uses the same slot approach), and the custom/host/sentinel layering with explain diagnostics is a well-executed version of it.
- **`destroy*` vs `dispose*` is correct.** `destroyAudioChannel` frees the `AudioBuffer` handle (a non-GC resource owned by the backend). `destroyVideoChannel` pauses the element but does not destroy the borrowed `VideoResource` -- it nulls the source reference and lets GC collect. The verb choice (`destroy` for both) is defensible: the audio case clearly frees a resource; the video case detaches the ended listener and nulls references, which could be argued as `dispose`. The asymmetry is minor.
- **Guard layer matches the diagnostics convention.** `enableAudioMixerGuards` is opt-in, separately importable (contract-only), uses `@flighthq/log` via `logOnce`, and the guard seam (`setAudioBusMixerGuard`) runs the reverse-map check only while installed. No channel-level guards exist for the missing channel mute/loop region gap.
- **`clamp` triplication** remains. `@flighthq/math` is available and tree-shakeable.
- **`AudioChannel.pan` field** is on the type but not documented on `AudioPlayOptions`. A channel starts at `pan: 0` with no option to set initial pan at play time. Minor ergonomic gap.

## Candidate open directions

1. **Fix `stopAllAudioMixerChannels`.** It should delegate to `stopAudioChannel(channel)` for each active channel, matching the pattern `pauseAllAudioMixerChannels` and `destroyAudioMixer` already use. This is a bug fix, not a design question.

2. **Channel mute and loop region.** Table-stakes for both audio and video channels. `muted` field + `setAudioChannelMuted` / `isAudioChannelMuted` / `setVideoChannelMuted`; `loopStart` / `loopEnd` fields + setters on `AudioChannel`, wired to `AudioBufferSourceNode.loopStart`/`.loopEnd` via the backend.

3. **`MediaChannelSignals` wiring or removal.** The type exists and is exported. Either implement `enableAudioChannelSignals`/`enableVideoChannelSignals` (the video side can wire DOM events; the audio side needs backend-level hooks or a polling seam), or remove the dead type.

4. **Should media exist?** The charter's central open question. The audio backend seam partially answers it: `audioDeviceBackend.ts` is clearly a media-layer concern (it is too high for `@flighthq/audio` which owns resource data, and too cross-cutting for a single renderer). If the mixer and backend orchestration stay here, media has a reason to live. If audio playback moves to audio and video playback to video, the backend and mixer surface needs a home.

5. **Video backend seam.** Audio has `AudioDeviceBackend`; video has no equivalent. A `VideoDeviceBackend` would decouple video playback from `HTMLVideoElement`, enabling native-host and Rust-parity paths.

6. **Spatial audio scope.** Whether it lives in media or a `spatial-audio` package. It requires `PannerNode`, `AudioListener`, distance models, and cone parameters -- a substantial surface.

7. **`clamp` migration to `@flighthq/math`.** Trivial mechanical change; removes three duplicated helpers.
