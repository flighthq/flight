---
package: '@flighthq/haptics'
crate: flighthq-haptics
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# haptics — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Haptic feedback as a platform-integration cell: device vibration and semantic tactile cues — impact (`heavy | light | medium | rigid | soft`, with optional continuous intensity), notification (`error | success | warning`), and selection — plus raw vibration (`vibrateDevice`), Web-Vibration pattern arrays, amplitude-aware waveforms (Android `VibrationEffect`), a capability query (`getHapticsCapabilities` into an out-param), a support predicate, cancel, and a prepare warm-up hint. Everything routes through a swappable `HapticsBackend` with a lazily-created web default over `navigator.vibrate`; a native host replaces it via `setHapticsBackend`.

Where it ends: this is the coarse trigger/vibration tactile cell. It owns "buzz the motor" and the named iOS/Android-style feedback generators. It does **not** own the application/dock badge or attention (that is `@flighthq/app`), nor sensors that _read_ device motion (`@flighthq/sensors`), nor any non-haptic platform surface. Its neighbor on the advanced side is the still-undecided Core-Haptics-grade authoring tier (custom `HapticPattern` events, a live player, AHAP import) — see Open directions.

## North star (proposed)

_(Proposed, not blessed — edit or promote in a direction session.)_

- **The platform-suite command shape, exactly.** Flat free functions over a `HapticsBackend` seam with `createWebHapticsBackend` / `getHapticsBackend` / `setHapticsBackend`, a lazily-created web default, and no top-level side effects (`"sideEffects": false`). Haptics is one capability cell in the suite and should read identically to its siblings (clipboard, notification, screen).
- **Web is a faithful-but-coarse reference, never the ceiling.** The web backend guards every call and degrades honestly (a rich cue becomes a duration/pattern motor buzz); it proves the seam, but the seam is designed for a native host that does more, not trimmed to what `navigator.vibrate` can express.
- **Sentinels, never throws.** Absence or denial of haptics returns `false` / no-op everywhere — the suite-wide guarantee that platform code is always safe to call on any host.
- **Full, unabbreviated, domain-carrying names.** `triggerHapticImpact`, `vibrateDeviceWaveform`, `getHapticsCapabilities` — each self-identifying from the barrel, per the SDK design constraint.
- **Types live in `@flighthq/types` first.** `HapticImpactStyle`, `HapticNotificationType`, `HapticsCapabilities`, and the `HapticsBackend` interface are header surface; the package implements against them. Any advanced tier (`HapticPattern`, player) defines its types there first so the Rust port and a native backend mirror one shape.

## Boundaries (proposed)

_(Proposed, not blessed.)_

In scope:

- Raw vibration, pattern vibration, amplitude waveform.
- The recognized feedback-generator set — impact (full iOS 13+ style union), notification, selection.
- Capability query, support predicate, cancel, prepare warm-up.
- The web default backend and the `setHapticsBackend` native-host seam.

Open / undecided scope (deferred to Open directions, not asserted here): Core-Haptics-style custom `HapticEvent`/`HapticPattern` descriptors, a live continuous-haptic player, AHAP/JSON pattern import, and completion/state signals.

Non-goals:

- The app/dock badge, bounce, and attention requests (owned by `@flighthq/app`).
- Reading device motion/orientation sensors (owned by `@flighthq/sensors`).
- Bundling a concrete native host implementation — the seam lives here; the adapter is a `host-*` package.

## Decisions

None blessed yet.

## Open directions

Every question the review had to assume against. These are where a direction session decides:

1. **Where does the advanced tier stop?** Is `HapticPattern` + a live player in scope for this package's "authoritative," or is haptics intentionally the coarse trigger/vibration cell with Core-Haptics-grade authoring out of scope? This is the single most load-bearing boundary the charter is silent on, and it gates the player, the signals group, and the `-formats` neighbor.
2. **Down-conversion contract.** If patterns are in scope, what is the agreed degradation of a rich `HapticPattern` to web's duration/amplitude motor? This is a cross-cutting decision the types in `@flighthq/types` should encode before any player is built.
3. **`-formats` neighbor (structural-forks fork B / the subject triad).** Does AHAP/JSON import warrant `@flighthq/haptics-formats`? Per the triad's plurality guard a `-formats` cell needs ≥2 real formats to clear bedrock; AHAP alone may not — and it also requires the `HapticPattern` type first. A charter call, not an autonomous add.
4. **Completion signals.** Should `enableHapticsSignals` / `onHapticPatternComplete` / `onHapticPlayerStateChange` exist? Only meaningful once a live player and a backend that reports completion exist — gated on (1).
5. **`triggerHapticImpact(style, intensity?)` overload vs. a split function.** The optional-second- param choice has an alternative in a separate `triggerHapticImpactIntensity`. No consumer friction observed — record the overload as the blessed choice or leave open.
6. **Native backend reference home (structural-forks fork D — runtime backend seam).** Confirm a `host-*` (e.g. `host-electron`) is the right place to prove the seam generalizes, and treat the `HapticsBackend` interface as stabilized once one native backend exists. Until then the interface is unvalidated against any non-web host.
7. **Breaking-interface expectation for backend authors.** Extending `HapticsBackend` with required members (`cancel`/`capabilities`/`isSupported`/`vibratePattern`) is a breaking change for any direct implementer. Pre-release makes this fine today; if a `host-*` backend lands, record the interface-stability expectation as a Decision.
8. **Rust port timing (no `flighthq-haptics` crate yet).** Wait for the `HapticPattern` model to stabilize so the crate is mirrored once, or port the current coarse surface now? A sequencing call.
9. **Package Map line is understated.** `tools/agents/docs/index.md` still describes haptics as "vibration and impact/notification/selection feedback," predating pattern/waveform/capability/ prepare. A one-line refresh would match the shape — informational, the user's gate.
