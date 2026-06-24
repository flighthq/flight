---
package: '@flighthq/sensors'
crate: flighthq-sensors
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sensors — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/sensors` is the device-sensors capability of the platform-integration suite: a single event entity (`Sensors`) that exposes live motion, orientation, and environment streams over a swappable web/native `*Backend`. It is an **event-style** capability — `createSensors` / `attachSensors` / `detachSensors` / `disposeSensors` plus a `Sensors` entity of signals — paired with a **command-style** seam (`getSensorsBackend` / `setSensorsBackend` / `createWebSensorsBackend`) for availability, permission, and sampling-rate control.

Today it spans 11 streams (accelerometer-with-gravity, gyroscope/rotation-rate, linear acceleration, gravity, magnetometer, orientation, absolute orientation, quaternion, ambient light, barometer, proximity), value-typed `*Reading` allocators, per-sensor availability (`has*`/`isSensorsSupported`) and permission (`requestSensorsPermission`/`getSensorsPermissionState`) introspection, and a set of quaternion/Euler/gravity/world-frame conversion helpers.

Where it ends and a neighbor begins:

- **vs. `@flighthq/input`** — `input` normalizes user-intent inputs (pointer/keyboard/gamepad); `sensors` reports physical-device measurements. A raw stream of device motion is not a user input.
- **vs. `@flighthq/device`** — `device` is _static_ identity (model, OS, memory, safe-area insets); `sensors` is _live_ measurement. Battery and other live concerns live in their own event cells (`power`), not here.
- **vs. `@flighthq/geometry`/math** — the open boundary (see Open directions): the package currently homes quaternion/Euler/gravity/world-frame math here as `*Reading`-typed helpers rather than in a generic math package.

## North star (proposed)

_Inferred from the design + the platform-suite forks. Edit; promote anything you bless into Decisions._

- **One backend seam, web default, native swap.** Every capability is a flat function over a swappable `SensorsBackend`; the web/DOM backend is always lazily available so every function works on the web, and a native host replaces it via `setSensorsBackend`. "Native sensor support" is one backend, not a coupling. This is the platform-suite pattern, matched exactly (`@flighthq/application` window wiring; the platform command/event quartet).
- **Honest degradation, never throw.** A web backend guards every API and returns sentinels (`false`, `-1`, `'unsupported'`, identity quaternion, no-op unsubscribe) when a sensor is unavailable, rather than throwing. Availability (`has*`/`isSensorsSupported`) and permission state are first-class so callers can ask before subscribing.
- **Value-typed readings, scratch-reused in the hot path.** Readings are plain `*Reading` data (packed/value fields, documented sentinels), reused as scratch objects across the listener path; listeners must copy values to outlive the callback. This keeps the stream allocation-free and is what makes the leaf crate an ideal first Rust conformance/mixing target.
- **`@flighthq/types`-first header discipline.** Every reading, the backend trait, the entity, and the option/permission/accuracy enums are defined in `@flighthq/types` and implemented against; the full API shape is navigable from the header alone.
- **Sensors-shaped surface.** Conversions and queries speak the sensor vocabulary (`OrientationReading`, `RotationRateReading`, `QuaternionReading`), not generic matrices/vectors — the package reads as a mature device-sensors library, not a math grab-bag.

## Boundaries (proposed)

_In scope / non-goals, drawn from the review and the neighboring cells. Edit before blessing._

**In scope (proposed):**

- Live device-sensor streams: motion (accel/linear/gravity/gyro), orientation (relative/absolute/quaternion/magnetometer), and environment (ambient light, barometer, proximity).
- Per-sensor availability introspection, permission query/request, and a sampling-rate/frequency hint on the subscribe seam.
- The event-entity lifecycle (`create`/`attach`/`detach`/`dispose`) and the command backend seam (`get`/`set`/`createWeb`).

**Non-goals / open (proposed — several are live questions, see Open directions):**

- User-intent inputs (pointer/keyboard/gamepad) — `@flighthq/input`.
- Static device identity and battery/power — `@flighthq/device`, `@flighthq/power`.
- Native-only exotic streams (step counter, pedometer, heart rate, significant-motion, uncalibrated gyro/mag) — correctly deferred to a native backend; no web equivalent.
- Whether generic quaternion/Euler/matrix math belongs here at all (vs. `geometry`/math) is an Open direction, not a settled non-goal.

## Decisions

None blessed yet.

## Open directions

_Every candidate question this review surfaced, plus the structural forks that touch this package. An agent **asks** here rather than assuming._

1. **Where does sensor-fusion math live — `sensors` or `geometry`/math?** This session homed six quaternion/Euler/gravity/world-frame helpers (`getRotationMatrixFromQuaternion`, `getQuaternionFromOrientationReading`, `getEulerFromQuaternion`, `getGravityFromOrientation`, `getScreenRelativeOrientation`, `getWorldAccelerationFromDeviceAcceleration`) here — an **implicit, shipped** cross-package call the codebase map says to surface, not act on. Ratify homing them in `sensors` (they speak `*Reading`, not generic `Matrix`/`Vector3`), or move the generic core (quaternion↔matrix↔Euler) to `geometry`/math and keep only the `*Reading`-typed wrappers here. This is the package's central undecided boundary and the gate on the Rust crate.
2. **Bless the breaking `onGyroscope` reshape** (`MotionReading` → `RotationRateReading`, named alpha/beta/gamma deg/s axes). Correct under the pre-release no-back-compat rule, but it is a Decision-ledger-worthy ruling that currently lives only in a worker status doc. Promote it to a Decision so it is not re-litigated.
3. **Is `accuracy`/`timestamp`/`rate` a charter Boundary (native-only by design) or a web gap?** Three fields are plumbed through types but inert/unconsumed on the web backend: `accuracy` is always `'unknown'`, `timestamp` is always `-1` (even though DOM `Event.timeStamp` is available), and the `rate` hint (`'ui'|'normal'|'game'|'fastest'`) is accepted by every `subscribe*` but read nowhere (web maps only `frequency`). Decide whether the charter blesses these as native-only (then document the asymmetry at the type), or whether at least `timestamp` should be sourced from `Event.timeStamp` on web.
4. **`enableSensorsSignals` tree-shaking gate?** The entity allocates 11 signal slots unconditionally; the signals convention permits an opt-in `enable*` gate. Decide whether 11 inert signals warrant it — deferred pending an `npm run size` measurement.
5. **Per-sensor permission granularity.** `getSensorsPermissionState('motion'|'orientation'|'magnetometer')` exists, but the web mapping collapses `'motion'` and `'orientation'` to the same `'accelerometer'` Permissions-API name. Is finer per-sensor scoping a native-backend concern or a charter goal?
6. **Rust crate timing (fork D — Wasm mixing seam).** `crate: flighthq-sensors` is asserted in front-matter but unbuilt; the value-typed `*Reading` structs and pure conversion helpers are an ideal first conformance/mixing leaf (plain `Copy`, headlessly fingerprintable). Confirm the crate is correctly deferred until the TS API (notably the fusion-math homing in #1) stabilizes, and that the conformance map/register reflect "TS-only, crate pending."
7. **Stub triage (fork F).** The package has graduated from a thin four-stream seam to a near-complete library — confirm it is no longer a "stub" for triage purposes and that the Package Map line in `index.md` (still "accelerometer, gyroscope, device orientation") should be widened to the current 11-stream + fusion-math surface.
