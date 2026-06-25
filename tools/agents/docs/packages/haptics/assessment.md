---
package: '@flighthq/haptics'
updated: 2026-06-25
basedOn: ./review.md
---

# haptics — Assessment

The recommendation layer over [`review.md`](./review.md) — re-based as a **merge-gate** assessment of the `integration-b2824e3d8` delta against the approved baseline `origin/main (eb73c3d74)`. The review's verdict is **reject**: the incoming `packages/haptics` change depends on a `@flighthq/types` surface (`HapticsCapabilities`, the extended `HapticsBackend`, the widened `HapticImpactStyle`) that is **absent** in this branch — `packages/types/src/Haptics.ts` is byte-identical to base — so both `haptics.ts` and `haptics.test.ts` fail `tsc -b`. The design of the delta is right; the tree is not mergeable. That single dropped hunk reshapes this assessment: the one genuinely-Recommended item is to **make the branch compile**, and everything else is parked exactly as it was, because the advanced tier is design-gated or cross-package.

## Recommended

Sweep-safe and within reach of the merge: restore the missing header hunk, then the package returns to the prior `solid` standing. This is the merge blocker, not a feature.

- **Land the matching `@flighthq/types` change so the package compiles.** Add `HapticsCapabilities`, extend `HapticsBackend` (`cancel`, `capabilities(out)`, `isSupported`, `prepare?`, `vibratePattern`, `vibrateWaveform?`, and `impact(style, intensity?)`), and widen `HapticImpactStyle` to include `'rigid' | 'soft'` — exactly the surface `b2824e3d8:packages/haptics/src/haptics.ts:1,5,67,72,78,89,112,127` and `…/haptics.test.ts:1,19` already import and call. (review.md, "The fatal finding".) This is the delta the integration merge dropped; without it the tree does not build. _Note:_ the `packages/haptics` source itself needs no change once the header lands — the implementation is already written against the intended types.

No other within-package, design-free gap exists: the implementation already satisfies every contract item the review checked (full names, out-param capability query, sentinels-not-throws, single root export, `sideEffects: false`, lazy default backend, alphabetized exports, mirrored tests). A blanket "do all recommended" here means "make it compile," nothing more.

## Backlog

Parked: each is cross-package, a new package, or waiting on an Open direction. None is sweep-safe, and none should be attempted before the compile fix above.

- **Custom haptic events (`HapticEvent` / `HapticPattern` / `HapticEventKind`).** _Parked: open design decision._ New header surface in `@flighthq/types` needing an agreed transient/continuous event model **and** a down-conversion contract for how a rich pattern degrades to web's duration/amplitude motor. Both are charter-level (Open directions 1 and 2); every other Gold item depends on these types. Do not build autonomously.

- **Live continuous-haptic player (`createHapticPlayer` / `startHapticPlayer` / `stopHapticPlayer` / `setHapticPlayerParameters` / `destroyHapticPlayer`).** _Parked: blocked on the `HapticPattern` model above._ Mirrors `CHHapticAdvancedPatternPlayer`; `destroy*` is the correct verb (owns a native resource). Cannot start until the event/pattern types are blessed.

- **`@flighthq/haptics-formats` neighbor (AHAP / JSON import).** _Parked: new-package decision + plurality guard._ The `-formats` triad layer (structural-forks fork B / the subject triad). Depends on the `HapticPattern` type first, and per the plurality guard a `-formats` cell needs ≥2 real formats to clear bedrock — AHAP alone may not. A charter call (Open direction 3), not a within-package sweep.

- **Haptics signals group (`enableHapticsSignals` / `onHapticPatternComplete` / `onHapticPlayerStateChange`).** _Parked: cross-package + only meaningful with a live player._ Depends on `@flighthq/signals` and on a backend that reports completion; pays off only once the live player and a reporting native backend exist.

- **Native (`host-*`) backend reference.** _Parked: cross-package; validation step._ There is no non-web backend, so the now-substantial `HapticsBackend` interface has never been stressed against a real host. The right home is a `host-*` package (e.g. `host-electron`), not core. Carries a breaking-interface note for direct backend implementers (pre-release makes it fine; worth recording in the charter's Decisions when a backend lands).

- **Rust `flighthq-haptics` crate.** _Parked: separate worktree + downstream conformance task._ This is the TS `builder` worktree; the crate does not exist. Sequence it after the `HapticPattern` model is stable so the header is mirrored once, and record any intentional TS↔Rust divergence in the conformance map.

## Notes for the charter's Open directions

Route these to the charter's **Open directions** (North star / Boundaries / Decisions are all still `TODO` / draft):

1. **Where does the advanced tier stop?** Is `HapticPattern` + a live player in scope for "authoritative," or is haptics the coarse trigger/vibration cell with Core-Haptics-grade authoring out of scope? The most load-bearing boundary; it gates the player, the signals group, and the `-formats` neighbor.
2. **Down-conversion contract.** If patterns are in scope, what is the agreed degradation of a rich `HapticPattern` to web's duration/amplitude motor? A cross-cutting Decision the `@flighthq/types` shapes should encode before any player is built.
3. **`-formats` neighbor (fork B / subject triad).** Does AHAP/JSON import warrant `@flighthq/haptics-formats`? Needs ≥2 real formats per the plurality guard; AHAP alone may not clear bedrock.
4. **`triggerHapticImpact(style, intensity?)` overload vs. a split `triggerHapticImpactIntensity`.** No consumer friction observed; record the overload as the blessed choice or leave open. The review's minor doc-imprecision note ("intensity defaults to 1") is incidental to this decision.
5. **Native backend reference home + interface-stability expectation.** Confirm a `host-*` is the right place to prove the seam generalizes, and treat `HapticsBackend` as stabilized once one exists.

Shared-doc refresh (the user's gate, informational only):

- **Package Map line is understated.** `tools/agents/docs/index.md` still reads "vibration and impact/notification/selection feedback"; the package now also has pattern, amplitude waveform, capability query, support/cancel, and a prepare seam — _once the missing types land_. A one-line refresh would match the shape, but only after the compile fix makes that shape real in the tree.

## Approved

_None. Approval is the user's verbal gate; this section is append-only and frozen on that approval._
