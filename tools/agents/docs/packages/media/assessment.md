---
package: '@flighthq/media'
updated: 2026-06-24
basedOn: ./review.md
---

# media — Assessment

Sorted from `review.md` (which already absorbed the prior depth roadmap — the standalone `reviews/maturation/depth/media.md` is spent and absent in this tree). The package is `partial` (64/100): a competent stereo playback-and-mixing layer with real correctness holes in the new mixer and a large unbuilt Gold surface (spatial audio, metering, streaming, backend seam).

The dominant finding — _is the mixer in scope and how deep_ — is an open **design** question, and nearly every concrete fix the review names hangs off it (the pause/stop-must-silence bug, the `destroyAudioMixer` bracket). Those are mechanical _once the mixer is blessed_, but until then they are not sweep-safe, so `Recommended` is deliberately small. The mixer-scope decision and the rest of the Gold/cross-package surface are routed to the charter's Open directions (see end), not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/media`, no cross-package coupling, no breaking change, no open design decision.

- **Document the `getAudioChannelInputNode` transient-node lifetime contract.** It returns `runtime.sourceNode`, which is re-created on every `startAudioChannel` (play, seek, loop iteration), so an effect connected to the _input_ is silently dropped on the next loop/seek while the _output_ gain node is stable. Add an ownership/aliasing comment on the function spelling out that the input node is transient (and that the output node is the stable effect-insert point). A comment is within-package and decides nothing — the API itself is unchanged. (review.md "Contract & docs fit".)

## Backlog

Parked: each waits on an Open direction, crosses a package boundary, or is larger scope. Reason given per item.

**Gated on Open direction #1 (mixer scope / depth) — do not sweep:**

- **Make collective pause/stop actually silence the bus.** `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels` only flip `channel.state` and never stop/restart the underlying `AudioBufferSourceNode`; `stopAllAudioMixerChannels` sets `state='stopped'` and zeroes `currentTime` but never calls `stopActiveNode`. The channels keep emitting sound. The fix is within-package (it reuses `audioChannel.ts`'s node-stop path) but is _contingent on the mixer being blessed as a real, owned primitive_ — if mixing moves to a neighbor the fix lands elsewhere. Must-fix the moment #1 is settled in `media`'s favor. (review.md "Gaps" — correctness holes.)
- **Add `destroyAudioMixer` — the missing `destroy*` bracket for `createAudioMixer`.** `busToMixerRuntimes` is an unbounded strong-ref `Map` that every mixer+bus accumulates with no release; given the `destroy*` teardown discipline this is the natural fix. Within-package, but only meaningful if the mixer is blessed (#1). (review.md "Gaps".)

**Gated on Open direction #6 (audio signal semantics):**

- **Fire the audio `MediaChannelSignals` from internal events / carry `readyState`.** The audio signal group is created by `enableAudioChannelSignals` but never emitted by any internal event — empty hooks, asymmetric with the wired video signals. Whether the channel itself emits `onReady`/`onError`/`onBuffering` and carries `readyState: MediaReadyState` (the type exists) is a contract decision (#6), not a sweep. (review.md "Gaps", open direction #6.)

**Gated on Open direction #7 (scalar-math policy):**

- **Draw `clamp`/`saturate` from `@flighthq/math` instead of triplicating `clamp`.** The "shared `clamp` is too heavy" justification is stale now that `@flighthq/math` exists (pure, tree-shakable, zero extra bundle). The local swap is small, but blessing `@flighthq/math` as the shared home for these helpers across leaf packages is an SDK-wide policy (#7); parked so the swap lands under one ruling, not piecemeal. (review.md "Contract & docs fit", open direction #7.)

**Gated on Open direction #2 (spatial-audio scope):**

- **3D / spatial audio** — `PannerNode`, `AudioListener`, distance model, cone. The headline Gold feature; a large surface whose home (`media` vs a `spatial-audio` neighbor) is undecided (#2). Not sweep-safe. (review.md "Gaps".)

**Larger Gold surface, no design fork but beyond a sweep (revisit per #1 once mixer scope is set):**

- **Analyser / metering** — `AnalyserNode`, peak/RMS, frequency data at channel and bus level. Absent; a substantial new surface, not a quick fix. (review.md "Gaps".)
- **Streaming / progressive audio** — `MediaElementAudioSourceNode` path for long-form music; buffer-only today. Substantial. (review.md "Gaps".)
- **`crossfadeAudioChannels`** — named in the roadmap, belongs in `audioMixer.ts`; gated with the rest of the mixer (#1). (review.md "Gaps".)
- **Captions / text tracks / multiple audio tracks, fullscreen / picture-in-picture** — absent video surface; each a discrete build, not a sweep. (review.md "Gaps".)

**Cross-package — needs a design decision, do not act autonomously:**

- **Video-frame → `ImageSource` bridge** (`getVideoChannelImageSource` / `copyVideoChannelFrame`) for renderer compositing. Spans surface/displayobject/render-cache. Open direction #5. (review.md "Gaps", open direction #5.)
- **Backend seam (`AudioBackend`/`VideoBackend` in `@flighthq/types`).** The package is hard-wired to Web Audio + `HTMLVideoElement`; the Rust `flighthq-media` crate already has a `set_audio_backend`/`set_video_backend` seam, so the TS package trails it. When to stabilize the seam is a cross-package/conformance timing decision (Open direction #3). (review.md "Gaps" + "Contract & docs fit" Rust-conformance drift.)
- **`@flighthq/media-formats` neighbor** (duration/metadata probing, ID3/cue, caption parsing) — the triad `-formats` cell. Apply the **plurality guard** (only with ≥2 formats) before creating it; this is a new-package proposal, not in-package work, and routes to the register's candidate track. (review.md open direction #4, structural-forks "subject triad" / plurality guard.)

## Approved

_None. Approval is the user's verbal gate._

---

### Routed to the charter's Open directions (for an explicit conversation — charter not edited here)

The review surfaced these silences against the stub charter. They are the design forks the `Backlog` items hang off; settle them before sweeping the gated work:

1. **Mixer/bus layer scope and depth** — does `media` own a real mixer (then the pause/stop-silences bug is a must-fix and `destroyAudioMixer` is mandatory), or does mixing belong to a neighbor? The package's biggest open shape question.
2. **Spatial/3D audio home** — in `media`, or a `spatial-audio` neighbor?
3. **Backend-seam timing** — when to stabilize `AudioBackend`/`VideoBackend` in `@flighthq/types` so TS↔Rust share one seam (Rust crate already has it).
4. **`@flighthq/media-formats` neighbor** — apply the plurality guard before creating it (register candidate track).
5. **Video-frame → `ImageSource` bridge** — cross-package (surface/displayobject/render-cache).
6. **Audio `MediaChannelSignals` semantics** — emit-and-carry-`readyState` vs caller-populated hooks; settle so audio and video signals are symmetric.
7. **`clamp`/scalar-math policy** — bless `@flighthq/math` as the shared home for these helpers across leaf packages.
