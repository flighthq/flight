---
package: '@flighthq/media'
updated: 2026-07-02
basedOn: ./review.md
---

# media — Assessment

Verified against the live tree (3 source files, 3 test files, 53 tests, 41 exports), the prior review (64/100), and the direction session (2026-07-02). Four charter decisions blessed. The package has correctness holes and ~14 lost functions.

## Recommended

_None open._ All four items landed and were re-verified against live source on 2026-07-30; they are recorded under [Landed](#landed) below, outside this section so the TODO generator stops reporting them as work. The sweep that verified them found a separate live defect in the mixer's pause/resume scope, since fixed — see [status](./status.md).

## Landed

1. ~~**Fix `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels`.**~~ Landed: both now stop and restart the source nodes rather than flipping flags. The 2026-07-30 sweep found and fixed a second defect in the same pair — resume was restoring *every* paused channel, not the ones the mixer paused.
2. ~~**Add `destroyAudioMixer`.**~~ Landed; stops routed channels, tears down the Web Audio graph, unregisters from the reverse map, and deletes the runtime.
3. ~~**Bound `busToMixerRuntimes`.**~~ Landed; the reverse map entry is removed when its last mixer unregisters.
4. ~~**Package Map description update.**~~ Landed.

## Backlog

- **Rebuild lost functions.** _Parked — destination depends on media's survival (Open direction #1)._ Charter Decision #2. ~14 functions: panning, muting, loop points, disposal, signals.
- **AudioContext ownership design.** _Parked — Open direction #2._
- **Expansion (spatial, analyser, streaming, crossfade, etc.).** _Parked — Open direction #3._
- **Media existence question.** _Parked — Open direction #1._ Blocks all major design work.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: fix pause/resume, add destroyAudioMixer, bound runtime map, Package Map description
