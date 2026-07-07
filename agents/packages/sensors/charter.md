---
package: '@flighthq/sensors'
crate: flighthq-sensors
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sensors — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/sensors` is the device-sensors capability of the platform-integration suite: a single event entity (`Sensors`) that exposes live motion, orientation, and environment streams over a swappable web/native `SensorsBackend`. Today it spans 11 streams (accelerometer-with-gravity, gyroscope/rotation-rate, linear acceleration, gravity, magnetometer, orientation, absolute orientation, quaternion, ambient light, barometer, proximity), value-typed `*Reading` allocators, per-sensor availability (`has*`/`isSensorsSupported`) and permission introspection, and a set of quaternion/Euler/gravity/world-frame conversion helpers. Readings are plain data, scratch-reused in the hot path — listeners must copy values to outlive the callback.

## Decisions

- **[2026-07-02] Fix: dead ternary at line 742.** Both branches of a ternary expression produce identical results. Fix as a bug — determine the intended distinct behavior or collapse to the single expression.
- **[2026-07-02] Fusion math placement is an open direction.** Six fusion-math helpers (`getRotationMatrixFromQuaternion`, `getQuaternionFromOrientationReading`, `getEulerFromQuaternion`, `getGravityFromOrientation`, `getScreenRelativeOrientation`, `getWorldAccelerationFromDeviceAcceleration`) may belong in `@flighthq/geometry` or `@flighthq/math`. Decision deferred — they speak `*Reading` types, which argues for staying here, but the generic quaternion/matrix/Euler core could live in geometry. Evaluate when the Rust crate is scoped.

## Open directions

- Fusion math homing: keep all 6 helpers here (they speak `*Reading`), or extract generic quaternion/matrix/Euler core to `geometry`/`math` and keep only `*Reading`-typed wrappers.
- `accuracy`/`timestamp`/`rate` fields are plumbed but inert on web — bless as native-only or source `timestamp` from `Event.timeStamp`.
- Whether 11 signal slots warrant an `enableSensorsSignals` tree-shaking gate (pending `npm run size` measurement).
- Per-sensor permission granularity: `getSensorsPermissionState` collapses `'motion'`/`'orientation'` to the same web Permissions-API name.
