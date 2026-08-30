---
package: '@flighthq/sensors'
updated: 2026-08-30
by: builder2
---

# sensors — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/sensors/src/sensors.ts` and `packages/types/src/Sensors.ts`
on 2026-08-08. Most of the old log's deferrals had already landed; what survives is below.

- **The public lane hands out `out` parameters with no way to allocate them.** `index.ts:3-8` exports
  all seven `compute*` functions — each taking `out: MotionReading | OrientationReading |
  QuaternionReading` — while every `create*Reading` allocator (`sensors.ts:235`, `:241`, `:247`,
  `:262`, `:268`, `:273`, `:279`) stays behind `./contract`. A `.`-lane app can call
  `computeEulerFromQuaternion` but cannot construct either argument.
- **`hasAccelerometer` and `isSensorsSupported` are the same function.** Both return
  `getSensorsBackend().isMotionSupported()` (`sensors.ts:598`, `:642`) and both sit on the `.` lane
  (`index.ts`). One of the two names should go.
- **`computeRotationMatrixFromQuaternion` writes into a bare `number[]`** (`sensors.ts:144`) — the
  only export in the package that takes a raw array rather than a named reading type. Matrices are
  `@flighthq/geometry`'s domain, so this is either a `Matrix3`-shaped `out` or a documented
  column-major convention the caller cannot mistake; today it is neither.
- **`attachSensors` subscribes to all eleven streams unconditionally** (`sensors.ts:25-56`), and
  `createSensors` allocates eleven signals (`sensors.ts:284-297`). A consumer that wants orientation
  alone still opens ambient-light, proximity, barometer, and magnetometer subscriptions. Whether this
  earns a per-stream opt-in is unmeasured — `npm run size` has not been run against the eleven-signal
  entity.
- **The seam has no uncalibrated or pedometer streams.** `SensorsBackend` carries no
  `subscribeUncalibratedGyroscope` / `subscribeUncalibratedMagnetometer` (bias-bearing), no step
  counter, and no significant-motion trigger; grep across `packages/**/*.ts` returns zero hits. These
  are native-only (Android `TYPE_*_UNCALIBRATED`, CoreMotion `CMPedometer`) and no native sensors
  backend exists in this repo, so the seam has never been pressure-tested by a second implementation.
- **Sensor fusion stops short of a filter.** `computeWorldAccelerationFromDeviceAcceleration`
  (`sensors.ts:204`) and `computeScreenRelativeOrientation` (`sensors.ts:176`) landed, but no
  `createComplementaryFilter` / `updateComplementaryFilter` exists anywhere. That one still needs the
  cross-package ruling on whether stateful fusion math lives here or in `@flighthq/geometry`.
- **`accuracy` is always `'unknown'` on the web.** The Generic Sensor API and the window events expose
  no calibration state, so every reading the web backend emits carries the default. Native hosts are
  expected to fill it; until one exists, `SensorAccuracy` has exactly one observable value.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Migrated to the explicit Host model. `attachSensors`, `getSensorsPermissionState`,
  `requestSensorsPermission`, `isSensorsSupported` and every `has*` capability query now take
  `host: HasSystemSensors` and dispatch through `host.system.sensors`. DELETED: `getSensorsBackend`,
  `setSensorsBackend`, `installSensorsHostBackend`, `explainSensorsBackend`,
  `observeSensorsHostResult`, `resetSensorsBackendForTest`, the sentinel and its module variables.
  host-web publishes `webSensorsBackend` on `webHost.system.sensors`; `enableHostWebSensors` is gone.
  The pure math helpers (`compute*`) and the reading constructors never touched a backend and are
  unchanged.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 deferral "the higher-order
  fusion math (complementary filter, **world-frame transform**) should be surfaced to the user for a
  cross-package decision before implementing" is **false** for the world-frame half:
  `computeWorldAccelerationFromDeviceAcceleration` is implemented at `sensors.ts:204` and exported on
  the `.` lane. Also false: "the web backend maps `'motion'` and `'orientation'` to the same
  `'accelerometer'` permission name" — `sensors.ts:740-741` maps `'orientation'` to `'gyroscope'`.
  Note the `get*`→`compute*` rename: the old log's `getRotationMatrixFromQuaternion` /
  `getQuaternionFromOrientationReading` are now `compute*`.
- **2026-06-25** — Dropped the dead `_absoluteOrientationQuaternion` scratch; the Generic-Sensor
  absolute-orientation path reuses `_quaternionReading`.
- **2026-06-24** — Landed the reading-type expansion (ambient light, pressure, proximity, quaternion,
  rotation rate), the `is*Supported` queries, permission introspection, and the gyroscope axis fix
  replacing the lossy `MotionReading` reuse with `RotationRateReading`.
