---
package: '@flighthq/haptics'
crate: flighthq-haptics
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# haptics — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Haptic feedback as a platform-integration cell — the smallest package in the UI/shell group (13 exports). Covers device vibration and semantic tactile cues: impact (`heavy | light | medium | rigid | soft` with optional continuous intensity), notification (`error | success | warning`), and selection, plus raw vibration, Web-Vibration pattern arrays, amplitude-aware waveforms (Android `VibrationEffect`), capability query, support predicate, cancel, and a prepare warm-up hint. Everything routes through a swappable `HapticsBackend` with a lazily-created web default over `navigator.vibrate`. The boundary against neighbors: haptics owns "buzz the motor" and named feedback generators; it does not own app/dock badge (`@flighthq/app`) or motion sensors (`@flighthq/sensors`).

## Decisions

- **[2026-07-02] Fix `triggerHapticImpact` default intensity.** The function documents "intensity defaults to 1" but passes `undefined` to the backend. Fix to actually pass the documented default value of `1`.

## Open directions

1. **Advanced tier scope.** Is `HapticPattern` + a live continuous-haptic player in scope, or is haptics intentionally the coarse trigger/vibration cell with Core-Haptics-grade authoring out of scope? This gates the player, the signals group, and a potential `-formats` neighbor (AHAP import).
2. **Down-conversion contract.** If patterns are in scope, what is the agreed degradation of a rich `HapticPattern` to web's duration/amplitude motor?
