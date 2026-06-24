---
package: '@flighthq/media'
crate: flighthq-media
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# media — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/media` is the SDK's runtime **playback layer** — audio and video _channels_ plus an audio _mixer/bus_ graph. It owns the act of _playing_ a decoded resource and controlling that playback in flight: transport (play/pause/resume/stop/seek/rate), gain/pan/mute, loop regions, fades, channel lifecycle, and an opt-in signal group. It is the OpenFL `SoundChannel` / `SoundTransform` / `SoundMixer` / `Video` / NetStream feature target, redesigned around Flight's free-function + off-entity-runtime rules (state lives in `WeakMap`s; channels and buses are plain entities).

Today it is a competent **stereo playback-and-mixing** layer over Web Audio (`AudioBufferSourceNode` → optional `StereoPannerNode` → `GainNode`) and `HTMLVideoElement`. It depends only on `resources` / `signals` / `types`.

Where it ends vs. a neighbor: `media` does **not** decode or probe files — it plays an already-decoded `AudioResource` / `VideoResource` that `resources` (and a future `audio-formats` / `media-formats` codec layer) produces. It does **not** rasterize video frames for the scene graph — a video-frame → `ImageSource` bridge is a cross-package concern (surface / displayobject / render-cache), not owned here. Native playback backends (a `*Backend` seam) are a deliberate open question, not yet drawn.

## North star (proposed)

_Proposed principles inferred from the design and the SDK-wide forks — not yet blessed. Edit freely._

1. **A control primitive must actually control.** A transport verb's _audible_ effect and its _reported state_ are one thing, never two. `pause` silences; `stop` stops; `mute` mutes — at the real Web Audio source, not just on a `state` field. This is the load-bearing correctness rule for a playback package, and it applies equally to per-channel and collective (mixer/bus) operations.
2. **Audio and video stay symmetric.** The two transports mirror each other in name, shape, and behavior (including signal semantics), so a caller who learned one knows the other. Asymmetry is a bug to close, not a domain difference to accept.
3. **Plain entities, off-entity runtime, explicit allocation.** Channels, buses, and the mixer are data; their Web Audio nodes and listeners live in runtime `WeakMap`s. Every `create*` that owns a non-GC graph (a mixer's nodes, a bus's nodes, tracked DOM listeners) has its paired teardown verb — `destroy*` to free nodes now, `dispose*` to detach-and-release-to-GC — and the bracket is never left dangling (no unbounded strong-ref maps).
4. **Playback only; decode and compositing belong to neighbors.** `media` plays decoded resources and exposes effect-insert points (`get*InputNode` / `get*OutputNode`); it does not parse containers, probe metadata, or push frames into the renderer. Those seams stay outside the package boundary.
5. **One swappable backend per medium (when drawn).** The web implementation is _a_ backend, not _the_ implementation. Public functions are framed so a native host can fill an `AudioBackend` / `VideoBackend` seam without reshaping the API — the same backend-seam discipline the host suite and the Rust port already use.

## Boundaries (proposed)

_Proposed scope lines — confirm or redraw in review._

**In scope**

- Audio channel transport, gain/pan/mute, loop regions, fades, playback rate, lifecycle, introspection.
- Video channel: the near-symmetric transport mirror plus dimensions, `muted`, and DOM-wired signals.
- An explicit (non-ambient) audio mixer + bus graph: routing channels onto buses, per-bus and master gain/mute/pan/fade, and collective transport over a mixer's channels.
- The opt-in `MediaChannelSignals` group (`enable*Signals` / `get*Signals`), per the signal-group convention.

**Non-goals (as currently understood — several are open questions below, not settled non-goals)**

- Decoding / container parsing / metadata probing — a `resources` + future `-formats` triad concern.
- Video-frame → `ImageSource` / renderer compositing — cross-package, owned elsewhere.
- Being the home for shared scalar math (`clamp`) — that is `@flighthq/math`'s job.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. These are for the user to settle — an agent asks here rather than assuming._

1. **Is a mixer/bus layer in scope, and how deep?** It exists but is shallow in load-bearing places: `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels` / `stopAllAudioMixerChannels` only flip `channel.state` and never stop/restart the underlying `AudioBufferSourceNode`, so a "paused"/"stopped" mixer keeps emitting sound. If `media` owns a real mixer, those become must-fix correctness bugs and a `destroyAudioMixer` (the missing bracket for `createAudioMixer`, releasing the unbounded strong-ref `busToMixerRuntimes` map) is mandatory. If mixing belongs to a future neighbor, that changes the package's shape. **Biggest open shape question.** (Touches North star #1, #3.)

2. **Spatial / 3D audio — in `media`, or a `spatial-audio` neighbor?** No `PannerNode`, `AudioListener`, distance model, or cone today. It is the headline Gold feature for a graphics-SDK audio domain and a natural fit, but it is a large surface — confirm scope before building it. (Fork A: source-data vs. graph participation — spatial audio couples a channel to a scene-graph position.)

3. **Backend-seam timing (fork D).** The Rust `flighthq-media` crate already has `set_audio_backend` / `set_video_backend`; the TS package has no `AudioBackend` / `VideoBackend` in `@flighthq/types` and is hard-wired to Web Audio + `HTMLVideoElement`. Decide _when_ to stabilize the TS seam (the status doc wants the Silver API frozen first) so TS↔Rust conformance shares one seam. This is the runtime-backend axis of fork D, not the wasm-mixing axis. (Touches North star #5.)

4. **`@flighthq/media-formats` neighbor? (subject triad / fork B + plurality guard).** Duration/metadata probing, ID3 / cue points, caption parsing — the triad `-formats` cell. Apply the plurality guard (≥2 formats) before creating it; the status doc already flags "raise with user." Does `media` even own this, or does it sit under an `audio` / `video` data-primitive split?

5. **Video-frame → `ImageSource` bridge.** A `getVideoChannelImageSource` / `copyVideoChannelFrame` for renderer compositing is cross-package (surface / displayobject / render-cache) and needs a design decision — not autonomous work. Is it in `media`'s scope at all, or purely a neighbor's?

6. **Audio `MediaChannelSignals` semantics — the audio/video asymmetry.** Video wires DOM events to its signals (`waiting`→`onBuffering`, `canplay`→`onReady`, …); audio creates the same group but **never fires it** — they are empty hooks the caller must populate, and `MediaReadyState` is defined in types but never carried on a channel. Should the audio channel itself emit `onReady`/`onError`/`onBuffering` and carry a `readyState`, restoring symmetry (North star #2), or remain caller-populated by design?

7. **Streaming / progressive audio.** Buffer-only today; no `MediaElementAudioSourceNode` path for long-form music. In scope for `media`, and does it interact with the streaming half of question 6?

8. **Analyser / metering.** No `AnalyserNode`, peak/RMS, or frequency data at channel or bus level. A standard middleware feature — in scope, and at which level (channel, bus, master)?

9. **`crossfadeAudioChannels`.** Named in the roadmap, belongs in `audioMixer.ts`, not implemented. Confirm it lands here once the mixer's scope (question 1) is settled.

10. **`get*InputNode` lifetime contract.** `getAudioChannelInputNode` returns the _transient_ `sourceNode`, re-created on every play/seek/loop iteration, so an effect inserted there is silently dropped on the next loop. The output gain node is stable; the input source is not. Document the surprising lifetime, or provide a stable input bus.

11. **`clamp` / scalar-math policy (fork: shared leaf helpers).** The triplicated `clamp` across the three source files should draw from `@flighthq/math` (pure, allocation-free, tree-shakable — one function tree-shakes to exactly that function), retiring the stale "geometry is too heavy" justification. A within-package contract-fit fix once `@flighthq/math` is blessed as the shared home.
