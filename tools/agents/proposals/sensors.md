---
id: sensors
title: '@flighthq/sensors'
type: depth
target: sensors
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/sensors.md
  - tools/agents/docs/reviews/depth/sensors.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — 55/100. A competent, idiomatic thin event seam over four inertial/orientation streams that omits the derived inertial streams (linear acceleration, gravity), several canonical Generic-Sensor streams (light, proximity, barometer), rate control, and availability/permission introspection.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that delivers 80% of inertial-sensor value: the gravity-free acceleration stream, support/permission introspection so silent no-ops become detectable, and a fix for the gyroscope axis/unit ambiguity. Shippable but basic.

- **Types first** (`@flighthq/types/Sensors.ts`):
  - `RotationRateReading { alpha: number; beta: number; gamma: number }` — replaces the lossy reuse of `MotionReading {x,y,z}` for `onGyroscope` (deg/s, not m/s²). Document the unit and frame in the type comment.
  - Add `interval: number` (sample interval in ms, `-1` when unknown) and `timestamp: number` (`-1` when unknown) to `MotionReading` and `OrientationReading`. Sensor-fusion consumers need at least an interval; the web `devicemotion` event already carries `interval` and it is currently dropped.
  - Extend `SensorsBackend` with `subscribeLinearAcceleration(listener)` and `subscribeGravity(listener)` (both `Readonly<MotionReading>`), plus `isMotionSupported(): boolean`, `isOrientationSupported(): boolean`, `isMagnetometerSupported(): boolean`.
  - Add `onLinearAcceleration` and `onGravity` signals to the `Sensors` entity; retype `onGyroscope` to `Signal<(reading: Readonly<RotationRateReading>) => void>`.
- **Implementation** (`packages/sensors/src/sensors.ts`):
  - `createRotationRateReading()` — zeroed allocator alongside `createMotionReading`/`createOrientationReading`.
  - Web backend: forward `event.acceleration` (gravity-removed) to `onLinearAcceleration`; forward `event.interval` onto the motion readings; derive a gravity vector (`accelerationIncludingGravity - acceleration`) into `onGravity` when both are present, else no-op.
  - `isSensorsSupported(): boolean` (free function over the backend) and per-stream `hasAccelerometer()` / `hasGyroscope()` / `hasMagnetometer()` / `hasOrientation()` so callers distinguish "no device" from "silently no-op." Web backend implements via `'DeviceMotionEvent' in window`, `typeof Magnetometer !== 'undefined'`, etc.
  - `getSensorsPermissionState(): Promise<PermissionState>` (`'granted' | 'denied' | 'prompt' | 'unsupported'` — a `*Kind`-style string set in `@flighthq/types`) over `navigator.permissions.query` where available, resolving `'granted'` when ungated, without triggering a prompt.
- **Tests**: cover the new allocators, the linear-acceleration/gravity forwarding, the support queries (window present vs absent), and the aliased-`out` scratch contract. Document on `Sensors`/`SensorsBackend` that readings are scratch-reused and must not be retained across callbacks (the depth review flagged this aliasing contract as undocumented).

### Silver

Competitive with a good Generic-Sensor / Capacitor-Motion-class library: configurable sampling rate, the full orientation model (absolute vs relative as distinct streams, quaternion + rotation matrix), and the environmental streams users expect bundled. Covers common professional use and cross-backend consistency.

- **Sampling-rate control** (the most-requested missing knob):
  - `SensorSamplingRate` string-kind in `@flighthq/types`: `'ui' | 'normal' | 'game' | 'fastest'` (mirrors Android `SensorManager` rate hints), plus an explicit numeric `frequency` escape hatch.
  - Add an optional `options?: Readonly<SensorSubscribeOptions>` (`{ frequency?: number; rate?: SensorSamplingRate }`) to every `subscribe*` on `SensorsBackend`. Web backend maps `frequency` to the Generic Sensor `{ frequency }` constructor option; degrades to the event-driven default for the `devicemotion`/`deviceorientation` window streams (document that window events ignore rate).
- **Full orientation model** (resolve the absolute-vs-relative gap and the Euler-only limitation):
  - `QuaternionReading { x: number; y: number; z: number; w: number }` and a `RotationMatrixReading` (`readonly number[]` length 9, or a `Float32Array`-backed value type) in `@flighthq/types`.
  - Split orientation into `subscribeAbsoluteOrientation` / `subscribeRelativeOrientation` on the backend (web: `deviceorientationabsolute` vs `deviceorientation`, and Generic Sensor `AbsoluteOrientationSensor` vs `RelativeOrientationSensor`); keep `onOrientation` as the relative default for source compatibility and add `onAbsoluteOrientation`.
  - `onQuaternion` signal + `subscribeQuaternion` (from `*OrientationSensor.quaternion`), with `createQuaternionReading()` allocator and `getRotationMatrixFromQuaternion(out, quaternion)` / `getQuaternionFromOrientation(out, orientation)` out-param converters for consumers that need the matrix or have only Euler data.
- **Environmental streams** (canonical Generic Sensor members):
  - `subscribeAmbientLight` → `onAmbientLight` carrying `AmbientLightReading { illuminance: number }` (lux), web over `AmbientLightSensor`.
  - `subscribeProximity` → `onProximity` carrying `ProximityReading { distance: number; near: boolean; max: number }` (`distance`/`max` `-1` when only near/far is known).
  - `subscribeBarometer` → `onBarometer` carrying `PressureReading { pressure: number; altitude: number }` (hPa / meters, `altitude` `-1` when underivable), web over `pressure`/native `CMAltimeter`/Android pressure.
  - Corresponding `createAmbientLightReading()` / `createProximityReading()` / `createPressureReading()` allocators and `has*` support queries.
- **Per-sensor permission**: extend `getSensorsPermissionState` / `requestSensorsPermission` to accept an optional `SensorKind` so motion, magnetometer, and Generic-Sensor (`'accelerometer'`/`'gyroscope'`/`'magnetometer'`/`'ambient-light-sensor'`) permissions can be queried independently rather than under one motion gate.
- **Signals opt-in group**: if the entity grows past a handful of signals, gate the heavier streams behind an `enableSensorsSignals`-style group so unused streams tree-shake (per the signals `enable*` convention). Verify with `npm run size`.

### Gold

Authoritative / AAA: the canonical device-sensors reference. Exhaustive coverage, sensor fusion utilities, accuracy/calibration, performance, full edge/error handling, and 1:1 Rust-port parity.

- **Accuracy & calibration**:
  - `accuracy: SensorAccuracy` field (`'unreliable' | 'low' | 'medium' | 'high' | 'unknown'` string-kind) on every reading type, mapping Android `SensorManager` accuracy and CoreMotion calibration state; magnetometer-needs-calibration signalling.
  - `subscribeUncalibratedMagnetometer` / `subscribeUncalibratedGyroscope` (raw + bias) — native suites expose calibrated and uncalibrated variants; carry a `bias: MotionReading` field.
  - `subscribeStepCounter` / `subscribeStepDetector` / `subscribeSignificantMotion` and `subscribeHeartRate` where the platform exposes them (CoreMotion `CMPedometer`, Android `TYPE_STEP_*` / `TYPE_HEART_RATE`) — guarded, sentinel-returning on the web.
- **Sensor fusion helpers** (free, out-param math; the value-typed leaf that is also a Rust _mixing_ candidate):
  - `getEulerFromQuaternion(out, quaternion)`, `getGravityFromOrientation(out, orientation)`, `getWorldAccelerationFromDeviceAcceleration(out, acceleration, orientation)` (rotate device-frame accel into world frame), and a `createComplementaryFilter()` / `updateComplementaryFilter(filter, gyro, accel, dt, out)` for accel+gyro fusion. These compose with `@flighthq/geometry` matrices/quaternions — surface a design-decision item on whether quaternion math lives here or in `@flighthq/geometry`.
- **Coordinate-frame convention**: a documented, tested screen-vs-device frame model and a `getScreenRelativeOrientation(out, orientation, screenAngle)` that compensates for `screen.orientation.angle`, since raw `deviceorientation` is frame-of-device, not frame-of-screen.
- **Performance & robustness**: throttling/decimation hint honored end-to-end, batched delivery option for high-frequency native streams, full no-window / no-permission / sensor-revoked-mid-stream handling with `onError`-style sentinel reporting (not throwing), and exhaustive tests including aliased-`out`, denied permission, mid-stream unsubscribe, and every degraded path.
- **Docs**: a sensors example (and a functional test if a deterministic synthetic backend is wired) demonstrating verbose register → attach → read → detach flow, the scratch-aliasing contract, and the fusion helpers.
- **Rust parity**: a `flighthq-sensors` crate mirroring the seam — `SensorsBackend` trait + `set_sensors_backend`, snake_case free functions (`create_motion_reading`, `subscribe_linear_acceleration`, `get_rotation_matrix_from_quaternion`), reading structs as plain `Copy` value types, `Option`/`bool` sentinels, native default backend gated behind the `native` cargo feature (winit/SDL raw sensor input where available), and the fusion math as a value-typed mixing-eligible module. Cells added to the conformance map; the math helpers fingerprint-tested headlessly.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze, types-first** (low effort, high value). Land all Bronze type changes in `@flighthq/types/Sensors.ts` in one pass — `RotationRateReading`, `interval`/`timestamp`, the linear-accel/gravity backend methods, support queries, `SensorsPermissionState` kind — then implement and test. This is the single highest-value increment and unblocks everything else. The `onGyroscope` retype from `MotionReading` to `RotationRateReading` is a breaking type change, but pre-release with no consumers makes it free; do it now rather than later.
2. **Silver rate control** before the new streams, so every Silver `subscribe*` is born with the `options` argument and there is no second sweep to add it. This is a `SensorsBackend` signature change across all methods — batch it.
3. **Silver orientation model + environmental streams** (medium effort). Independent of each other; orientation (quaternion/absolute split) is higher value than light/proximity/barometer for graphics/AR consumers, so order it first. Each new stream is a repeatable type + allocator + backend method + signal + `has*` quartet — mechanical once the pattern is set.
4. **Signals tree-shaking decision** (design item to surface): once the entity carries ~10 signals, decide whether to gate streams behind `enableSensorsSignals`-style groups. Measure with `npm run size` before committing to the split — it adds public surface, so only do it if the unused-stream weight is real.
5. **Gold fusion math — cross-package design decision to surface**: quaternion/matrix/Euler conversion overlaps `@flighthq/geometry`. Decide whether fusion helpers live in `@flighthq/sensors` (domain-local, depends on geometry) or whether the primitive quaternion math belongs in `@flighthq/geometry` with only sensor-specific fusion here. Raise this before writing the helpers; it affects the Rust mixing story (the math module is the value-typed, fingerprint-able leaf).
6. **Gold accuracy/calibration + exotic streams** (high effort, platform-dependent). Largely native-backend work; the web backend returns sentinels. Defer until a real native host (`host-*`) exists to validate the seam.
7. **Rust `flighthq-sensors` crate** last, mirroring the matured TS seam 1:1. No Rust crate exists yet; create it once the TS API has stabilized through Silver so the port does not chase a moving seam. Surface as a separate Rust-worktree task with conformance-map entries.

Cross-package touchpoints: `@flighthq/types` (every tier, first), `@flighthq/signals` (`enable*` group if added), `@flighthq/geometry` (Gold fusion math), and the future `flighthq-sensors` Rust crate. No `-formats` neighbor package is warranted — sensors stream live data, they do not parse file formats.

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

> Build `@flighthq/sensors` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
