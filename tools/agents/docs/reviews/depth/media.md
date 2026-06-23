# Depth Review: @flighthq/media

**Domain:** Audio and video playback channels — runtime sound/video playback control for a graphics/application SDK (the OpenFL `SoundChannel` / `Video` / NetStream feature target).

**Verdict:** partial — completeness 38/100

The package is a clean, correctly-built playback-channel layer, but it covers only the "play one buffer / one element with basic transport controls" slice. It is well short of the canonical surface a mature audio/video subsystem (OpenFL `Sound`/`SoundChannel`/`SoundTransform`/`SoundMixer`/`Video`/`NetStream`, the Web Audio graph, or any game-audio middleware) is expected to provide. It is more than a stub — it has real, working transport, gain, rate, looping, seek, and completion signaling — but it is missing whole categories (panning, mixer/buses, fades, spatialization, buffering/streaming state, mute, video sizing, frame extraction).

## Present capabilities

Audio (`audioChannel.ts`) over Web Audio `AudioBufferSourceNode` + `GainNode`:

- `playAudioResource(source, options?)` → `AudioChannel | null` (sentinel-null when no decoded buffer)
- `pauseAudioChannel` / `resumeAudioChannel` / `stopAudioChannel`
- `getAudioChannelCurrentTime` (live playhead, ms) / `setAudioChannelCurrentTime` (seek, clamped)
- `setAudioChannelGain` (linear volume) / `setAudioChannelPlaybackRate`
- Looping with finite or infinite loop counts (`loops`), `onComplete` signal, `state` machine (`stopped|playing|paused|complete`)
- `AudioPlayOptions` start overrides: `currentTime`, `gain`, `loops`, `playbackRate`
- Suspended-context auto-resume on start

Video (`videoChannel.ts`) over `HTMLVideoElement` — a 1:1 mirror of the audio API: `playVideoResource`, pause/resume/stop, currentTime get/set, gain (mapped to `element.volume`), playbackRate, looping, `onComplete`, state machine.

The audio/video API symmetry is exact and deliberate, runtime state is held off-entity in `WeakMap` runtimes (matching the entity/runtime convention), and the package is side-effect-free and tree-shakable. This is a solid spine.

## Gaps vs an authoritative media/audio library

Audio — missing canonical features:

- **Panning / stereo balance.** No `setAudioChannelPan` / `StereoPannerNode`. OpenFL `SoundTransform.pan`/`leftToRight` and every game-audio lib expose pan; it is the single most conspicuous omission alongside gain.
- **Mute / solo** distinct from gain (a mute that preserves the gain value).
- **Fades / ramps.** No fade-in/out or volume envelope (`gain.linearRampToValueAtTime`). Game audio and music playback universally need fades and crossfades.
- **A mixer / bus layer.** No `SoundMixer`-equivalent: no master gain, no named buses/groups, no `stopAllAudioChannels`, no global mute/volume. There is no way to enumerate or control active channels collectively.
- **3D / spatial audio.** No positional audio (`PannerNode`), distance attenuation, or listener — expected in any "graphics SDK" audio domain.
- **Loop points / sub-region playback.** `start(offset)` is used but no in/out points or loop-region (`loopStart`/`loopEnd`), and no playing a sub-clip.
- **Streaming / progressive playback and buffering state.** Audio is buffer-only; there is no streamed-audio path and no buffering/ready/error reporting. Decode/load lives in `@flighthq/resources`, but the channel exposes no load or error state.
- **Effects/processing graph.** No insert effects, EQ, filters, analyser/peak metering, or arbitrary node insertion — even an escape hatch to the underlying `AudioNode` is not exposed.
- **`destroy*` / channel disposal.** No explicit teardown verb; `stop` leaves the channel and its `onComplete` signal in place. No documented release of the source node / signal listeners.
- **Position/duration in seconds vs ms** is fine, but there is no `getAudioChannelDuration` convenience, no `isAudioChannelPlaying` boolean helper, and no `seek-relative`.

Video — missing canonical features (beyond the audio gaps above, which apply equally):

- **Muted flag** (`element.muted`) separate from volume.
- **Display integration / sizing.** No video-frame size, aspect, `videoWidth`/`videoHeight`, poster, or fit/crop. The `Video` _display object_ lives in `@flighthq/text`/`displayobject`, but media exposes no bridge (e.g. current frame as an `ImageSource` for the renderer).
- **Readiness / buffering events.** No `canplay`/`waiting`/`stalled`/`error` surfacing; `loops` and `ended` are wired, but the rich media event set is absent.
- **Captions / tracks / multiple audio tracks**, fullscreen, picture-in-picture — reasonable to defer, but unmentioned.

API hygiene gaps:

- Both files define a private `clamp` — duplicated rather than drawn from `@flighthq/geometry`/a shared util.
- `setVideoChannelGain` does not clamp to 0–1 (unlike `setAudioChannelCurrentTime`), and `element.volume` will throw outside that range — an inconsistency between the two channel implementations.

## Naming / API-shape notes

- Naming follows the project rules well: full unabbreviated type words (`setAudioChannelPlaybackRate`, not `setRate`), `get*`/`set*` accessor prefixes, sentinel-`null` returns on expected failure (no decoded buffer / no element), `Readonly<>` options.
- "Channel" is the right canonical noun (matches OpenFL `SoundChannel`). The audio↔video symmetry is a genuine strength and should be preserved as the API grows.
- `setAudio*`/`setVideo*` returning the clamped/applied value is a nice touch.
- `gain` (not `volume`) is consistent with Web Audio vocabulary; acceptable, though it should be documented since `VideoChannel.gain` maps to `element.volume`.
- The absence of a `dispose*`/`destroy*` verb is a real gap given the project's explicit teardown-verb discipline — a played channel holds a signal and (for video) an event listener.

## Recommendation

Treat this as a foundation that needs a clear second build-out pass to reach AAA. Highest-value additions, roughly in order:

1. **Panning** (`setAudioChannelPan` over `StereoPannerNode`; video balance where supported) — the most glaring missing transport control.
2. **A mixer/bus layer** — master gain, named groups, `stopAllAudioChannels`, global mute/volume, active-channel enumeration. This is the difference between "play a clip" and "an audio subsystem."
3. **Fades / volume ramps** (`fadeAudioChannelGain`) and **mute** distinct from gain.
4. **Teardown verb** — `disposeAudioChannel`/`disposeVideoChannel` to detach the `onComplete` signal and (video) the `ended` listener, per project convention.
5. **Buffering/error/readiness state** and a **video-frame-to-`ImageSource`** bridge for renderer compositing.
6. Spatial/3D audio can be deferred but should be acknowledged as in-scope for the domain.
7. Fix the local inconsistencies: shared `clamp`, clamp video gain to 0–1.

As-is it is a competent playback-channel module, but on its own it would not stand as an authoritative media library; it is a partial implementation of the domain.
