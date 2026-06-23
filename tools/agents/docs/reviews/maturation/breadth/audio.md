# New Package Spec: @flighthq/audio

**Represents:** An explicit audio mixer graph over `@flighthq/media`'s playback channels — gain/pan, buses/groups, ducking/crossfade, DSP effects, analyser/FFT spectrum, spatial/positional audio, generated and streaming `sampleData`, and microphone/audio input — the mature counterpart to media's thin playback channels.

**Requested by:** game-2d, missing-domains, openfl-lime-parity

## Fits

`@flighthq/audio` sits one layer above `@flighthq/media` and is the audio analogue of how `effects`/`filters` sit above `surface`: `media` plays a source onto a channel; `audio` routes channels through a node graph (buses, effects, spatialization) before the output device.

- **Dependencies:** `@flighthq/types` (header), `@flighthq/signals` (opt-in groups), `@flighthq/geometry` (`Vector3`/`Matrix` for spatial listener/source pose). It depends on `@flighthq/media` only through shared types in `@flighthq/types` — it must not import `@flighthq/media`'s implementation, and neither package may import the other. `AudioChannel` already lives in `@flighthq/types`, so both compose against the header. It must not import `@flighthq/sdk`.
- **Backend seam:** `AudioEngineBackend` in `@flighthq/types`, with `getAudioEngineBackend`/`setAudioEngineBackend`/`createWebAudioEngineBackend` (Web Audio `AudioContext`/`AudioNode` graph; native hosts register their own over miniaudio/cpal in the Rust port). The current `media` audio path builds Web Audio nodes inline; the seam generalizes that so `media` channels can be _routed into_ an `audio` graph instead of straight to `context.destination`. Microphone input is its own command capability with `AudioInputBackend` + `getAudioInputBackend`/`setAudioInputBackend`/`createWebAudioInputBackend`, mirroring `@flighthq/webcam`'s shape (getUserMedia for audio).
- **Neighbor packages:** `@flighthq/audio-formats` — decoders/encoders and metadata parsers (ID3/Vorbis comments, WAV/OGG/MP3 PCM decode for `sampleData` and offline contexts) following the `-formats` importer pattern, so the core stays codec-free. `@flighthq/media` remains the simple play/pause/seek channel layer; `@flighthq/resources` continues to own `AudioResource` loading/decode at the resource tier.
- **Rust crate:** `flighthq-audio` (native-first over cpal/kira/miniaudio; wasm over Web Audio in `host-web`), with `flighthq-audio-formats` mirroring the decoder neighbor. Value-typed descriptors (mixer node configs, spatial poses, filter params) are plain data and Rust-mirrorable 1:1; the live engine graph is stateful (all-or-nothing, like the scene graph) and does not mix across the wasm boundary.

All packages are `"sideEffects": false`, single root `.` export, free functions with `create*`/`out`-param allocation discipline, `Readonly<>` by default, and `*Kind` string identifiers for node/effect/source types. No registration or `AudioContext` creation at module top level — callers `createAudioEngine(...)` explicitly.

## Bronze

The 20% that closes the most-cited parity gaps: pan, a master/group bus tree, and a global mixer. Shippable, basic, no DSP graph yet.

Types first in `@flighthq/types`:

- `AudioPan` semantics added to `AudioChannel`/`AudioPlayOptions` as a `pan: number` field (−1 left … 0 center … 1 right), matching OpenFL `SoundTransform.pan`.
- `AudioBus` (entity) + `AudioBusRuntime` (opaque) — a named mix node with `gain`, `pan`, `muted`, `solo`, `parent: AudioBus | null`.
- `AudioBusKind` string identifier; `AudioEngine` (entity) + `AudioEngineRuntime`.
- `AudioMixerSnapshot` (plain data: per-bus gain/mute for save/restore).

Functions in `@flighthq/audio`:

- `createAudioEngine(options?)`, `destroyAudioEngine(engine)` (frees the device/context — `destroy*`, not `dispose*`).
- `createAudioBus(engine, options?)`, `getAudioBusRoot(engine)` (the master bus), `addAudioBusChild(parent, child)`, `removeAudioBusChild(parent, child)`.
- `routeAudioChannelToBus(channel, bus)` — connect a `media` `AudioChannel` into the graph rather than the raw destination.
- `setAudioBusGain(bus, value)`, `setAudioBusPan(bus, value)`, `setAudioBusMuted(bus, value)`, `setAudioBusSolo(bus, value)`, with `get*` counterparts.
- `setAudioChannelPan(channel, value)` (the missing OpenFL `SoundTransform.pan`; lives here, not in `media`, since pan needs a stereo panner node in the graph).
- `setMasterAudioGain(engine, value)`, `getMasterAudioGain(engine)` — the `SoundMixer` global volume.
- `captureAudioMixerSnapshot(engine, out)` / `applyAudioMixerSnapshot(engine, snapshot)` — master/sfx/music slider persistence.
- Sentinels: routing a stopped/disposed channel returns `false`; creating a bus on a destroyed engine returns `null`.

## Silver

Competitive with a good game-audio library (Howler/FMOD-lite): the effect graph, ducking/crossfade, analyser/FFT, and audio input.

Types in `@flighthq/types`:

- `AudioEffect` open contract + concrete descriptors: `AudioGainEffect`, `AudioFilterEffect` (`type: 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'notch' | 'lowshelf' | 'highshelf'`, `frequency`, `q`, `gain`), `AudioDelayEffect`, `AudioCompressorEffect`, `AudioDistortionEffect`, `AudioConvolverEffect` (reverb impulse), `AudioStereoPannerEffect` — each a plain data descriptor with an `AudioEffectKind` string, applied by an explicit backend function (Flight rule: data over runtime objects).
- `AudioAnalyser` (entity) + `AudioAnalyserRuntime`; `AudioSpectrum` (plain `Float32Array` frequency/time-domain out buffers).
- `AudioInputBackend`, `AudioInputDevice`, `AudioInputStream`, `AudioInputOptions` (sample rate, channel count, echo cancellation).
- `AudioDucking` and `AudioCrossfade` descriptors (target bus, duration, curve via `@flighthq/easing`).
- Spectrum/analyser signal group types: `AudioAnalyserSignals`.

Functions in `@flighthq/audio`:

- Effect chain on a bus: `addAudioBusEffect(bus, effect)`, `removeAudioBusEffect(bus, effect)`, `setAudioBusEffectParams(bus, effect, params)`, `clearAudioBusEffects(bus)` — effects are an ordered chain on the bus, tree-shakable per effect kind.
- `createAudioAnalyser(engine, options?)`, `attachAudioAnalyserToBus(analyser, bus)`, `getAudioAnalyserSpectrum(analyser, out)` (frequency bins — the OpenFL `SoundMixer.computeSpectrum` equivalent), `getAudioAnalyserWaveform(analyser, out)`, `getAudioAnalyserPeak(analyser)` / `getAudioAnalyserRms(analyser)`.
- Transitions: `crossfadeAudioBus(engine, from, to, options)`, `duckAudioBus(engine, target, options)` / `unduckAudioBus(engine, target)` (sidechain-style auto-duck of music under SFX/voice), `fadeAudioBusGain(bus, target, durationMs, easing?)`.
- Audio input (separate command capability, `@flighthq/webcam`-shaped): `requestAudioInputPermission()`, `listAudioInputDevices()`, `startAudioInput(options?)` → `AudioInputStream | null`, `stopAudioInput(stream)`, `getAudioInputLevel(stream)`, `routeAudioInputToBus(stream, bus)`.
- Signals via opt-in groups: `enableAudioAnalyserSignals(analyser)` (e.g. `onBeat`/`onThreshold`), `enableAudioBusSignals(bus)` (`onMute`/`onSolo`); functions live here, in the owning package.
- Cross-backend consistency: analyser bin counts, FFT windowing, and pan law (equal-power) specified once and matched across Web Audio and native so spectrum/pan read identically.

## Gold

Authoritative / AAA: generated + streaming `sampleData`, full spatial/positional audio with distance models and occlusion, offline rendering, and 1:1 Rust parity with conformance tests.

Types in `@flighthq/types`:

- `AudioSampleSource` (entity) + `AudioSampleSourceRuntime`; `AudioSampleCallback` (`(out: Float32Array, channelCount, sampleRate, position) => void`) — procedural PCM generation, the Flash `Sound` `sampleData` equivalent.
- `AudioStreamSource` for chunked/streaming buffers (long music without full decode).
- `AudioListener` (entity, `position: Vector3`, `orientation`, `velocity`) and `AudioSpatialSource` (`position`, `velocity`, `AudioDistanceModel` = `'linear' | 'inverse' | 'exponential'`, `refDistance`, `maxDistance`, `rolloffFactor`, `coneInnerAngle`/`coneOuterAngle`/`coneOuterGain`).
- `AudioSpatialSourceKind`, `AudioPannerKind` strings; `AudioOcclusion` descriptor (low-pass + gain attenuation through geometry).
- `OfflineAudioRenderRequest` / `AudioRenderResult` (render a graph to a PCM buffer headlessly — the conformance + bounce-to-file primitive).
- `AudioWorkletProcessor` seam type for custom DSP nodes.

Functions in `@flighthq/audio`:

- Generated audio: `createAudioSampleSource(engine, callback, options?)`, `playAudioSampleSource(source, bus)`, `stopAudioSampleSource(source)`; `createAudioStreamSource(engine, options?)`, `pushAudioStreamSamples(source, out)` — `sampleData` + streaming.
- Spatial: `createAudioListener(engine)`, `setAudioListenerPose(listener, position, orientation, out?)`, `createAudioSpatialSource(engine, options?)`, `setAudioSpatialSourcePosition(source, position)`, `routeAudioSpatialSourceToBus(source, bus)`, `setAudioSpatialSourceDistanceModel(source, model)`, `applyAudioOcclusion(source, occlusion)`. 2D convenience: `setAudioSpatialSourcePosition2D(source, x, y)` (z=0) for game-2d's positional SFX use case.
- HRTF/panning model selection: `setAudioPannerModel(source, 'hrtf' | 'equalpower')`.
- Offline/headless: `renderAudioGraphOffline(engine, request)` → `AudioRenderResult | null` — bounce a mix, and the deterministic conformance instrument for Rust↔TS.
- Custom DSP: `registerAudioWorklet(engine, kind, processor)` (web) with native equivalent, last-write-wins like `registerRenderer`.
- Resource bridge to `@flighthq/audio-formats`: `decodeAudioSampleData(bytes)` → PCM, `readAudioMetadata(bytes)` → `AudioMetadata` (ID3/Vorbis — OpenFL `Sound` ID3), `encodeAudioWav(pcm, out)`.
- Full edge/error handling: device loss + auto-resume on suspend (already partially in `media`), context unlock-on-gesture helper `unlockAudioEngine(engine)`, voice-stealing/limit policy `setAudioEngineMaxVoices(engine, n)` and pooling (`acquireAudioBus`/`releaseAudioBus`) for high SFX counts.
- Complete colocated `*.test.ts` per source file, `enable*` signal-group tests, alias-safe `out`-param tests for spatial pose math, and `flighthq-audio` Rust crate with `renderAudioGraphOffline` PCM fingerprints in the conformance suite.

## Boundaries

- **Stays in `@flighthq/media`:** simple one-shot/looping playback, `play/pause/resume/stop`, `currentTime` seek, per-channel `gain`/`playbackRate`, and `AudioChannel` lifecycle. `media` is the "just play a sound" tier; `audio` is the routing/mixing/DSP tier. `pan` is the seam case — the field is on `AudioChannel` in `@flighthq/types`, but the panner node that realizes it lives in `audio` (`setAudioChannelPan`), because pan needs the graph.
- **Lives in `@flighthq/audio-formats`:** codec decode/encode (MP3/OGG/WAV/FLAC PCM), ID3/Vorbis metadata parsing. The core engine stays codec-free.
- **Lives in `@flighthq/resources`:** `AudioResource` loading + decode at the resource tier; `audio` consumes the decoded buffer, it does not fetch.
- **Lives in `@flighthq/scene`/`@flighthq/camera`:** there is no 3D scene coupling here. `audio` takes an explicit `AudioListener` pose (a `Vector3` + orientation) as plain data; the caller syncs it from a camera. `audio` does not import scene/camera.
- **Not here:** video (stays in `media`), MIDI synthesis, and a full node-based audio editor UI. Music/sequencing (trackers, step sequencers) would be a future `@flighthq/audio-sequencer` neighbor if requested, not core.

## Open design questions

- **Pan ownership.** Is `setAudioChannelPan` acceptable in `audio` operating on a `media`-owned `AudioChannel`, or should panning require routing the channel to a bus first (`setAudioBusPan`) and `media` channels stay strictly mono-to-destination? The former is friendlier for OpenFL `SoundTransform` parity; the latter keeps the layering cleaner.
- **media↔audio import direction.** Both compose against `@flighthq/types`, but routing a live `AudioChannel` into the graph implies one side reaches the other's runtime. Resolve via a shared `AudioChannelRuntime` slot in `@flighthq/types` (a nullable `outputNode`/route hook the engine fills), keeping both packages import-free of each other — confirm this slot belongs on the channel runtime.
- **Engine singleton vs explicit.** Web apps typically want one `AudioContext`; OpenFL `SoundMixer` is global. Do we expose an implicit default engine (`getDefaultAudioEngine()`) for ergonomics, or stay strictly explicit (`createAudioEngine` every time) per the no-top-level-state rule? Suggest explicit-only with an optional app-level helper.
- **Analyser placement.** Should `getAudioAnalyserSpectrum` mirror OpenFL `computeSpectrum`'s exact 512-bin/normalized-FFT output for parity, or expose the native bin count and leave OpenFL-shaped output to a thin compatibility helper?
- **Native parity of HRTF.** Web Audio's HRTF panner is browser-specific and not bit-reproducible; spatial conformance between TS and Rust may need to be restricted to the `equalpower`/distance-attenuation path, with HRTF declared an intentional divergence in the conformance map.
- **Worklet seam portability.** `registerAudioWorklet` is inherently host-shaped (AudioWorklet on web, a callback thread natively). Confirm whether custom DSP is in scope for Gold or deferred to a host concern.
