---
id: haptics
title: '@flighthq/haptics'
type: depth
target: haptics
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/haptics.md
  - tools/agents/docs/reviews/depth/haptics.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100; covers the core impact/notification/selection/vibrate surface cleanly, but falls short of authoritative on a handful of widely-expected secondary operations (pattern vibration, cancel, availability query, intensity).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that closes the "solid → authoritative" distance, all low-cost and primitive-already-present.

- **`vibrateDevicePattern(pattern: Readonly<number[]>): boolean`** — expose the pattern path the web backend already builds for `notification`. Add `vibratePattern(pattern: Readonly<number[]>): boolean` to `HapticsBackend`; web impl calls `webVibrate(pattern)`. Pattern is `[onMs, offMs, onMs, ...]` matching the Web Vibration API. Return `false` on empty/invalid (sentinel, no throw).
- **`cancelDeviceVibration(): boolean`** — `navigator.vibrate(0)` on web; `cancel()` method on `HapticsBackend`. Canonical stop, present in Android `cancel()` and the Web Vibration API.
- **`isHapticsSupported(): boolean`** — distinguishes "unsupported" from "denied/failed" without firing feedback. Add `isSupported(): boolean` to `HapticsBackend`; web impl returns `typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'`. Matches the `is*` boolean-prefix rule.
- **Test coverage for all three** in `haptics.test.ts`: fake-backend forwarding path + jsdom-unsupported path for each, plus empty-pattern and `vibrate(0)` cancel cases.

After Bronze the package reads as authoritative-for-its-floor: every operation a Capacitor/Web-Vibration user reaches for is present.

### Silver

Competitive and solid — matches the modern iOS/Android API surface beyond the floor, with cross-backend consistency and a richer type model. Requires expanding the `@flighthq/types` header first.

- **Continuous impact intensity.** `triggerHapticImpact(style: HapticImpactStyle, intensity?: number)` where `intensity` is `0..1` (mirrors iOS 13+ `UIImpactFeedbackGenerator(intensity:)`). Extend `HapticsBackend.impact(style, intensity?)`; web backend scales its duration by intensity. Keep the single-arg call valid (default `intensity = 1`).
- **Generator warm-up seam.** `prepareHaptics(): void` and `HapticsBackend.prepare?(): void` — no-op on web, latency reduction on native (`UIFeedbackGenerator.prepare()`). Optional method so existing backends need no change.
- **Rigid/soft impact styles.** Extend `HapticImpactStyle` to `'light' | 'medium' | 'heavy' | 'rigid' | 'soft'` to match the full iOS impact set; web backend maps the two new styles to distinct durations.
- **Capability descriptor.** `getHapticsCapabilities(out: HapticsCapabilities): HapticsCapabilities` (out-param, no allocation in hot path) reporting `{ supported, patterns, intensity, customEvents, amplitudeControl }`. Add `HapticsCapabilities` to `@flighthq/types`. Lets callers gate UI on what the active backend can do rather than trial-firing. Web fills `{ supported, patterns: true, intensity: false, customEvents: false, amplitudeControl: false }`.
- **Amplitude-aware waveform vibration.** `vibrateDeviceWaveform(timings: Readonly<number[]>, amplitudes: Readonly<number[]>, repeat?: number): boolean` mapping Android `VibrationEffect.createWaveform`. Web backend ignores amplitudes (falls back to `vibratePattern`); native backends honor them. Add `vibrateWaveform` to `HapticsBackend` as an optional method with a pattern fallback in the free function when absent.
- **`HapticImpactKind` / `HapticNotificationKind` string-kind alignment** review — keep them as the existing string-literal union (correct as-is for a closed, host-defined set; do **not** convert to an open `*Kind` registry — surface this as a design note, not an action).
- **Tests:** intensity clamping/aliasing, new impact styles, capability descriptor across fake backends, waveform fallback when the backend lacks `vibrateWaveform`.

### Gold

Authoritative / AAA — the canonical Flight haptics reference, exhaustive within the domain, with custom-event support, a real native backend, full conformance to a Rust mirror, and the importer-neighbor for designer-authored patterns.

- **Core-Haptics-style custom events.** A plain-data descriptor model in `@flighthq/types`: `HapticEvent` (`{ kind: HapticEventKind, time, duration?, intensity?, sharpness? }`), `HapticEventKind` (`'transient' | 'continuous'` as a string-kind), and `HapticPattern` (`{ events: Readonly<HapticEvent[]>, dynamicParameters?: ... }`). Constructors `createHapticEvent(...)`, `createHapticPattern(...)` (explicit allocation) and `playHapticPattern(pattern: Readonly<HapticPattern>): boolean` / `HapticsBackend.playPattern?`. Web backend down-converts a pattern to a duration/amplitude approximation; native backends play it natively.
- **Live continuous-haptic control.** `createHapticPlayer(pattern): HapticPlayer | null`, `startHapticPlayer`, `stopHapticPlayer`, `setHapticPlayerParameters(player, intensity, sharpness)`, `destroyHapticPlayer` (this owns a native resource → `destroy*`, not `dispose*`). Mirrors `CHHapticAdvancedPatternPlayer`. Returns `null` sentinel when the backend cannot create a live player.
- **`@flighthq/haptics-formats` neighbor package.** Importer/parser for designer-authored haptic files — `parseAhapPattern(source): HapticPattern | null` (Apple AHAP JSON) and `parseHapticPatternJson(...)`. Keeps the format dependency out of the core package per the `-formats` pattern; outputs the `@flighthq/types` `HapticPattern` value.
- **Signals group (opt-in).** `enableHapticsSignals()` exposing `onHapticPatternComplete` / `onHapticPlayerStateChange` via `@flighthq/signals`, for backends that report completion (native players, long patterns). `enable*` lives here, in the owning package; cost is opt-in.
- **Rust port: `flighthq-haptics` crate.** 1:1 mirror — `HapticsBackend` trait + `set_haptics_backend`/`get_haptics_backend`, free functions `vibrate_device`, `vibrate_device_pattern`, `cancel_device_vibration`, `is_haptics_supported`, `trigger_haptic_impact`, `trigger_haptic_notification`, `trigger_haptic_selection`, `play_haptic_pattern`. Native default backend gated behind a `native` cargo feature; `host-web` provides the `navigator.vibrate` fill; `HapticEvent`/`HapticPattern` value types in `flighthq-types`. Record any intentional TS↔Rust divergence in the conformance map.
- **Real native backend reference** (in the appropriate `host-*` package, not core): an Electron/native impl proving the seam fills (`createElectron*` style) — surfaces whether the `HapticsBackend` trait is the right shape for a non-web host.
- **Exhaustive tests + docs:** out-param aliasing tests for capability/event constructors, every sentinel path, pattern down-conversion fidelity, and a short `tests/functional` or example demonstrating a tap-feedback flow. `npm run api`, `exports:check`, `order:check`, `packages:check` clean.

## Sequencing & effort

1. **Bronze (small, ~half a day, no cross-package design).** Order: (a) extend `HapticsBackend` in `@flighthq/types` with `vibratePattern`, `cancel`, `isSupported`; (b) implement the three free functions + web backend methods; (c) tests; (d) `npm run fix` + `npm run check`. No dependency on other packages. Do this first and independently — it is the highest value-per-effort and removes the only "missing-by-omission" gaps the depth review flagged.

2. **Silver (medium, ~1–2 days).** Depends on Bronze. The header work (`HapticsCapabilities`, extended `HapticImpactStyle`, optional backend methods) must land in `@flighthq/types` before the package implementation. `intensity` and the two new impact styles are backward-compatible widenings of existing functions — sequence them before the capability descriptor and waveform so the type churn is one pass. Surface as a **design decision to the user**: whether `intensity` belongs as an overload of `triggerHapticImpact` or a separate `triggerHapticImpactIntensity` (overload is recommended for symmetry with the platform reference, but it widens an existing signature).

3. **Gold (large, multi-day, multi-package).** Depends on Silver. Ordering and cross-package items to surface before starting:
   - **`HapticEvent` / `HapticPattern` / `HapticEventKind` must be designed in `@flighthq/types` first** — they are the new header surface every other Gold item builds on. This is a genuine design decision (the transient/continuous event model and the down-conversion contract) and should be **surfaced to the user**, not built autonomously.
   - **`@flighthq/haptics-formats`** is a new package — needs `npm run packages:check` and the standard new-package shape copied from a nearby `-formats` neighbor. Cross-package; flag before creating.
   - **Signals group** depends on `@flighthq/signals` and only pays off once a backend reports completion — defer until the live-player/native backend exists.
   - **Rust `flighthq-haptics`** is a separate worktree/crate and a downstream conformance task — sequence it after the TS `HapticPattern` model is stable, since it mirrors that header. No Rust crate exists yet.
   - **Native backend reference** belongs in a `host-*` package, not core — it is the validation that the seam generalizes, so it is the natural last step that proves the whole tier.

**Honest note:** Bronze alone moves this package to credibly authoritative for its narrow domain (the depth review's own recommendation). Silver is worthwhile competitive polish. Gold (custom Core-Haptics events, AHAP import, live players, Rust mirror) is the genuine frontier and is partly missing-by-design today — pursue it only when a concrete consumer needs designer-authored or continuous haptics, and surface the `HapticPattern` model as a design decision before building it.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/haptics` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
