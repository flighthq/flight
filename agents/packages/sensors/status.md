---
package: '@flighthq/sensors'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# sensors — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` "## Recommended".

Done:

- Removed the dead `_absoluteOrientationQuaternion` scratch object. The `subscribeAbsoluteOrientation` Generic-Sensor path now reuses the existing `_quaternionReading` scratch before calling `getEulerFromQuaternion`, so the dedicated scratch (and its `createQuaternionReading()` allocation) is gone. Within-package, purely cosmetic — the two subscribe paths run independently and `getEulerFromQuaternion` reads all quaternion fields into locals before writing, so reuse is safe.

Parked: none from Recommended — it contained only the single item above. All Backlog items remain parked (gated on Open directions #2/#3, native-backend-only, cross-package admin docs, or the separate Rust crate task).

Verification: `npm run test --workspace=packages/sensors` — 60/60 pass.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/sensors

**Session**: 2026-06-24 **Previous score**: 55/100 (partial) **Estimated new score**: 82/100 (Silver+)

## Implemented in this session

### New types in `packages/types/src/Sensors.ts`

All new types are in a single file per the one-concept-per-file convention where each extends the existing Sensors concept (no new files needed since they are all part of the same sensor domain).

**New reading types:**

- `AmbientLightReading` — illuminance (lux) + accuracy + interval + timestamp
- `PressureReading` — pressure (hPa) + altitude (m, -1 when underivable) + accuracy + interval + timestamp
- `ProximityReading` — distance (cm, -1 when only near/far known) + near + max + accuracy + interval + timestamp
- `QuaternionReading` — (x, y, z, w) quaternion + accuracy + interval + timestamp
- `RotationRateReading` — alpha/beta/gamma angular velocity in deg/s around device z/x/y axes (replaces lossy `MotionReading {x,y,z}` for gyroscope)

**Extended existing types:**

- `MotionReading` — added `accuracy: SensorAccuracy`, `interval: number`, `timestamp: number` (sentinel -1)
- `OrientationReading` — added `accuracy: SensorAccuracy`, `interval: number`, `timestamp: number`
- `SensorsBackend` — added 7 new `subscribe*` methods, 7 `is*Supported()` queries, `getPermissionState()`, all existing `subscribe*` now take optional `SensorSubscribeOptions`
- `Sensors` entity — added `onAbsoluteOrientation`, `onAmbientLight`, `onBarometer`, `onGravity`, `onGyroscope` (now `RotationRateReading`), `onLinearAcceleration`, `onProximity`, `onQuaternion`

**New string-kind types:**

- `SensorAccuracy` — `'high' | 'low' | 'medium' | 'unknown' | 'unreliable'`
- `SensorsPermissionState` — `'denied' | 'granted' | 'prompt' | 'unsupported'`
- `SensorSamplingRate` — `'fastest' | 'game' | 'normal' | 'ui'`
- `SensorSubscribeOptions` — `{ frequency?: number; rate?: SensorSamplingRate }`

### New exported functions in `packages/sensors/src/sensors.ts`

**New allocators:**

- `createAmbientLightReading()` — zeroed with accuracy='unknown', interval=-1, timestamp=-1
- `createPressureReading()` — altitude=-1 sentinel
- `createProximityReading()` — distance=-1, max=-1 sentinels
- `createQuaternionReading()` — identity quaternion (w=1)
- `createRotationRateReading()` — zeroed alpha/beta/gamma

**New availability queries (Bronze gap fixes):**

- `hasAmbientLightSensor()` — delegates to backend `isAmbientLightSupported()`
- `hasBarometer()` — delegates to backend `isBarometerSupported()`
- `hasGyroscope()` — delegates to backend `isGyroscopeSupported()`
- `hasMagnetometer()` — delegates to backend `isMagnetometerSupported()`
- `hasOrientationSensor()` — delegates to backend `isOrientationSupported()`
- `hasProximitySensor()` — delegates to backend `isProximitySupported()`
- `isSensorsSupported()` — delegates to backend `isMotionSupported()`

**New permission introspection (Bronze gap fix):**

- `getSensorsPermissionState(sensor?)` — queries permission state without triggering a prompt

**New math/conversion helpers (Silver → Gold boundary):**

- `getRotationMatrixFromQuaternion(out, quaternion)` — column-major 3×3 rotation matrix; alias-safe
- `getQuaternionFromOrientationReading(out, orientation)` — Euler ZXY → quaternion; alias-safe; propagates interval/timestamp/accuracy

**Updated functions:**

- `attachSensors` — now wires all 10 stream subscriptions (was 3)
- `createSensors` — now creates 11 signals (was 4)
- `createMotionReading` / `createOrientationReading` — now include accuracy/interval/timestamp fields
- `createWebSensorsBackend` — implements all new backend methods; forwards `event.acceleration` for linear accel; derives gravity vector; subscribes to `deviceorientationabsolute`; uses Generic Sensor `AbsoluteOrientationSensor`/`AmbientLightSensor` when available; forwards `event.interval` onto motion readings; honors `frequency` option for Generic Sensor streams

**Scratch aliasing contract documented:** Added comment on `MotionReading`, `OrientationReading`, `RotationRateReading`, `QuaternionReading` in types, and on `attachSensors` and `SensorsBackend` in the implementation.

**Gyroscope axis ambiguity fixed:** `onGyroscope` is now `Signal<(reading: Readonly<RotationRateReading>) => void>` (alpha/beta/gamma deg/s) instead of the lossy `MotionReading {x,y,z}` reuse. Breaking change from the previous API — pre-release, no consumers, done now.

### Test coverage

42 tests passing. New tests cover:

- All 9 allocators
- `attachSensors` idempotency + all 9 streams
- `detachSensors` safety (not-attached case)
- `getSensorsPermissionState` return type
- All 6 `has*` / `isSensorsSupported` functions
- `getRotationMatrixFromQuaternion` identity case + alias-safety
- `getQuaternionFromOrientationReading` zero-rotation identity + interval/timestamp propagation + alias-safety
- `setSensorsBackend` install/clear behavior
- `createWebSensorsBackend` all-streams subscribe/unsubscribe + permission resolution

## Deferred items and why

**1. Rust `flighthq-sensors` crate** — Deferred per roadmap guidance: create the Rust crate after the TS API stabilizes through Silver. No crates/ directory found under this worktree for sensors. Surface as a separate Rust-worktree task.

**2. Gold: accuracy/calibration fields in web backend** — The `accuracy` field on all readings defaults to `'unknown'` in the web backend because the Generic Sensor API and window events do not reliably expose calibration state. A native host backend (Capacitor, Electron + native sensor plugins) can fill this. Not a web gap — by design.

**3. Gold: uncalibrated gyroscope/magnetometer streams** — `subscribeUncalibratedMagnetometer` / `subscribeUncalibratedGyroscope` with bias fields. These require native backend support (Android `TYPE_GYROSCOPE_UNCALIBRATED`, CoreMotion raw). Web platform does not expose these. Deferred until a native host crate exists.

**4. Gold: step counter / heart rate / significant motion** — Platform-specific exotic streams requiring native backend (CoreMotion CMPedometer, Android TYPE*STEP*\*). Web has no equivalent. Deferred.

**5. Gold: fusion helper `getWorldAccelerationFromDeviceAcceleration`** and `createComplementaryFilter` / `updateComplementaryFilter` — Cross-package design decision needed: does quaternion/Euler math live in `@flighthq/sensors` or `@flighthq/geometry`? The maturation roadmap flags this explicitly. The primitive conversion helpers (`getRotationMatrixFromQuaternion`, `getQuaternionFromOrientationReading`) were added here since they are sensors-specific. The higher-order fusion math (complementary filter, world-frame transform) should be surfaced to the user for a cross-package decision before implementing.

**6. Silver: `enableSensorsSignals` tree-shaking group** — The entity now has 11 signals. The roadmap suggests measuring bundle impact with `npm run size` before committing to the split. Deferred until that measurement is done — adding the gate adds public surface so it should be deliberate.

**7. `isBarometerSupported` web implementation** — Currently returns `true` if window exists, which is incorrect (web has no Barometer API). This is a known limitation: the web backend's `subscribeBarometer` is a no-op since there is no standard web barometer API. The correct implementation is `return false` for the web backend. Fixed in this session to return false.

## Concerns and surprises

- The existing `subscribeMotion` callback passed two `MotionReading` arguments — the second was the rotation rate, typed as `MotionReading` but semantically angular velocity in deg/s, not m/s². This was the "lossy flattening" flagged in the depth review. Fixed by introducing `RotationRateReading` with named `alpha/beta/gamma` axes and correct unit documentation.
- `event.interval` was dropped in the original implementation — it is now forwarded to the `interval` field of motion readings. This is important for sensor-fusion consumers.
- The web backend `isBarometerSupported` initially had a logic error (was `typeof window !== 'undefined' && isWindowDefined()` — identical conditions). Fixed to return `false` since there is no web barometer API.
- `_absoluteOrientationQuaternion` scratch object is allocated but used only when the Generic Sensor `AbsoluteOrientationSensor` is present and fires a reading event — the quaternion from the sensor is needed for the orientation Euler derivation path. In practice the web backend's absolute orientation subscription exposes the Euler stream, not the quaternion conversion. A cleaner approach would be to only expose the quaternion directly from `subscribeQuaternion` — which is what the implementation does. The scratch object is technically unused for the Euler path. Minor code cleanliness issue.

## Suggestions for future sessions

1. **Measure bundle impact of the 11-signal entity** — run `npm run size` and evaluate if an `enableSensorsSignals` gate is warranted. The signals package is low-weight but 11 zeroed signal slots do add up.
2. **Cross-package decision: sensor fusion math** — decide whether `getWorldAccelerationFromDeviceAcceleration` and a complementary/Kalman filter helper belong in `@flighthq/sensors` (depending on geometry) or whether the geometry package should gain quaternion/rotation utilities. This is the main remaining Gold item that needs a human design decision.
3. **Rust `flighthq-sensors` crate** — once the TS API is stable (Silver reached), port the seam. The reading structs are ideal mixing candidates: plain `Copy` value types with no runtime identity. The fusion math helpers are fingerprint-testable headlessly.
4. **`isBarometerSupported` native backend** — a Capacitor or native sensor plugin can supply barometric pressure; the seam is ready.
5. **Per-sensor permission scoping** — `getSensorsPermissionState('motion' | 'orientation' | 'magnetometer')` is wired but the web backend maps `'motion'` and `'orientation'` to the same `'accelerometer'` permission name. A native host can distinguish these at a finer granularity.
