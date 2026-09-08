---
package: '@flighthq/media'
updated: 2026-09-08
basedOn: ./review.md
---

# media — Assessment

Refreshed 2026-09-08 from the 2026-09-02 review and live source. Review scored 45/100 with `stopAllAudioMixerChannels` bug, missing channel-level APIs, and `clamp` triplication as primary findings. The bug and most channel-level gaps are now resolved. 7 source files (up from 6), 6 test files (up from 4), ~140 test cases (up from 65). Score revised to 62/100 — the remaining gaps are `clamp` triplication and Gold-tier domain surface.

## Directed

_None._

## Recommended

- **Extract duplicated `clamp` helper.** Repeated at `audioChannel.ts:244`, `audioMixer.ts:246`, `videoChannel.ts:159`. Should be a shared internal utility or imported from `@flighthq/math`.

## Depth gaps

1. **No video backend seam.** No `VideoDeviceBackend` type or registration exists. Video playback has no explicit dependency model equivalent to the audio device backend.
2. **Spatial audio absent.** No `PannerNode` integration, no 3D positioning.
3. **Analyser/metering absent.** No `AnalyserNode` wrapper, no peak/RMS/waveform extraction.
4. **Streaming source absent.** No `MediaElementAudioSourceNode` carrier — long tracks must fully decode.
5. **Crossfade absent.** No crossfade primitive or transition helpers.
6. **Caption/subtitle absent.** No `TextTrack` integration.

## Backlog

- **AudioContext ownership design.** Parked — Open direction #2.
- **Media existence question.** Parked — Open direction #1. Blocks all major design work.

## Landed

1. ~~**Fix `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels`.**~~ Landed.
2. ~~**Add `destroyAudioMixer`.**~~ Landed.
3. ~~**Bound `busToMixerRuntimes`.**~~ Landed.
4. ~~**Package Map description update.**~~ Landed.
5. ~~**`stopAllAudioMixerChannels` bug.**~~ Landed 2026-09-08. Now delegates to `stopAudioChannel(channel)` for each active channel.
6. ~~**Channel mute (`setAudioChannelMuted`/`isAudioChannelMuted`/`setVideoChannelMuted`).**~~ Landed.
7. ~~**Channel pan (`setAudioChannelPan`).**~~ Landed.
8. ~~**Loop region (`setAudioChannelLoopRegion`).**~~ Landed.
9. ~~**Channel signals (`enableAudioChannelSignals`/`enableVideoChannelSignals`/`getAudioChannelSignals`/`getVideoChannelSignals`).**~~ Landed.
10. ~~**Channel disposal (`destroyAudioChannel`/`destroyVideoChannel`).**~~ Landed.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: fix pause/resume, add destroyAudioMixer, bound runtime map, Package Map description
