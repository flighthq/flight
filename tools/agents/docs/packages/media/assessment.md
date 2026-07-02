---
package: '@flighthq/media'
updated: 2026-07-02
basedOn: ./review.md
---

# media — Assessment

Verified against the live tree (3 source files, 3 test files, 53 tests, 41 exports), the prior review (64/100), and the direction session (2026-07-02). Four charter decisions blessed. The package has correctness holes and ~14 lost functions.

## Recommended

Sweep-safe: bug fixes within the existing source.

1. **Fix `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels`.** Per charter Decision #1. These only flip state flags without actually stopping/restarting `AudioBufferSourceNode`. The audio must actually pause.

2. **Add `destroyAudioMixer`.** Per charter Decision #1. No cleanup function exists for the mixer. The `busToMixerRuntimes` map grows unbounded.

3. **Bound `busToMixerRuntimes`.** Per charter Decision #1. The runtime map is never cleaned up.

4. **Package Map description update.** Per charter Open direction #4.

## Backlog

- **Rebuild lost functions.** _Parked — destination depends on media's survival (Open direction #1)._ Charter Decision #2. ~14 functions: panning, muting, loop points, disposal, signals.
- **AudioContext ownership design.** _Parked — Open direction #2._
- **Expansion (spatial, analyser, streaming, crossfade, etc.).** _Parked — Open direction #3._
- **Media existence question.** _Parked — Open direction #1._ Blocks all major design work.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: fix pause/resume, add destroyAudioMixer, bound runtime map, Package Map description
