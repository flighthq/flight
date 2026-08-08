---
package: '@flighthq/haptics'
updated: 2026-08-08
by: principal
---

# haptics — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/haptics/src/`, `packages/types/src/Haptics.ts`, and the
`host-*` packages on 2026-08-08. Most of what the old log carried had closed; what remains is one
design-gated tier and its dependents.

- **The custom-event tier does not exist in any form.** `HapticEvent`, `HapticPattern`, and
  `HapticPlayer` appear nowhere in `packages/` — not even as types — so `playHapticPattern`, the live
  continuous player (`create*` / `start*` / `stop*` / `setHapticPlayerParameters` / `destroy*`), and an
  AHAP-importing `@flighthq/haptics-formats` neighbor are all blocked on one prior decision: the
  transient/continuous event model and how a pattern down-converts to the web's duration-only motor.
  Design surface, not effort — do not build it autonomously.
- **`customEvents` is a capability flag ahead of its feature.** Both backends report it false
  (`haptics.ts:24`, `host-capacitor/src/capacitorHaptics.ts:28`), which is accurate but describes a
  capability nothing in the API can request yet.
- **No signals group.** `enableHapticsSignals` does not exist, and cannot mean anything until a live
  player or a native backend reports pattern completion.
- **The native backend proves the seam only for the triggers.** `createCapacitorHapticsBackend` fires
  each async Capacitor call and returns `true` for "request issued" rather than "haptic played", folds
  five impact styles onto Capacitor's three, ignores the `intensity` argument entirely, and reports
  false for `cancel` and `vibratePattern` (`host-capacitor/src/capacitorHaptics.ts:9-15`). So
  `triggerHapticImpact`'s intensity parameter and `vibrateDeviceWaveform` are still unexercised
  against a real device.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: "native backend
  reference — belongs in a `host-*` package … natural final step once the full seam exists" and the
  matching suggestion to wire an Electron stub. A real adapter exists —
  `createCapacitorHapticsBackend` (`host-capacitor/src/capacitorHaptics.ts:16`) — and what it cannot
  express is recorded above instead. Also dropped the score bookkeeping, the pre-release "breaking
  interface change" worry, and the `triggerHapticImpactIntensity` musing (the overload shipped at
  `haptics.ts:93` with no reported friction).
- **2026-06-25** — No code change; confirmed the Recommended section was empty and everything left is
  design-gated or cross-package.
- **2026-06-24** — Bronze + Silver landing: `cancelDeviceVibration`, `isHapticsSupported`,
  `vibrateDevicePattern`, `prepareHaptics`, out-param `getHapticsCapabilities`, optional impact
  intensity, `vibrateDeviceWaveform` with a `vibratePattern` fallback, and the `'rigid'` / `'soft'`
  impact styles.
