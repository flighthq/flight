# Maturation Roadmap: @flighthq/media

**Current verdict:** partial — completeness 38/100. A clean, correctly-built playback-channel layer (transport, gain, rate, loop, seek, completion) that covers only the "play one buffer / one element" slice and is missing whole categories (panning, mixer/buses, fades, mute, spatial audio, buffering/streaming state, video sizing, frame extraction, teardown verbs).

The package today is two symmetric files — `audioChannel.ts` (Web Audio `AudioBufferSourceNode` + `GainNode`) and `videoChannel.ts` (`HTMLVideoElement`) — over channel types defined in `@flighthq/types` (`AudioChannel`/`AudioPlayOptions` in `AudioResource.ts`, `VideoChannel`/`VideoPlayOptions` in `VideoResource.ts`). The audio↔video symmetry is the package's structural backbone and must be preserved as the surface grows. All additions below define types in `@flighthq/types` first, stay free functions with `create*`/`out`/sentinel discipline, and keep the package side-effect-free behind a single root export.

---

## Bronze

The minimum viable, genuinely useful build-out: the transport controls and lifecycle a developer will reach for in the first hour and find missing. All additive, no new neighbor packages, no design decisions blocked on other teams.

- **Panning / stereo balance** — the single most conspicuous omission alongside gain. Add `setAudioChannelPan(channel, value): number` and `getAudioChannelPan(channel): number` over a `StereoPannerNode` inserted in the audio graph (`source → panner → gain → destination`), `value` in `[-1, 1]`. Add `pan: number` to `AudioChannel` and `pan?` to `AudioPlayOptions` in `@flighthq/types`. Mirror on video where supported via a panner on a `MediaElementAudioSourceNode` (or accept a documented no-op sentinel return when unsupported).
- **Mute distinct from gain** — `setAudioChannelMuted(channel, muted): boolean` / `isAudioChannelMuted(channel): boolean` and the video equivalents (`element.muted`). Add `muted: boolean` to `AudioChannel`/`VideoChannel`. Mute must preserve the stored `gain` value so unmute restores it.
- **Teardown verb** — `disposeAudioChannel(channel): void` / `disposeVideoChannel(channel): void`. Detach the `onComplete` signal (clear listeners), drop the `WeakMap` runtime, and (video) remove the `ended` event listener and any added media listeners. This closes the project's explicit teardown-verb gap: a played channel currently leaks a signal and a DOM listener. (`dispose*`, not `destroy*` — these are GC-managed; no GPU/native handle to free.)
- **Convenience transport helpers** — `getAudioChannelDuration(channel): number`, `isAudioChannelPlaying(channel): boolean`, and the video equivalents. Small, but every consumer writes them otherwise.
- **Fix the local inconsistencies flagged in the review** — extract the duplicated private `clamp` to a shared util (reuse `@flighthq/geometry`'s clamp rather than two copies), and clamp `setVideoChannelGain` to `[0, 1]` so `element.volume` cannot throw (matching the audio side).
- **Video muted flag at play time** — honor a `muted?` in `VideoPlayOptions` (browser autoplay-with-sound is blocked; muted autoplay is the common path), mapping to `element.muted`.

Effort: small. Mostly additive functions plus four new `@flighthq/types` fields. No cross-package coordination.

---

## Silver

Competitive and solid — what a well-regarded web/game audio layer offers: a mixer/bus layer, fades, buffering/error state, and the video-frame bridge that makes video usable inside the renderer. This is the jump from "play a clip" to "an audio/video subsystem."

- **Mixer / bus layer** — a new `audioMixer.ts` (and types in a new `@flighthq/types` `AudioMixer.ts`). A `AudioBus` is plain data with a name/kind and a gain/pan/mute; channels route to a bus, buses route to a master bus.
  - `createAudioBus(options?): AudioBus`, `createAudioMixer(): AudioMixer` (or a single ambient master accessed via `getAudioMaster()`).
  - `setAudioBusGain` / `setAudioBusPan` / `setAudioBusMuted` and `get*` mirrors.
  - `routeAudioChannelToBus(channel, bus): void`, `getAudioChannelBus(channel): AudioBus | null`.
  - Collective control: `stopAllAudioChannels(): void`, `pauseAllAudioChannels` / `resumeAllAudioChannels`, `setAudioMasterGain` / `setAudioMasterMuted`, `getActiveAudioChannels(): readonly AudioChannel[]`. This is the `SoundMixer` equivalent and the largest single value add in this tier.
- **Fades / volume ramps** — `fadeAudioChannelGain(channel, target, durationMs, easing?): void` over `gain.linearRampToValueAtTime` / `setValueCurveAtTime`, plus `crossfadeAudioChannels(from, to, durationMs): void`. Same for bus gain (`fadeAudioBusGain`). Optional easing should accept an `@flighthq/easing` function. Add a `fading` substate or a fade-complete signal as appropriate.
- **Loop region / sub-clip playback** — `loopStart`/`loopEnd` (ms) on `AudioChannel` and `AudioPlayOptions`, wired to `AudioBufferSourceNode.loopStart`/`loopEnd`; allow playing an in/out sub-region of a buffer.
- **Buffering / readiness / error state** — add a `MediaReadyState` to `@flighthq/types` and surface it on both channels (`buffering | ready | playing | error` overlay on the existing state). For video, wire `canplay` / `waiting` / `stalled` / `error` into signals; for audio, surface decode/load failure. Expose `enableMediaChannelSignals(channel)` (per project `enable*` group convention) adding `onBuffering` / `onReady` / `onError` / `onSeeked` signals — opt-in so the cost is only paid when used. Add `getMediaChannelBufferedRanges(channel): readonly TimeRange[]`.
- **Video-frame → `ImageSource` bridge** — `getVideoChannelImageSource(channel): ImageSource | null` (and/or an `out`-param `copyVideoChannelFrame(channel, out: ImageSource)`) so the renderer/`Video` display object can composite the current frame. This is the seam between media and `@flighthq/displayobject`'s `Video` (`Video.ts`/`VideoData.source`); coordinate the exact `ImageSource` shape with `@flighthq/surface` / the renderer image-cache.
- **Video sizing metadata** — `getVideoChannelWidth` / `getVideoChannelHeight` (from `videoWidth`/`videoHeight`), `getVideoChannelAspect`, and a `poster?` in `VideoPlayOptions`. Fit/crop policy stays a display-object concern but the intrinsic size must be readable here.
- **Effects insert escape hatch** — expose the underlying `AudioNode` chain head/tail (`getAudioChannelInputNode` / `getAudioChannelOutputNode`) so callers can insert an `AnalyserNode`, `BiquadFilterNode`, or custom processing without the package owning every effect. Document the insertion contract.

Effort: medium-large. The mixer is the load-bearing piece and several other items (fades on buses, collective control) depend on it, so build it first within this tier. The video-frame bridge needs a cross-package `ImageSource` decision.

---

## Gold

Authoritative / AAA — exhaustive coverage, spatial audio, format ingest, full edge-case/error handling, and 1:1 Rust-port parity. Nothing a domain expert would find missing.

- **3D / spatial audio** — a `spatialAudio.ts` over `PannerNode` + `AudioListener`. Types in `@flighthq/types` (`AudioListener`, `AudioPannerModel`/`AudioDistanceModel` `*Kind` strings). `setAudioChannelPosition(channel, x, y, z)`, `setAudioChannelVelocity`, `setAudioChannelOrientation`, `setAudioListenerPosition` / `setAudioListenerOrientation`, distance-model/rolloff/cone configuration. This is explicitly in-scope for a graphics-SDK audio domain and is the headline Gold feature.
- **Analyser / metering** — first-class `enableAudioChannelMetering(channel)` exposing `getAudioChannelPeakLevel` / `getAudioChannelRmsLevel` / `getAudioChannelFrequencyData(out: Uint8Array)` and bus-level metering for VU/spectrum UIs.
- **Streaming / progressive audio path** — a streamed-audio channel for long clips/music that does not require a fully decoded `AudioBuffer` (over `MediaElementAudioSourceNode` or a fetch+`decodeAudioData` chunk pipeline), unifying the API so `playAudioResource` transparently handles buffer vs stream sources with correct buffering state.
- **`@flighthq/media-formats` neighbor package** — the `-formats` importer/parser pattern for media metadata and container/codec concerns that do not belong in the runtime channel: duration/sample-rate/channel-count probing, ID3/metadata extraction, cue-point/marker parsing, WebVTT/SRT caption parsing. Keeps the core channel package thin and tree-shakable.
- **Captions / multiple tracks** — `getVideoChannelTextTracks`, `setVideoChannelTextTrack`, `getVideoChannelAudioTracks`, `setVideoChannelAudioTrack`, with caption cues delivered via a signal group; consume parsed cues from `@flighthq/media-formats`.
- **Fullscreen / picture-in-picture** — `requestVideoChannelFullscreen` / `requestVideoChannelPictureInPicture` (web backend; sentinel no-op where unsupported), behind the backend seam below.
- **Backend seam for non-web hosts** — define an `AudioBackend` / `VideoBackend` in `@flighthq/types` (the Web Audio / `HTMLVideoElement` implementation becomes `createWebAudioBackend()` / `createWebVideoBackend()`), with `getAudioBackend` / `setAudioBackend` and the video pair. This is what lets a native host (and the Rust port) supply its own mixer/decoder without touching the channel API, matching the platform-suite `*Backend` pattern. Web backends guard every call and return sentinels when a context cannot be created.
- **Full edge-case and error handling** — autoplay-policy resolution surfaced as a typed signal (not a swallowed `catch`), device-change/`AudioContext` interruption handling, sample-rate mismatch, zero-length/NaN-duration media, seek-while-buffering, and rapid play/stop churn. Sentinel returns everywhere expected failure is reachable; throw only on genuine API misuse.
- **Exhaustive tests** — colocated unit tests for every new export (Web Audio mocked, jsdom for video), plus a functional/visual gate for the video-frame→`ImageSource` bridge rendered across backends, and mixer-routing/fade-timing tests against a fake `AudioContext` clock.
- **1:1 Rust-port parity** — a `flighthq-media` crate mirroring the channel/mixer/spatial API as free functions over native audio (cpal/rodio or kira-style) and a video decoder, behind the same `AudioBackend`/`VideoBackend` seam. Channel/bus/spatial types are value-typed and headlessly testable, making this a strong conformance target; the video-frame bridge produces a `flighthq-surface` RGBA buffer matching the TS `ImageSource` path. Record any intentional TS↔Rust divergence (e.g. decoder-specific behavior) in the conformance map.

Effort: large and multi-pass. Spatial audio, the `-formats` package, and the backend seam are each their own work item; Rust parity trails the TS API stabilizing.

---

## Sequencing & effort

Recommended order, with dependencies and the items that need a decision before coding:

1. **Bronze first, in one pass** — pan, mute, `dispose*`, convenience helpers, and the two consistency fixes. All additive, no blockers. The `dispose*` verb and the shared `clamp`/video-gain-clamp fixes should land immediately; they are correctness/discipline gaps, not features. Add the new `@flighthq/types` fields (`pan`, `muted`, plus options) in the same change — types-first.

2. **Mixer/bus layer (Silver) before everything else in Silver** — fades-on-buses, collective control, and routing all hang off it. Define `AudioBus`/`AudioMixer` in `@flighthq/types` first. Decision to surface: **one ambient master mixer vs. an explicit user-created mixer** — the project's "no top-level mutable state / explicit allocation" rule pushes toward `createAudioMixer()` + an explicit master rather than a hidden global. Flag this as a design choice for the user before building.

3. **Fades, loop-region, effects escape hatch (Silver)** — independent of each other; can follow the mixer in any order. Fades should consume `@flighthq/easing` (confirm dependency direction is allowed; media → easing is fine).

4. **Buffering/readiness/error signals (Silver)** — uses the `enable*` signal-group convention; needs a `MediaReadyState` and signal-payload types in `@flighthq/types`. Self-contained.

5. **Video-frame → `ImageSource` bridge (Silver)** — **cross-package design item**: the exact `ImageSource` contract and how the `Video` display object (`@flighthq/displayobject`/`types` `Video.ts`) and the renderer image-cache consume a per-frame texture must be agreed with the render packages. Surface this to the user as a design decision; it touches `@flighthq/surface`, `@flighthq/displayobject`, and the renderer packages, not just media. Do not proceed autonomously across that boundary.

6. **Gold, multi-pass** — spatial audio and metering build on the mixer graph (do after the mixer is stable). The **`@flighthq/media-formats` neighbor package** is a new-package decision (copy a nearby `-formats` package shape, run `npm run packages:check`) — surface before creating. The **`AudioBackend`/`VideoBackend` seam** should be defined once the TS web API has stabilized through Silver, so the seam reflects the real surface rather than churning; it is the precondition for native + Rust parity. **Rust `flighthq-media`** trails the stabilized seam and follows the conformance map.

Cross-package / design-decision items to raise with the user explicitly:

- Ambient-master vs. explicit-mixer ownership model (step 2).
- The video-frame `ImageSource` bridge contract spanning surface/displayobject/render (step 5).
- Creating `@flighthq/media-formats` (step 6).
- Whether `gain` (Web Audio vocabulary) stays the canonical noun across the API while `VideoChannel.gain` maps to `element.volume` — document the mapping regardless.
