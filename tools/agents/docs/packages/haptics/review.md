---
package: '@flighthq/haptics'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/haptics.md
  - source
---

# haptics — Review

## Verdict

solid — 88/100. A clean, well-bounded platform-integration cell that now covers the full well-recognized haptics surface — raw vibration, patterns, amplitude waveform, the iOS-complete impact-style set, semantic cues, capability query, support predicate, cancel, and a prepare warm-up hint — over a swappable web/native backend seam. It sits just below "authoritative" only because the genuinely advanced tier (Core-Haptics-style custom `HapticEvent`/`HapticPattern` events and a live continuous-haptic player) is deliberately deferred as a design decision, and the seam has no non-web backend yet to stress it. The session's claimed jump from 72 to ~91 is real on substance; 88 reflects that the remaining gap is a real design surface, not just omissions.

## Present capabilities

Evidence is `67dc46d64:packages/haptics/src/haptics.ts` (13 exported functions, alphabetized, each with a colocated `describe` block — 31 `it` cases) and `67dc46d64:packages/types/src/Haptics.ts`.

Trigger / command surface:

- `vibrateDevice(durationMs)` — raw motor pulse → `navigator.vibrate(ms)`.
- `vibrateDevicePattern(pattern: Readonly<number[]>)` — Web-Vibration pattern array; returns `false` on empty pattern at the free-function layer (and again in the web backend — intentional double guard for consistent sentinel behavior on direct backend use).
- `vibrateDeviceWaveform(timings, amplitudes, repeat = -1)` — amplitude-aware waveform mapping Android `VibrationEffect.createWaveform`; falls back to `vibratePattern(timings)` when the backend has no `vibrateWaveform`; `false` on empty timings.
- `triggerHapticImpact(style, intensity?)` — physical impact across the full iOS 13+ style set (`heavy | light | medium | rigid | soft`), with optional continuous intensity (0..1). The web backend scales motor duration by a clamped intensity; single-arg call remains valid.
- `triggerHapticNotification('error' | 'success' | 'warning')` — semantic cue, exact `UINotificationFeedbackGenerator` mapping.
- `triggerHapticSelection()` — light selection tick.
- `cancelDeviceVibration()` — stop in-progress vibration; web backend calls `navigator.vibrate(0)`.
- `prepareHaptics()` — warm-up hint over the optional `HapticsBackend.prepare?()`; no-op on web, always safe (`UIFeedbackGenerator.prepare()` equivalent).

Query surface:

- `isHapticsSupported()` — distinguishes unsupported from denied/failed without firing feedback (correct `is*` boolean prefix); web backend checks `typeof navigator.vibrate === 'function'`.
- `getHapticsCapabilities(out: HapticsCapabilities)` — out-param descriptor reporting `{ amplitudeControl, customEvents, intensity, patterns, supported }`; no allocation, returns the same `out`. Tested for both the fake-backend round-trip and the aliased identity (`result === out`).

Backend seam: `createWebHapticsBackend()` / `getHapticsBackend()` / `setHapticsBackend(backend|null)` — the platform-suite command-capability shape, with a lazily-created web default and no top-level side effects. The web backend guards `navigator.vibrate` and `try/catch`es every call, returning `false` rather than throwing — correct sentinel discipline. `HapticImpactStyle`, `HapticNotificationType`, `HapticsCapabilities`, and the fully-extended `HapticsBackend` interface all live in `@flighthq/types`, per the header-layer rule.

Status-doc verification: every claim in `status.md` checks out against source — the three Bronze functions, the four Silver additions, the five-style union, the `HapticsCapabilities` struct, the `HapticsBackend` extension (with `prepare?`/`vibrateWaveform?` optional), the 31 tests, and the `void repeat` note in the web waveform path are all present exactly as described. No drift.

## Gaps

The remaining distance to authoritative is the genuinely-advanced tier, all correctly flagged as deferred design decisions in `status.md`:

- **Custom haptic events** — no `HapticEvent` / `HapticPattern` / `HapticEventKind` (Core-Haptics-style transient/continuous descriptors, AHAP-like). This is the single largest gap and is real design surface: it needs an agreed transient/continuous event model and a down-conversion contract for how a pattern degrades to a duration/amplitude approximation on web. These types are new header surface in `@flighthq/types` that `playHapticPattern`, a player, and the Rust port would all depend on.
- **Live continuous-haptic player** — no `createHapticPlayer` / `startHapticPlayer` / `stopHapticPlayer` / `setHapticPlayerParameters` / `destroyHapticPlayer` (mirrors `CHHapticAdvancedPatternPlayer`). Blocked on the `HapticPattern` model. (`destroy*` is the right verb — the player owns a native resource.)
- **Pattern import** — no `@flighthq/haptics-formats` neighbor for `parseAhapPattern` (Apple AHAP JSON) / `parseHapticPatternJson`. This is the `-formats` triad layer (structural-forks fork B / the subject triad); it requires the `HapticPattern` type first and is a new-package decision.
- **Completion signals** — no `enableHapticsSignals` / `onHapticPatternComplete` / `onHapticPlayerStateChange`. Only meaningful once a live player and a backend that reports completion exist.
- **No non-web backend** — there is no `host-*` reference implementation, so the (now substantial) `HapticsBackend` interface has never been validated against a real native host. The web backend is a faithful reference for the seam but cannot prove the shape generalizes.
- **No Rust crate** — `flighthq-haptics` does not exist yet (this is the TS `builder` worktree). A port should wait until the `HapticPattern` model is stable so it is mirrored once.

## Charter contradictions

None. The charter's "What it is" (vibration + impact/notification/selection over a swappable web/native backend) is exactly what the code is, and the package honors every SDK design constraint the charter inherits: free functions, out-param capability query, full unabbreviated names, sentinels-not-throws, single root export, `"sideEffects": false`, lazy default backend. The charter's North star, Boundaries, and Decisions are all still `TODO`, so there is little stated vision to contradict — see candidate open directions.

## Contract & docs fit

Lives up to the contract cleanly:

- **`@flighthq/types`-first** — all four type/interface shapes are in `packages/types/src/Haptics.ts`; no cross-package types defined inline. ✓
- **Full unabbreviated names** — `triggerHapticImpact`, `vibrateDeviceWaveform`, `getHapticsCapabilities`, etc. all carry the domain noun and read unambiguously from the barrel. ✓
- **`out`-params** — `getHapticsCapabilities(out)` returns the same object, no hot-path allocation; the aliased case is tested. ✓
- **Sentinels not throws** — `false`/no-op everywhere the host is absent or denies; nothing throws. ✓
- **Single root export** — `index.ts` is a bare `export * from './haptics'`; `package.json` exposes only `.`. ✓
- **`sideEffects: false`** — declared; the default backend is lazily created in `getHapticsBackend`, not at module top level. ✓
- **Boolean prefixes** — `isHapticsSupported` uses `is*` correctly. ✓
- **Source style** — exports alphabetized; loose `_backend` and the `webVibrate` helper sit at the bottom of the file after the exports; comments explain the `void repeat` web no-op, the double-guard, and the coarse-web-approximation framing. ✓

Candidate doc revisions (the user's gate, not mine):

- **Package Map line is now understated.** `tools/agents/docs/index.md` describes haptics as "vibration and impact/notification/selection feedback." The package has since grown pattern, amplitude waveform, capability query, support/cancel, and a prepare seam. A one-line refresh ("…over a swappable web/native backend, with pattern/waveform vibration and a capability query") would match the shape the work has taken. Low priority — informational, not a correctness issue.
- **Breaking-interface note for backend authors.** `status.md` correctly flags that extending `HapticsBackend` with required `cancel`/`capabilities`/`isSupported`/`vibratePattern` is a breaking change for any direct implementer. Pre-release makes this fine; worth carrying into the charter's Decisions if/when a `host-*` backend lands, so the interface-stability expectation is recorded.

## Candidate open directions

The charter's North star / Boundaries / Decisions are all `TODO`; everything below is a question a review had to assume against and should feed the charter:

1. **Where does the advanced tier stop?** Is `HapticPattern` + a live player in scope for this package's "authoritative," or is haptics intentionally the coarse trigger/vibration cell with Core-Haptics-grade authoring out of scope? This is the single most load-bearing boundary the charter is silent on, and it gates the player, the signals group, and the `-formats` neighbor.
2. **Down-conversion contract.** If patterns are in scope, what is the agreed degradation of a rich `HapticPattern` to web's duration/amplitude motor? This is a cross-cutting Decision the types in `@flighthq/types` should encode before any player is built.
3. **`-formats` neighbor (structural-forks fork B / subject triad).** Does AHAP/JSON import warrant `@flighthq/haptics-formats`? Per the plurality guard it needs ≥2 real formats to justify a split; AHAP alone may not clear bedrock. A charter call.
4. **`triggerHapticImpact(style, intensity?)` overload vs. a split function.** The depth review and `status.md` both note the optional-second-param choice; a separate `triggerHapticImpactIntensity` is the alternative. No consumer friction observed — record the overload as the blessed choice or leave open.
5. **Native backend reference home.** Confirm a `host-*` (e.g. `host-electron`) is the right place to prove the seam generalizes, and treat the interface as stabilized once one exists.
