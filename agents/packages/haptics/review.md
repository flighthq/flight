---
package: '@flighthq/haptics'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - status.md
  - charter.md
  - source (packages/haptics/src)
  - packages/types/src/Haptics.ts
---

# haptics — Review

> Depth review of the live tree (2026-07-13). Supersedes the 2026-06-25 merge-gate review of `integration-b2824e3d8`, whose Reject verdict (35) scored a snapshot missing the `@flighthq/types` half of the change. **That blocker is resolved**: `packages/types/src/Haptics.ts` now carries the widened `HapticImpactStyle` (`'light' | 'medium' | 'heavy' | 'soft' | 'rigid'`), `HapticsCapabilities`, and the extended `HapticsBackend` (`cancel`, `capabilities(out)`, two-arg `impact`, `isSupported`, optional `prepare`, `vibratePattern`, optional `vibrateWaveform`). The June minor note on `triggerHapticImpact` is also fixed: it now resolves the documented default explicitly (`intensity ?? 1`) so no backend has to reinterpret `undefined`.

## Verdict

`solid — 80/100`. The device-vibration half of the haptics rubric is complete and well-shaped: 13 flat free functions covering raw vibration, Web-Vibration pattern arrays, amplitude-aware waveforms (Android `VibrationEffect.createWaveform` convention, 0–255 amplitudes, repeat index) with an automatic `vibratePattern` fallback when a backend lacks waveform support, semantic impact (5 styles × continuous 0..1 intensity) / notification / selection triggers, cancel, an out-param capability query, a support predicate, and a `prepare` warm-up hint mirroring `UIFeedbackGenerator.prepare`. The web default over `navigator.vibrate` degrades honestly (every method `false`-sentinels; capabilities report `patterns` only). 31 colocated tests mirror all 13 exports. What keeps it out of the high 80s against the textbook-maturity bar: **gamepad rumble (dual-rotor) is absent** — a capability every mature haptics library exposes — and the pattern-authoring/continuous-player tier is chartered but undecided. The prior depth review's `solid/88` read as generous now that the rubric explicitly includes gamepad rumble.

## Present capabilities

Verified against `packages/haptics/src/haptics.ts` (147 lines) and `haptics.test.ts` (31 tests, describes mirror all 13 exports in order):

- **Raw vibration**: `vibrateDevice(durationMs)`, `vibrateDevicePattern([onMs, offMs, …])` (`false` on empty), `vibrateDeviceWaveform(timings, amplitudes, repeat = -1)` — free-function fallback to `vibratePattern(timings)` when the backend omits the optional `vibrateWaveform`, `cancelDeviceVibration()` (web: `vibrate(0)`).
- **Semantic triggers**: `triggerHapticImpact(style, intensity?)` with the default-1 resolution at the free-function layer (durable comment explains why); `triggerHapticNotification('success' | 'warning' | 'error')` (distinct web patterns per type); `triggerHapticSelection()` (5 ms tick).
- **Introspection**: `getHapticsCapabilities(out)` — correct caller-owned out-param, returns the same `out`; `isHapticsSupported()`; `prepareHaptics()` optional-chained so a backend without `prepare` is a safe no-op.
- **Seam**: `getHapticsBackend` lazy web default / `setHapticsBackend(null)` restore; `createWebHapticsBackend` maps styles to duration/pattern approximations, clamps intensity 0..1, and routes everything through a single guarded `webVibrate` helper (never throws, `false` in jsdom/desktop).
- Hygiene: `sideEffects: false`, single `.` export, `@flighthq/types` the only dependency; `Readonly<number[]>` on pattern/waveform inputs; module state below exports; the closed style/type string unions are correctly closed (no growing handler family).

## Gaps

1. **Gamepad rumble (dual-rotor) absent.** No `vibrationActuator` / dual-rumble (`strongMagnitude`/`weakMagnitude`, duration, `playEffect`/`reset`) surface anywhere — `@flighthq/input` owns gamepad state but exposes no rumble either. This is the biggest hole against the textbook rubric, and its home (haptics vs input) is a cross-package design fork, not a sweep.
2. **Pattern-authoring/continuous tier undecided** (charter Open direction #1): no `HapticPattern` value type, no live continuous-haptic player, no Core-Haptics-grade transient/continuous events. Gates the potential `-formats` neighbor (AHAP import) and a signals group.
3. **Down-conversion contract unwritten** (charter Open direction #2): if patterns land, the degradation to web's duration/amplitude motor needs a spec.
4. **No diagnostics layer** — `false` sentinels with no `explain*` / `enable*Guards`; suite-wide condition.
5. **No native `host-*` reference backend yet** exercises the richer seam (waveform, prepare, capabilities), so its native fidelity is designed but unproven.
6. **Rust mirror `flighthq-haptics` unstarted.**

## Charter contradictions

None. The 2026-07-02 Decision (impact default intensity = 1, passed explicitly) is verified implemented. The boundary holds: no badge (`@flighthq/app`) or sensor (`@flighthq/sensors`) creep. The charter's "13 exports" inventory matches source exactly.

## Contract & docs fit

- Types-first satisfied: the full seam with doc comments (including the optional-member contracts for `prepare`/`vibrateWaveform`) lives in `packages/types/src/Haptics.ts`. The June "status claims types that are absent" honesty finding is resolved.
- `capabilities(out)` follows the out-param convention including on the backend interface — the only platform-suite seam doing so; a pattern worth noting when other cells grow capability queries.
- `vibrateDeviceWaveform` documents equal-length timings/amplitudes without validating — correct under the contract (API misuse, not expected failure); the empty-timings expected-failure case is checked.

## Candidate open directions

1. **Gamepad rumble home** — decide whether dual-rotor rumble lives here (device-agnostic "haptics" framing, keyed by a gamepad reference) or in `@flighthq/input` (which owns gamepad identity); either way it is the missing rubric row.
2. `HapticPattern` + player tier and its web down-conversion contract (charter Open directions #1–2) — the gate on `-formats` (AHAP) and any signals group.
3. A native `host-electron`/host reference implementation of the extended seam to validate waveform/prepare/capabilities fidelity end-to-end.
