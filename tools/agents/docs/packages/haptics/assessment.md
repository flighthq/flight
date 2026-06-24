---
package: '@flighthq/haptics'
updated: 2026-06-24
basedOn: ./review.md
---

# haptics — Assessment

The recommendation layer over [`review.md`](./review.md) (solid, 88/100) and the prior maturation roadmap (`tools/agents/docs/reviews/maturation/depth/haptics.md`, now absorbed — remove as one-time seed). Bronze and Silver from that roadmap have **already landed**: all 13 exported functions (vibrate / pattern / waveform, the five-style impact set with optional intensity, notification, selection, cancel, prepare, support predicate, capability descriptor) exist with 31 colocated tests, verified against `67dc46d64:packages/haptics/src/haptics.ts`. The package is at its sweep-safe ceiling: everything that remains is the Gold tier, which is design-gated (the `HapticPattern` model) or cross-package (a `-formats` neighbor, a signals group, a `host-*` backend, the Rust crate). That is why Recommended is thin and Backlog carries the substance.

## Recommended

Sweep-safe: within `@flighthq/haptics`, no cross-package coupling, no breaking change, no open design decision.

- **Nothing requiring code change.** Bronze and Silver are complete and the source already satisfies every contract item the review checked (types-first, full names, out-param capability query, sentinels-not-throws, single root export, `sideEffects: false`, lazy default backend, alphabetized exports). There is no in-package, design-free gap left to sweep. Recorded explicitly so a blanket "do all recommended" correctly does nothing here rather than reaching into Backlog.

The two doc-refresh candidates the review raised are **not** Recommended because they edit shared docs outside this cell and are the user's gate, not a within-package sweep — they are noted under "For the charter / shared docs" below.

## Backlog

Parked: each is cross-package, a new package, or waiting on an Open direction. None is sweep-safe.

- **Custom haptic events (`HapticEvent` / `HapticPattern` / `HapticEventKind`).** _Parked: open design decision._ This is the single largest gap and is new header surface in `@flighthq/types` — it needs an agreed transient/continuous event model **and** a down-conversion contract for how a rich pattern degrades to web's duration/amplitude motor. Both are charter-level decisions (Open directions 1 and 2), and every other Gold item depends on these types. Do not build autonomously.

- **Live continuous-haptic player (`createHapticPlayer` / `startHapticPlayer` / `stopHapticPlayer` / `setHapticPlayerParameters` / `destroyHapticPlayer`).** _Parked: blocked on the `HapticPattern` model above._ Mirrors `CHHapticAdvancedPatternPlayer`; `destroy*` is the correct verb (the player owns a native resource). Cannot start until the event/pattern types are blessed.

- **`@flighthq/haptics-formats` neighbor (AHAP / JSON import).** _Parked: new-package decision + plurality guard._ This is the `-formats` triad layer (structural-forks fork B / the subject triad). It depends on the `HapticPattern` type first, and per the plurality guard a `-formats` cell needs ≥2 real formats to clear bedrock — AHAP alone may not. A charter call (Open direction 3), not a within-package sweep.

- **Haptics signals group (`enableHapticsSignals` / `onHapticPatternComplete` / `onHapticPlayerStateChange`).** _Parked: cross-package + only meaningful with a live player._ Depends on `@flighthq/signals` and on a backend that reports completion; pays off only once the live player and a reporting native backend exist. Defer until then.

- **Native (`host-*`) backend reference.** _Parked: cross-package; validation step._ There is no non-web backend, so the now-substantial `HapticsBackend` interface has never been stressed against a real host. The right home is a `host-*` package (e.g. `host-electron`), not core — confirm the home (Open direction 5) and treat the interface as stabilized once one lands. Carries a breaking-interface note for direct backend implementers (pre-release makes it fine; worth recording in the charter's Decisions when a backend lands).

- **Rust `flighthq-haptics` crate.** _Parked: separate worktree + downstream conformance task._ This is the TS `builder` worktree; the crate does not exist. Sequence it after the `HapticPattern` model is stable so the header is mirrored once, and record any intentional TS↔Rust divergence in the conformance map.

## For the charter / shared docs (not edited here)

Route these to the charter's **Open directions** (the charter's North star / Boundaries / Decisions are all still `TODO`):

1. **Where does the advanced tier stop?** Is `HapticPattern` + a live player in scope for this package's "authoritative," or is haptics intentionally the coarse trigger/vibration cell with Core-Haptics-grade authoring out of scope? The single most load-bearing boundary; it gates the player, the signals group, and the `-formats` neighbor.
2. **Down-conversion contract.** If patterns are in scope, what is the agreed degradation of a rich `HapticPattern` to web's duration/amplitude motor? A cross-cutting Decision the `@flighthq/types` shapes should encode before any player is built.
3. **`-formats` neighbor (fork B / subject triad).** Does AHAP/JSON import warrant `@flighthq/haptics-formats`? Needs ≥2 real formats per the plurality guard; AHAP alone may not clear bedrock.
4. **`triggerHapticImpact(style, intensity?)` overload vs. a split `triggerHapticImpactIntensity`.** No consumer friction observed; record the overload as the blessed choice or leave open.
5. **Native backend reference home.** Confirm a `host-*` is the right place to prove the seam generalizes, and treat the interface as stabilized once one exists.

Shared-doc refreshes (the user's gate, informational only — not edited here):

- **Package Map line is understated.** `tools/agents/docs/index.md` still reads "vibration and impact/notification/selection feedback"; the package now also has pattern, amplitude waveform, capability query, support/cancel, and a prepare seam. A one-line refresh would match the shape.
- **Breaking-interface note** for backend authors (required `cancel`/`capabilities`/`isSupported`/ `vibratePattern` on `HapticsBackend`) — worth carrying into the charter's Decisions when a `host-*` backend lands.

## Approved

_Append-only; frozen on the user's verbal approval only. None yet._
