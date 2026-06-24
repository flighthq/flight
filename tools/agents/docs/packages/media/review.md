---
package: '@flighthq/media'
status: partial
score: 64
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/media.md
  - source
---

# media — Review

## Verdict

`partial` — **64/100**. The builder pass landed a genuine second build-out: panning, mute, loop points, fades, a mixer/bus layer, channel disposal, and an opt-in media-signal group all now exist and are exercised by a colocated test per exported function. That closes most of the headline transport-control gaps the prior depth review (38/100) named. But the new mixer is shallow in two load-bearing places — bus mute/pause do not actually gate audio at the source — and the package still has no spatial audio, no metering, no streaming, no video-frame bridge, and no backend seam. It is now a competent stereo playback-and-mixing layer, not yet an authoritative media subsystem. The status doc is **accurate**: every API it claims is present in the diff, and its self-flagged limitations are real. The estimated 82/100 in the status doc over-weights surface breadth against the correctness holes and the large remaining Gold surface.

## Present capabilities

Verified against `67dc46d64:packages/media/src/` — 55 exported functions, each with a colocated `describe`, across three files plus a thin barrel (`index.ts`).

**Audio channel** (`audioChannel.ts`, 23 exports) over Web Audio `AudioBufferSourceNode` → optional `StereoPannerNode` → `GainNode` → `runtime.destinationNode`:

- Transport: `playAudioResource` (sentinel-`null` when `source.buffer === null`), `pauseAudioChannel`, `resumeAudioChannel`, `stopAudioChannel`, current-time get/set (ms, clamped), `setAudioChannelPlaybackRate`.
- Gain/pan/mute: `setAudioChannelGain`, `setAudioChannelPan` (clamped `[-1,1]`, wired to the panner node), `setAudioChannelMuted` (zeroes the gain node while preserving stored `gain`), `getAudioChannelPan`, `isAudioChannelMuted` helpers.
- Loop region: `setAudioChannelLoopStart`/`setAudioChannelLoopEnd` (clamped, live-wired to `sourceNode.loopStart/End`), finite/infinite `loops` with `onComplete`.
- Fades: `fadeAudioChannelGain` via `linearRampToValueAtTime`, with a data-only fallback when no gain node exists yet.
- Lifecycle/introspection: `disposeAudioChannel` (stops node, disconnects `onComplete` + the media signals, drops the WeakMap entry), `enableAudioChannelSignals` (idempotent `MediaChannelSignals` group), `getAudioChannelSignals`, `getAudioChannelInputNode`/`getAudioChannelOutputNode` (effect insert points), `getAudioChannelCurrentTime`/`getAudioChannelDuration`, `isAudioChannelPlaying`.
- Bus wiring: `connectAudioChannelToNode` reroutes the gain node to a new destination without re-creating the source — the mechanism the mixer uses to move a playing channel onto a bus.

**Audio mixer** (`audioMixer.ts`, 15 exports): explicit `createAudioMixer` (real master `GainNode` → `context.destination`, no ambient global), `createAudioBus` (plain data), `addAudioBusToMixer` (bus `GainNode` + optional `StereoPannerNode` into the master), `routeAudioChannelToMixerBus` / `unrouteAudioChannelFromMixerBus`, `setAudioBusGain`/`Muted`/`Pan` (reverse-map lookup so the bus is mutated without passing the mixer), `fadeAudioBusGain`, master gain/mute, `getAudioMixerActiveChannels`, and collective `stopAllAudioMixerChannels` / `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels`.

**Video channel** (`videoChannel.ts`, 17 exports) over `HTMLVideoElement` — a near-symmetric mirror of the audio transport API, plus `getVideoChannelWidth`/`Height` (from `videoWidth`/`videoHeight`), `setVideoChannelMuted` (`element.muted`), and `enableVideoChannelSignals` which — unlike audio — actually wires DOM events to the signal group (`waiting`→`onBuffering`, `canplay`→`onReady`, `error`→`onError`, `seeked`→`onSeeked`), with listeners tracked in the runtime and removed on `disposeVideoChannel`.

**Types** (verified added in the diff): `AudioBus.ts` (`AudioBus`/`AudioMixer` + options), `MediaChannelSignals.ts` (`MediaReadyState` + `MediaChannelSignals`), and new fields on `AudioResource.ts`/`VideoResource.ts` (`muted`, `pan`, `loopStart`, `loopEnd`, and the matching `*PlayOptions`). Types-first discipline is honored — all cross-package shapes live in `@flighthq/types`.

The package is `sideEffects: false`, single-root-export, depends only on `resources`/`signals`/`types`, and holds all runtime state off-entity in `WeakMap`s. The audio↔video symmetry remains a genuine strength.

## Gaps

Correctness holes in the new mixer (the most important findings — these are functional bugs, not just missing features):

- **Bus and master state are not honored by `routeAudioChannelToMixerBus`'s wiring path for collective pause.** `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels` only flip `channel.state` and never stop or restart the underlying `AudioBufferSourceNode` — so a "paused" mixer keeps playing audibly while reporting `state==='paused'`. The status doc admits this ("state update only; does not stop the Web Audio source node"), but for an audio _mixer_ a pause that does not silence the bus is a broken primitive, not a deferral. Contrast the per-channel `pauseAudioChannel`, which correctly stops the node.
- **`stopAllAudioMixerChannels` sets `channel.state='stopped'` and zeroes `currentTime` but never calls `stopActiveNode`** (it cannot — that lives in `audioChannel.ts` and is not invoked). The channels keep emitting sound. Same class of bug as the pause case.
- **`busToMixerRuntimes` is an unbounded strong-ref `Map`.** Every `createAudioMixer` + `addAudioBusToMixer` accumulates entries with no `destroyAudioMixer` to release them — a leak the status doc flags. Given the `destroy*` teardown-verb discipline, a real `destroyAudioMixer` is the missing bracket for `createAudioMixer`.

Missing canonical surface (Gold, per the domain target — OpenFL `SoundTransform`/`SoundMixer` + Web Audio + game-audio middleware):

- **3D / spatial audio** — no `PannerNode`, `AudioListener`, distance model, or cone. The headline Gold feature for a graphics-SDK audio domain; entirely absent.
- **Analyser / metering** — no `AnalyserNode`, peak/RMS, or frequency data, at channel or bus level.
- **Streaming / progressive audio** — buffer-only; no `MediaElementAudioSourceNode` path for long-form music, and `MediaReadyState` is defined in types but never carried on a channel or emitted. The audio `MediaChannelSignals` are created but **never fired by any internal event** — they are empty hooks the caller must populate, an asymmetry with the wired video signals.
- **`crossfadeAudioChannels`** — named in the roadmap, belongs in `audioMixer.ts`, not implemented.
- **Video-frame → `ImageSource` bridge** — no `getVideoChannelImageSource`/`copyVideoChannelFrame` for renderer compositing (correctly flagged as cross-package; do not act autonomously).
- **Captions / text tracks / multiple audio tracks**, **fullscreen / picture-in-picture** — absent.
- **Backend seam** — no `AudioBackend`/`VideoBackend` in `@flighthq/types`. The package is hard-wired to Web Audio + `HTMLVideoElement`; a native host has no seam to fill. (The Rust `flighthq-media` crate already has a `set_audio_backend`/`set_video_backend` seam — see contradiction below.)

## Charter contradictions

The charter is a stub: `What it is` is seeded, and `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO`. There is therefore **no stated principle, boundary, or decision for the code to contradict** — this section is empty by construction. Every judgement above falls back to the codebase-map AAA standard, and the silences are collected as candidate open directions below.

## Contract & docs fit

Lives up to the contract well on shape, with a few drifts:

- **Types-first, single root export, `sideEffects: false`, minimal deps, off-entity runtime state, sentinel-`null` returns, `get*`/`is*`/`set*`/`enable*`/`dispose*` verb discipline** — all honored. `enableAudioChannelSignals`/`enableVideoChannelSignals` correctly follow the opt-in signal-group convention, and `disposeAudioChannel` is the right verb (detach-and-release-to-GC, no GPU/native resource).
- **Stale "shared `clamp` is too heavy" justification.** The status doc keeps `clamp` duplicated across all three source files, justified by "would need `@flighthq/geometry`… too heavy." That justification is now wrong: the head codebase map adds **`@flighthq/math`**, a pure, allocation-free, tree-shakable scalar package that exports `clamp` (and `saturate`). Importing one function from it tree-shakes to exactly that function — zero extra bundle. The triplicated helper should draw from `@flighthq/math`. (Candidate contract-fit fix, not a design decision.)
- **`getAudioChannelInputNode` exposes a transient node.** It returns `runtime.sourceNode`, which is re-created on every `startAudioChannel` (play, seek, loop iteration). An "insert effect" connected to it is silently dropped on the next loop/seek. The output gain node is stable; the input source is not. The escape hatch is real but its lifetime contract is undocumented and surprising — a comment (or a stable input bus) is warranted.
- **Rust conformance drift.** `flighthq-media` exists but is a generation behind: its `lib.rs` exports only basic play/pause/resume/stop/seek/gain/rate (+ a `set_audio_backend`/`set_video_backend` seam). It has **no** pan, mute, loop points, fade, mixer, bus, or signal-group surface. The TS package is now the authoritative spec and the crate trails it substantially — expected (the status doc defers Rust behind a stable backend seam), but worth recording as a known divergence.
- **Package Map line is thin but accurate.** `@flighthq/media: audio and video playback channels` still fits; no revision needed, though "playback channels + mixer" would now be more precise.

## Candidate open directions

The charter is silent on everything below; each is a question for the user to settle, not an assumption to bake in:

1. **Is a mixer/bus layer in scope, and how deep?** It now exists, but collective pause/stop are non-functional. Decide whether `media` owns a real mixer (then the pause/stop-silences-the-node bug is a must-fix and `destroyAudioMixer` is mandatory) or whether mixing belongs to a future neighbor. This is the package's biggest open shape question.
2. **Spatial/3D audio — in `media`, or a `spatial-audio` neighbor?** It is the headline Gold feature and a natural fit for a graphics SDK; confirm scope before building the large `PannerNode` surface.
3. **Backend seam timing.** The Rust crate already has one; the TS package does not. Decide when to stabilize `AudioBackend`/`VideoBackend` in `@flighthq/types` (the status doc wants the Silver API frozen first) so TS↔Rust conformance has a shared seam.
4. **`@flighthq/media-formats` neighbor** (duration/metadata probing, ID3/cue, caption parsing) — the triad `-formats` cell. Apply the plurality guard before creating it (status doc already flags "raise with user").
5. **Video-frame → `ImageSource` bridge** — cross-package (surface/displayobject/render-cache); needs a design decision, not autonomous work.
6. **Audio `MediaChannelSignals` semantics** — should the channel itself emit `onReady`/`onError`/ `onBuffering` and carry a `readyState: MediaReadyState`, or remain caller-populated hooks? The type exists; the wiring does not. Settle the contract so audio and video signals are symmetric.
7. **`clamp`/scalar-math policy** — bless `@flighthq/math` as the shared home for these helpers across leaf packages (resolves the triplication here and similar duplication elsewhere).
