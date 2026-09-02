---
package: '@flighthq/sensors'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - assessment.md
  - prior review (2026-07-13)
  - platform-integration.md
  - types/src/Sensors.ts
---

# sensors — Review (live-tree survey, 2026-09-02)

> Supersedes the 2026-07-13 review. The major change since that review is the migration to the explicit Host model (2026-08-30): all backend-touching functions now take `host: HasSystemSensors` and dispatch through `host.system.sensors`, eliminating the module-scoped singleton (`getSensorsBackend`/`setSensorsBackend`/`installSensorsHostBackend` and their sentinel). The pure math helpers (`compute*`) and reading allocators (`create*Reading`) are unchanged.

## Verdict

**solid — 78/100.** A genuinely broad 11-stream sensors package (30 exports across contract and public lanes): accelerometer-with-gravity, gyroscope/rotation-rate, linear acceleration, gravity, magnetometer, relative and absolute orientation, quaternion, ambient light, barometer, proximity. Each sensor has a `has*` availability probe, the web backend layers the Generic Sensor API on top of `devicemotion`/`deviceorientation`/`deviceorientationabsolute` fallbacks, and six fusion-math `compute*` helpers round out the surface. The Host migration landed cleanly and the `sensorsHost.test.ts` file verifies multi-host independence. Two points higher than the prior review because the explicit-host migration resolved the singleton violation and removed the sentinel-and-module-variable pattern. The score is held down by the signal opt-in convention violation (suite-level blessed decision, not yet applied) and several smaller structural issues that persist from the prior review.

## Present capabilities

- **11 sensor streams** over `SensorsBackend`: accelerometer (gravity-included), gyroscope (rotation rate), linear acceleration, gravity, magnetometer, relative orientation (Euler), absolute orientation (Euler), quaternion orientation, ambient light, barometer, proximity.
- **Per-sensor availability probes**: 9 `has*` functions plus `isSensorsSupported` on the `.` lane, each delegating to the corresponding `is*Supported()` method on the backend.
- **Permission introspection**: `getSensorsPermissionState` (query without prompt) and `requestSensorsPermission` (trigger prompt on iOS), both on the `.` lane.
- **Event entity lifecycle**: `createSensors` (allocate), `attachSensors` (subscribe all streams, idempotent), `detachSensors` (unsubscribe), `disposeSensors` (detach and release for GC).
- **7 reading allocators**: `createMotionReading`, `createOrientationReading`, `createQuaternionReading`, `createRotationRateReading`, `createAmbientLightReading`, `createPressureReading`, `createProximityReading` -- all contract-only.
- **6 fusion-math helpers** on the `.` lane: `computeEulerFromQuaternion`, `computeGravityFromOrientation`, `computeQuaternionFromOrientationReading`, `computeRotationMatrixFromQuaternion`, `computeScreenRelativeOrientation`, `computeWorldAccelerationFromDeviceAcceleration`. All use `out`-parameter style, are documented alias-safe (inputs read into locals before output writes), and propagate `interval`/`timestamp`/`accuracy` from their source reading.
- **Web backend**: `createWebSensorsBackend` (contract-only) wraps `devicemotion`/`deviceorientation`/`deviceorientationabsolute` window events, with Generic Sensor API (`AbsoluteOrientationSensor`, `AmbientLightSensor`, `Magnetometer`) used where available. Rate control (`frequency` option) is honored by Generic Sensor subscribers; window-event streams fire at the browser default. Graceful no-op on SSR (`typeof window === 'undefined'`).
- **Explicit Host model**: all backend-touching functions accept `host: HasSystemSensors` and read `host.system.sensors`. No module-scoped mutable state for the backend.
- **Test coverage**: 30 `describe` blocks in `sensors.test.ts` (one per exported function, alphabetized), plus 4 in `sensorsHost.test.ts` verifying multi-host independence. Tests use a `fakeBackend()` helper that exposes `fire*` methods for each stream.

## Gaps

### Convention violation

- **`createSensors` eagerly allocates 11 signals** (sensors.ts lines 283-296), and the `Sensors` type declares all signal slots as non-nullable (`types/src/Sensors.ts` lines 159-171). The platform integration suite blessed decision (`platform-integration.md` line 19) states: "Signal opt-in convention should be enforced. Use `enable*Signals` gates -- do not eagerly allocate signals in `create*` functions." The `power` package was already converted to this shape (nullable slots + `enablePowerSignals`). This remains the single convention violation from the prior review, unchanged.

### Redundancy

- **`hasAccelerometer` and `isSensorsSupported` are identical.** Both return `host.system.sensors.isMotionSupported()` (sensors.ts lines 591 and 636). Both sit on the `.` lane. One name should be removed or one of them should implement distinct semantics (e.g., `isSensorsSupported` checking whether *any* sensor is available).

### API shape issues

- **`computeRotationMatrixFromQuaternion` writes into a bare `number[]`** (sensors.ts line 143). This is the only export in the package that takes a raw array rather than a named reading type. A rotation matrix is `@flighthq/geometry`'s domain; this output should either use a `Matrix3`-shaped `out` parameter or document its column-major 9-element convention in the type signature. Unchanged from the prior review; tied to the fusion-math homing question.
- **Reading allocators are contract-only while `compute*` functions that consume those types are on the `.` lane.** A consumer importing from `.` can call `computeEulerFromQuaternion` but cannot construct either argument without reaching into `./contract` (status.md documents this at the top of Open). The seven `create*Reading` functions (sensors.ts lines 233-279) are exported only through `contract.ts`.

### Inert/sentinel fields

- **`accuracy` is always `'unknown'` on the web.** The Generic Sensor API and window events expose no calibration state, so every web-originated reading carries the sentinel. Native hosts are expected to fill this; until one exists, `SensorAccuracy` has exactly one observable value.
- **`interval` and `timestamp` are `-1` for all Generic Sensor API streams** (ambient light, magnetometer, quaternion, absolute orientation via Generic Sensor). Only the `devicemotion` window-event path populates `interval` from `event.interval`; no path sources `timestamp` from `Event.timeStamp`. The values are plumbed end-to-end through the type system but remain sentinels on web.

### Structural

- **`attachSensors` subscribes to all 11 streams unconditionally** (sensors.ts lines 27-57). A consumer wanting only orientation still opens accelerometer, magnetometer, ambient-light, barometer, and proximity subscriptions. Whether this warrants per-stream opt-in is unmeasured -- `npm run size` has not been run against the 11-signal entity.
- **No `attachSensors` test for the barometer stream.** The `fakeBackend()` helper exposes `fireBarometer` (sensors.test.ts line 149), but no `attachSensors` test case verifies that `onBarometer` is emitted when `fireBarometer` is called. All other 9 streams have corresponding tests.
- **Scratch-reuse hazard is contract-by-comment only.** Readings passed to signal listeners are module-level scratch objects reused across callbacks (sensors.ts lines 644-653). The charter documents "listeners must copy values to outlive the callback," but per the diagnostics inversion rule, a caller-facing warning that lives only in prose is a missing guard. No `enableSensorsGuards` exists to detect a retained scratch reference.

### Seam coverage

- **No uncalibrated or pedometer streams.** `SensorsBackend` carries no `subscribeUncalibratedGyroscope`/`subscribeUncalibratedMagnetometer` (bias-bearing), no step counter, and no significant-motion trigger. These are native-only (Android `TYPE_*_UNCALIBRATED`, CoreMotion `CMPedometer`), and no native sensors backend exists in this repo.
- **No complementary/Kalman filter helper.** `computeWorldAccelerationFromDeviceAcceleration` and `computeScreenRelativeOrientation` landed, but no `createComplementaryFilter`/`updateComplementaryFilter` exists. Deferred pending the fusion-math homing decision.

## Charter contradictions

- The charter's Decision text and Open directions still reference the stale `get*` helper names (e.g., `getRotationMatrixFromQuaternion`). The source uses `compute*` since the 2026-08-08 rename. The charter should be refreshed to match.
- The charter parks `enableSensorsSignals` as an Open direction "pending `npm run size` measurement," but the suite-level decision in `platform-integration.md` has since blessed signal opt-in as mandatory. The Open direction is superseded; it is drift, not a fork.
- The charter's fixed Decision item (dead ternary at line 742) is implemented: the web permission mapping at sensors.ts line 727 is now a correct three-way (`'orientation' -> 'gyroscope'`, `'magnetometer' -> 'magnetometer'`, else `'accelerometer'`). The assessment still lists this as Recommended/Approved despite being done.

## Contract & docs fit

- **Two-lane export structure** is correct: `index.ts` selectively re-exports 22 symbols from `contract.ts`; `contract.ts` re-exports everything from `sensors.ts` (30 symbols total). No subpath exports beyond `.` and `./contract`.
- **`package.json`** declares `"sideEffects": false`, lists `@flighthq/math`, `@flighthq/signals`, and `@flighthq/types` as dependencies. No dependency on `@flighthq/sdk`. No `@flighthq/entity` dependency (the `Sensors` entity is a plain object, not an Entity-backed type -- this is consistent with other platform-integration event entities like `Power`).
- **All types in `@flighthq/types`**: the 13-symbol type surface (`SensorAccuracy`, `SensorsPermissionState`, `SensorSubscribeOptions`, `SensorReading`, 7 reading types, `SensorsBackend`, `Sensors`) lives in `types/src/Sensors.ts`. `HasSystemSensors` lives in `types/src/Host.ts`. The implementation package exports functions only.
- **Source style**: exported functions are alphabetized in `sensors.ts`. Module-level scratch objects and the `_subscriptions` WeakMap are placed at the bottom of the file, after all exported functions. Test `describe` blocks are alphabetized and mirror exported names (30 blocks in `sensors.test.ts`, 4 in `sensorsHost.test.ts`). Type imports use `import type { }` on separate lines from value imports.
- **`Readonly<T>` usage**: all `compute*` functions mark their input reading parameters as `Readonly<>`. The `SensorsBackend` interface marks listener parameters as `Readonly<>`. The `Sensors` signal types use `Readonly<>` on their callback parameters.
- **Alias safety**: all `compute*` functions document and implement alias safety (reading all inputs into locals before writing output fields). Tests verify alias safety for `computeWorldAccelerationFromDeviceAcceleration` (out === acceleration case) and verify non-corruption for the others.
- **Explicit Host model**: aligns with the platform-integration pattern. `HasSystemSensors` is a narrow capability type (`{ readonly system: { readonly sensors: SensorsBackend } }`), enabling a `host` to carry only the sensors backend without pulling in unrelated capabilities.

## Candidate open directions

- **Signal opt-in gate** (`enableSensorsSignals`): convert `Sensors` signal slots to nullable, add an idempotent `enableSensorsSignals(sensors)` function, null-guard emit sites in `attachSensors`. Mirrors the `power` package pattern. This is the highest-priority fix -- it resolves the suite-level convention violation.
- **Fusion-math homing**: keep the 6 `compute*` helpers here (they speak `*Reading` types), or extract the generic quaternion/Euler/matrix core to `@flighthq/geometry`/`@flighthq/math` and keep only `*Reading`-typed wrappers. Unchanged from the prior review.
- **Reading allocators on the `.` lane**: promote `create*Reading` functions to the public lane so a `.`-lane consumer can construct arguments for the `compute*` functions without reaching into `./contract`.
- **`hasAccelerometer`/`isSensorsSupported` redundancy**: remove one or give `isSensorsSupported` distinct semantics (e.g., logical OR of all `is*Supported` probes).
- **`enableSensorsGuards`**: a shakeable guard layer that detects retained scratch-reading references, analogous to the diagnostics inversion rule's prescription.
- **`timestamp` sourcing**: populate `timestamp` from `Event.timeStamp` on the window-event paths, and from the Generic Sensor API's `sensor.timestamp` property where available, rather than emitting `-1`.
- **Barometer test coverage**: add an `attachSensors` test case for the `onBarometer` signal.
- **Sensor-fusion depth**: a complementary or Kalman filter helper -- the next capability step once the homing question is settled.
