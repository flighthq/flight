---
package: '@flighthq/haptics'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# haptics — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

No code changes. The assessment's `## Recommended` section is explicitly empty of code work ("Nothing requiring code change") — Bronze and Silver have landed (13 exported functions, 31 colocated tests) and everything remaining is in Backlog: design-gated (the `HapticPattern` event model) or cross-package (a `-formats` neighbor, a signals group, a `host-*` backend, the Rust crate). The two doc-refresh candidates the review raised are flagged as the user's gate on shared docs, not a within-package sweep, so they were not touched here.

- Verified the package own-tests still pass: `npm run test --workspace=packages/haptics` → 1 file, 31 tests passed.
- Parked (unchanged from assessment Backlog): custom haptic events / `HapticPattern`; live continuous-haptic player; `@flighthq/haptics-formats`; haptics signals group; native `host-*` backend reference; Rust `flighthq-haptics` crate.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/haptics

**Session date:** 2026-06-24 **Starting score:** 72/100 (solid) **Estimated new score:** 91/100

## Implemented APIs

### Bronze (missing-by-omission gaps, all implemented)

- **`cancelDeviceVibration(): boolean`** — cancels any in-progress vibration via `HapticsBackend.cancel()`; web backend calls `navigator.vibrate(0)`.
- **`isHapticsSupported(): boolean`** — distinguishes unsupported from denied/failed without firing feedback; web backend checks `typeof navigator.vibrate === 'function'`.
- **`vibrateDevicePattern(pattern: Readonly<number[]>): boolean`** — exposes the pattern path the web backend was already building internally for notifications; returns false on empty pattern at the free-function level.

### Silver (competitive polish, all implemented)

- **`prepareHaptics(): void`** — warm-up hint that calls the optional `HapticsBackend.prepare?()` method; no-op on web; reduces first-trigger latency on native (`UIFeedbackGenerator.prepare()` equivalent).
- **`getHapticsCapabilities(out: HapticsCapabilities): HapticsCapabilities`** — out-param capability descriptor; reports `{ supported, patterns, intensity, amplitudeControl, customEvents }` from the active backend; no allocation in hot path.
- **`triggerHapticImpact(style, intensity?: number): boolean`** — extended with optional continuous intensity parameter (0..1), mirroring iOS 13+ `UIImpactFeedbackGenerator(intensity:)`; web backend scales motor duration by intensity; single-arg call remains valid.
- **`vibrateDeviceWaveform(timings, amplitudes, repeat?): boolean`** — amplitude-aware waveform vibration mapping Android `VibrationEffect.createWaveform`; backends lacking native waveform support fall back to `vibratePattern(timings)`; returns false on empty timings.

### Types updated in `@flighthq/types` (`packages/types/src/Haptics.ts`)

- **`HapticImpactStyle`** extended to `'heavy' | 'light' | 'medium' | 'rigid' | 'soft'` — adds `'rigid'` and `'soft'` matching the full iOS 13+ `UIImpactFeedbackGenerator` style set.
- **`HapticsCapabilities` interface** added — `{ amplitudeControl, customEvents, intensity, patterns, supported }` as an out-param struct; satellite of the `Haptics.ts` capability file.
- **`HapticsBackend` interface** fully extended:
  - `cancel(): boolean`
  - `capabilities(out: HapticsCapabilities): HapticsCapabilities`
  - `impact(style, intensity?): boolean` (intensity widened)
  - `isSupported(): boolean`
  - `prepare?(): void` (optional method; existing backends need no change — but `HapticsBackend` now requires the mandatory new methods)
  - `vibratePattern(pattern: Readonly<number[]>): boolean`
  - `vibrateWaveform?(timings, amplitudes, repeat?): boolean` (optional)

### Tests

31 tests passing, covering:

- All new free functions (bronze + silver) for both fake-backend forwarding path and jsdom-unavailable path
- Empty-pattern sentinel for `vibrateDevicePattern` and `vibrateDeviceWaveform`
- Impact intensity forwarding and clamping in web backend
- All five impact styles (`light`, `medium`, `heavy`, `rigid`, `soft`)
- `prepareHaptics` with and without optional backend `prepare` method
- Capability descriptor round-trip via fake backend
- Waveform fallback when backend lacks `vibrateWaveform`
- Default `repeat = -1` for `vibrateDeviceWaveform`

## Deferred Items

### Gold tier — design decisions to surface

1. **`HapticEvent` / `HapticPattern` / `HapticEventKind` (Core-Haptics-style custom events)** — deferred as a design decision. This requires agreeing on the transient/continuous event model and the down-conversion contract (how a `HapticPattern` degrades to a duration/amplitude approximation on web). The `HapticEvent`/`HapticPattern` types in `@flighthq/types` should be designed jointly — they are the new header surface that `playHapticPattern`, `createHapticPlayer`, and the Rust port all depend on. Do not build autonomously; surface to user first.

2. **Live continuous-haptic control** (`createHapticPlayer`, `startHapticPlayer`, `stopHapticPlayer`, `setHapticPlayerParameters`, `destroyHapticPlayer`) — depends on `HapticPattern` model being stable. Mirrors `CHHapticAdvancedPatternPlayer`. The `destroy*` verb is correct here (owns a native resource). Defer until a concrete consumer needs designer-authored or continuous haptics.

3. **`@flighthq/haptics-formats` neighbor package** — new package for `parseAhapPattern(source): HapticPattern | null` (Apple AHAP JSON import) and `parseHapticPatternJson`. Cross-package task; requires `HapticPattern` types first and a new package shape modeled on a nearby `-formats` sibling. Flag before creating.

4. **Signals group (`enableHapticsSignals`)** — `onHapticPatternComplete` / `onHapticPlayerStateChange` via `@flighthq/signals`. Depends on live-player/native backend reporting completion. Defer until live player exists.

5. **Rust port (`flighthq-haptics` crate)** — no `crates/` directory in this worktree (this is the TypeScript `builder` worktree). The Rust port is a separate `rust` worktree task. After the TS `HapticPattern` model is stable, mirror: `HapticsBackend` trait, all free functions as snake_case, `HapticEvent`/`HapticPattern` value types in `flighthq-types`, native default backend gated behind `native` cargo feature.

6. **Native backend reference** — belongs in a `host-*` package (e.g. `@flighthq/host-electron`), not core. Validates that the `HapticsBackend` interface is the right shape for a non-web host. Natural final step once the full seam exists.

## Concerns and Surprises

- **`HapticsBackend` is a breaking interface change.** Extending the interface with required new methods (`cancel`, `capabilities`, `isSupported`, `vibratePattern`) is a breaking change for any consumer that has implemented `HapticsBackend` directly. Pre-release status makes this acceptable per codebase rules, but any native backend authors will need to add these four methods plus the optional `prepare` and `vibrateWaveform`. The fake backend in tests covers all methods as a reference implementation.

- **`vibratePattern` empty-check is in both layers.** The free function `vibrateDevicePattern` guards `pattern.length === 0` before calling the backend, and the web backend also guards it. This double-guard is intentional: the free function provides consistent sentinel behavior regardless of backend, and the web backend guard is appropriate for direct backend use. Clean.

- **`void repeat` in web backend's `vibrateWaveform`.** The `repeat` parameter is unused in the web implementation (web Vibration API has no repeat-index concept). Using `void repeat` suppresses the unused-variable warning; a comment explains why.

- **`HapticNotificationType` union order.** The union was already alphabetized (`'error' | 'success' | 'warning'`) after the linter ran. No action needed.

## Suggestions for Future Sessions

1. **Design `HapticPattern` collaboratively** — this is the highest-value Gold item and has real design surface (transient vs continuous events, AHAP fidelity, down-conversion semantics). A focused design session would yield stable types for the Rust port to mirror.

2. **Add `@flighthq/haptics-formats`** once `HapticPattern` exists — it is bounded, follows the `-formats` pattern, and gives designers an import path for AHAP files authored in Logic Pro or the Core Haptics Composer.

3. **Wire a native Electron backend sample** in `host-electron` — even a thin stub that calls `shell.beep()` or a native addon would prove the interface generalizes and give the seam a real stress test.

4. **Consider `triggerHapticImpactIntensity` vs. overload** — the roadmap notes this as a design decision. The current implementation chose the overload (`triggerHapticImpact(style, intensity?)`) for symmetry with the platform reference. If callers find the optional second parameter confusing, a separate `triggerHapticImpactIntensity(style, intensity)` function would make both paths explicit. No action recommended until a consumer signals friction.
