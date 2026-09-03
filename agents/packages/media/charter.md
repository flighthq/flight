---
package: '@flighthq/media'
role: package
crate: flighthq-media
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# media — Charter

## What it is

`@flighthq/media` is the **runtime playback layer** — audio channels (play/pause/resume/stop/fade/gain/rate over Web Audio), audio mixer with bus graph (master gain, per-bus gain/pan/mute, routing), and video channels (play/pause/resume/stop/gain/rate over HTMLVideoElement). 41 exports across 3 source files, 53 tests. Dependencies: `audio`, `video`, `signals`, `types`.

**Existence question:** With `@flighthq/audio` owning AudioResource lifecycle and `@flighthq/video` owning VideoResource lifecycle, media's claim to exist rests on cross-cutting playback orchestration — the mixer/bus graph, AudioContext lifecycle, coordinating audio+video, and future media session integration. If audio playback naturally belongs in audio and video playback in video, media may dissolve. This is the central open direction.

## North star

1. **Cross-cutting playback orchestration — if it exists.** Media's reason to live is the coordination that doesn't belong in audio or video alone: the mixer/bus graph, AudioContext management, synchronized A/V, media session API. If these decompose cleanly into per-resource packages, media dissolves.
2. **Correctness over features.** The existing surface has correctness holes (pause/resume don't actually stop AudioBufferSourceNode, no mixer disposal, unbounded runtime map). Fix these before expanding.
3. **Honest about lost work.** ~14 functions from a prior builder session exist only in stale `dist/`. Where the lost work goes depends on whether media survives as a package.

## Boundaries

**In scope (current):**

- Audio channel playback (play/pause/resume/stop/fade/gain/rate).
- Audio mixer: bus graph, master gain, per-bus gain/pan/mute, routing.
- Video channel playback (play/pause/resume/stop/gain/rate).

**Non-goals:**

- Audio/video resource creation/loading — `@flighthq/audio`, `@flighthq/video`.
- Rendering video frames to textures — renderer concern.

## Decisions

- **[2026-07-02] Fix correctness holes immediately.** `pauseAllAudioMixerChannels`/`resumeAllAudioMixerChannels` only flip state without stopping `AudioBufferSourceNode`. No `destroyAudioMixer` exists. `busToMixerRuntimes` is unbounded. These are bugs.

  **Why:** Honest features only. A pause that doesn't actually pause is a defect.

- **[2026-07-02] Lost work must be rebuilt — destination depends on media's survival.** ~14 functions (panning, muting, loop points, disposal, signals) exist only in stale `dist/`. If media survives, rebuild here. If media dissolves, rebuild in audio/video respectively.

  **Why:** The functions are needed regardless of package home. The design question is where they go.

- **[2026-07-02] AudioContext ownership is an open question.** With `getAudioContext()` leaving audio (audio charter Decision #1), something must own the AudioContext. The Flight way leans toward explicit: a convenience creator in whichever package owns playback, passed explicitly to every function that needs it. No hidden singleton anywhere.

  **Why:** AudioContext has significant lifecycle implications (browser autoplay policy, suspend/resume, hardware allocation). Explicit ownership is clearer than a hidden singleton.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

- **2026-09-02 — Channel mute is a separate axis from gain.** `AudioChannel.muted` and `VideoChannel.muted` silence output without disturbing `gain`, so unmuting restores the level the caller set and a gain change made while muted takes effect on unmute. Mute is not a pause: a muted channel keeps playing and keeps advancing its time.
- **2026-09-02 — A loop region bounds each pass; `loops` still counts them.** `loopStart`/`loopEnd` (milliseconds, `loopEnd` of 0 meaning no region) cut each playback pass via a `duration` on `AudioDeviceBackend.startSource`. The node's own `loop` flag is deliberately NOT used: it never ends, and this package counts loops by restarting on `ended`, so the flag would turn every counted loop into an endless one.
- **2026-09-02 — `MediaChannelSignals` is opt-in per channel and split by producibility.** The playback-lifecycle half — complete, loop, pause, play, stop — is produced by the channel's own state machine through `enableAudioChannelSignals`/`enableVideoChannelSignals`. The readiness half — buffering, error, ready, seeked — remains declared and unproduced, because it describes transport state only a backend or DOM element can report and the audio side has no such seam.

- **[2026-09-02] Closure state of the review's gap list, after the Silver-tier channel controls landed.**

  - *`stopAllAudioMixerChannels` does not stop the underlying audio sources* — **CLOSED.** It delegates to `stopAudioChannel`, matching `pauseAllAudioMixerChannels` and `destroyAudioMixer`.
  - *No channel mute* — **CLOSED** for both audio and video.
  - *No audio loop region* — **CLOSED.**
  - *No `MediaChannelSignals` implementation* — **PARTIALLY CLOSED.** Five lifecycle signals are produced; the four readiness signals await a backend/DOM seam and are the remaining work.
  - The prior *fix correctness holes immediately* decision is now fully satisfied; the last named hole, `stopAllAudioMixerChannels`, is fixed.

## Open directions

1. **Should media exist?** If audio playback → audio, video playback → video, and mixer → audio-mixer, media dissolves. If there's a genuine cross-cutting coordination layer (AudioContext lifecycle, synchronized A/V, media session API), media has a reason to live. This is the central question and blocks where the lost work goes.

2. **AudioContext home.** Options: (a) application — it's the lifecycle owner, (b) media if it survives, (c) the caller explicitly — matches Flight's "explicit allocation" principle. Could be a `createAudioContext()` convenience in the playback-owning package, passed explicitly.

3. **Expansion scope.** Draft charter lists: spatial audio, analyser/metering, streaming, crossfade, video-frame bridge, captions, backend seam. These are all important capabilities but "media" may not be the correct home for all of them. Spatial audio might be its own package. Analyser could be a sink. Video-frame bridge is a renderer concern.

4. **Package Map update.**
