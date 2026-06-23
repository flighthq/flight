# Depth Review: @flighthq/haptics

**Domain:** Haptic feedback — device vibration and semantic tactile cues (impact / notification / selection), as a swappable platform capability over a web (`navigator.vibrate`) or native host backend.

**Verdict:** solid — 72/100

This is a platform-integration _cell_, not an open-ended algorithm library, so the canonical bar is narrower than for `easing` or `path`. Judged against the actual industry references for this domain — Apple's `UIFeedbackGenerator` family (`UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator`, `UISelectionFeedbackGenerator`), Android's `VibrationEffect` / `HapticFeedbackConstants`, Capacitor `Haptics`, and the Web Vibration API — the package covers the core, well-recognized surface cleanly. It falls short of "authoritative" mainly on a handful of widely-expected secondary operations (pattern vibration, cancel, availability query, impact intensity) rather than on its fundamentals.

## Present capabilities

- `vibrateDevice(durationMs)` — raw motor pulse for a duration. Maps directly to `navigator.vibrate(ms)`.
- `triggerHapticImpact('light' | 'medium' | 'heavy')` — physical impact cue. Mirrors `UIImpactFeedbackGenerator` styles and Capacitor `ImpactStyle`.
- `triggerHapticNotification('success' | 'warning' | 'error')` — semantic notification cue. Mirrors `UINotificationFeedbackGenerator` types exactly.
- `triggerHapticSelection()` — light selection tick. Mirrors `UISelectionFeedbackGenerator.selectionChanged()`.
- Backend seam: `createWebHapticsBackend()`, `getHapticsBackend()`, `setHapticsBackend(backend | null)`. Clean command-capability shape matching the rest of the platform suite, with a lazily-created web default.
- `HapticsBackend` interface plus `HapticImpactStyle` / `HapticNotificationType` types live in `@flighthq/types`, correct per the header-layer rule.
- Robust fallback semantics: web backend guards for `navigator.vibrate` and `try/catch`es the call, returning `false` rather than throwing — the correct sentinel discipline for an unavailable host. The notification/impact web approximations (duration/pattern per style) are a sensible coarse emulation.
- Colocated test covers every exported function, the fake-backend forwarding path, and the jsdom-unavailable path.

## Gaps vs an authoritative haptics library

These are present in mature haptics APIs (iOS/Android/Capacitor/Web Vibration) and are missing here — the gap between "solid" and "authoritative":

- **Pattern vibration.** The Web Vibration API and Android both accept a pattern array (`navigator.vibrate([100, 50, 100])`, `VibrationEffect.createWaveform`). The web backend already builds patterns internally for `notification`, but there is no public `vibrateDevicePattern(pattern: readonly number[])`. This is the single most conspicuous omission — the underlying primitive is right there and unexposed.
- **Cancel / stop.** No `cancelDeviceVibration()`. `navigator.vibrate(0)` and Android `cancel()` are the canonical way to stop an in-progress vibration; mature libraries expose it.
- **Availability query.** No `isHapticsSupported()` / `hasHapticsBackend()` boolean. Callers currently must trigger and inspect the `false` return to learn support, which conflates "unsupported" with "denied/failed." A `has*`/`is*` predicate is standard (Capacitor exposes capability checks; UIKit callers gate on device class) and matches the codebase's own `has*`/`is*` convention.
- **Impact intensity / sharpness.** iOS 13+ `UIImpactFeedbackGenerator(intensity:)` and Core Haptics expose a continuous intensity/sharpness parameter; the three discrete styles are the floor, not the ceiling, of the modern API. Reasonable to defer, but a full-featured library names it.
- **Generator prepare / warm-up.** `UIFeedbackGenerator.prepare()` reduces latency before a burst of feedback. A `prepareHaptics()` no-op-on-web seam would round out fidelity to the platform reference; defensible to omit.
- **Custom haptic patterns / Core Haptics-style events** (transient vs continuous, AHAP-like descriptors). Genuinely advanced; reasonably out of scope for a v1 and arguably missing-by-design given the "coarse web approximation" framing.

Of these, pattern vibration, cancel, and an availability predicate read as missing-by-omission (each is a small, obviously-canonical addition with the primitive already at hand). Intensity, prepare, and Core-Haptics events are more plausibly missing-by-design for now.

## Naming / API-shape notes

- Naming is excellent and globally self-identifying: `triggerHapticImpact`, `vibrateDevice`, `triggerHapticSelection` all carry their full domain noun and read unambiguously from a barrel. Verbs (`trigger*`, `vibrate*`) are well chosen.
- The `trigger*` prefix for the semantic cues but `vibrate*` for the raw pulse is a defensible split (semantic feedback vs. literal motor control). If a `vibrateDevicePattern` is added it slots cleanly alongside `vibrateDevice`.
- Backend seam shape (`create*` / `get*` / `set*`) is consistent with the platform-suite command-capability pattern described in the codebase map. No top-level side effects; `"sideEffects": false`; lazy default. All correct.
- Sentinel discipline (`false` on unavailable/denied, never throw) matches the project rule.
- An availability predicate, if added, should be `isHapticsSupported()` or `hasHapticsBackend()` to match the `is*`/`has*` boolean-prefix rule.

## Recommendation

Treat as **solid**, close to authoritative for its narrow domain. To reach AAA completeness, add the three high-confidence, low-cost functions whose primitives already exist:

1. `vibrateDevicePattern(pattern: readonly number[]): boolean` — expose the pattern path the web backend already builds internally; add `vibratePattern` to `HapticsBackend`.
2. `cancelDeviceVibration(): boolean` — `navigator.vibrate(0)` on web; `cancel` method on the backend.
3. `isHapticsSupported(): boolean` (or `hasHapticsBackend()`) — distinguishes unsupported from denied without firing feedback.

Then consider, as a clearly-scoped follow-up, impact intensity (`triggerHapticImpact(style, intensity?)`) and a `prepareHaptics()` warm-up seam for parity with `UIFeedbackGenerator`. Core-Haptics-style custom event descriptors can stay deferred and surfaced as a suggestion rather than built autonomously. With the first three added, this package would credibly read as an authoritative haptics cell.
