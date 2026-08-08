---
package: '@flighthq/media'
updated: 2026-08-08
by: principal
---

# media — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/media/src/` and `packages/types/src/` on
2026-08-08. The package is four source files: `audioChannel.ts`, `audioMixer.ts`, `videoChannel.ts`,
`enableAudioMixerGuards.ts`.

- **No mute, no per-channel pan, no loop region.** `AudioChannel`
  (`packages/types/src/AudioResource.ts:5-14`) carries only `currentTime`/`gain`/`length`/`loops`/
  `playbackRate`/`source`/`state`/`onComplete`; `VideoChannel` (`VideoResource.ts:6-15`) mirrors it.
  There is no `muted`, `pan`, `loopStart`, or `loopEnd` field and no `setAudioChannelMuted` /
  `setAudioChannelPan` / `setAudioChannelLoopStart` / `setAudioChannelLoopEnd` /
  `setVideoChannelMuted` function. `StereoPannerNode` appears only in the **mixer** bus graph
  (`audioMixer.ts:19-21`), never in the channel graph. This is table-stakes surface for the domain.
- **No channel teardown.** There is no `disposeAudioChannel` or `disposeVideoChannel`; the video
  `ended` listener and the channel runtimes have no detach path. `destroyAudioMixer`
  (`audioMixer.ts:64-79`) is the only teardown verb in the package.
- **`MediaChannelSignals` is typed and has no implementation.**
  `packages/types/src/MediaChannelSignals.ts` defines `MediaReadyState` and the
  `onBuffering`/`onError`/`onReady`/`onSeeked` group, and the only files in the repo referencing it
  are the `types` package's own barrels. No `enableAudioChannelSignals` /
  `enableVideoChannelSignals` / `get*ChannelSignals` exists, and no channel carries a `readyState`
  field.
- **`clamp` is duplicated three times** — `audioChannel.ts:137`, `audioMixer.ts:236`,
  `videoChannel.ts:119`. Deliberate (importing `@flighthq/geometry` for three lines is too heavy),
  recorded so it is not re-flagged as an accident.
- **No spatial audio** — no `PannerNode`, `AudioListener`, distance model, or cone parameters
  anywhere in the package. The headline Gold feature for the domain, and a new `spatialAudio.ts`
  plus types.
- **No metering** — no `AnalyserNode` in the graph, so no peak/RMS/frequency query at channel or bus
  level.
- **No streaming path** — no `MediaElementAudioSourceNode`; long-form music must be fully decoded
  into an `AudioBuffer` first.
- **No `crossfadeAudioChannels` and no `getAudioChannelBus`.** Both are natural mixer-side
  additions; neither exists.
- **No captions, text tracks, or picture-in-picture/fullscreen.** `TextTrack`,
  `requestPictureInPicture`, and `requestFullscreen` appear nowhere in the package.
- **No `AudioBackend` / `VideoBackend` seam.** Neither name exists in `@flighthq/types`, so there is
  no native-host or Rust-parity swap point. Stabilize the channel surface above before defining it.
- **Video-frame → `ImageSource` bridge is a cross-package design question.**
  `getVideoChannelImageSource` / `copyVideoChannelFrame` would touch `@flighthq/bitmap`,
  `@flighthq/scene2d`, and the renderer image-cache contracts. Do not proceed autonomously.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Biggest false claim dropped: the whole
  "Bronze (complete)" inventory. `AudioChannel.muted`/`pan`/`loopStart`/`loopEnd`,
  `VideoChannel.muted`, `disposeAudioChannel`/`disposeVideoChannel`, and the entire
  `enableAudioChannelSignals` family were listed as implemented and exist in **neither**
  `packages/media/src/` nor `packages/types/src/` — the gaps are now Open items above. Also dropped:
  "the correct long-term fix is `destroyAudioMixer` — deferred" and the unbounded
  `busToMixerRuntimes` growth it predicted; the function landed and the reverse map is pruned per
  bus at `audioMixer.ts:250-255`.
- **2026-07-30** — `resumeAllAudioMixerChannels` was restarting every paused channel, not the ones
  the mixer paused; fixed with a `channelsPausedByMixer` record on the runtime, cleared by unroute,
  stop-all, and destroy.
- **2026-06-25** — Recorded that `assessment.md` described a surface present only in
  `packages/media/dist/`, not `src/`; the assessment needs regenerating from live source.
- **2026-06-24** — Mixer pass: `AudioBus`/`AudioMixer` types, bus gain/pan/mute routed through real
  `GainNode`/`StereoPannerNode` graphs, the `busToMixerRuntimes` reverse lookup, and channel routing
  via `connectAudioChannelToNode`.
