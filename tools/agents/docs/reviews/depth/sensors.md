# Depth Review: @flighthq/sensors

**Domain**: Device motion and orientation sensors — accelerometer, gyroscope, magnetometer, device orientation/compass — exposed as an event entity over a swappable web/native backend.

**Verdict**: partial — 55/100

The package covers the four canonical mobile-web inertial/orientation sensor streams (accelerometer, gyroscope, magnetometer, device orientation) cleanly and idiomatically, with a correct backend seam, permission gating, and reading allocators. But measured against an authoritative device-sensors library it omits several streams that mature sensor suites (Generic Sensor API, Capacitor Motion, Cordova sensors, native mobile sensor frameworks) treat as core: linear acceleration (gravity-removed), absolute/relative orientation as distinct streams, ambient light, proximity, barometer/pressure, gravity vector, and any notion of sampling-rate control or availability/support queries. It is a competent thin event seam rather than an exhaustive sensor library.

## Present capabilities

Exported surface (from `src/sensors.ts`):

- `createSensors()` — allocates the `Sensors` event entity with four inert signals: `onAccelerometer`, `onGyroscope`, `onMagnetometer`, `onOrientation`.
- `attachSensors(sensors)` / `detachSensors(sensors)` / `disposeSensors(sensors)` — start/stop/teardown delivery; `attach` is idempotent (tears down a prior subscription first), tracked via a `WeakMap`.
- `createMotionReading()` — zeroed `{x,y,z}`.
- `createOrientationReading()` — zeroed `{alpha,beta,gamma, absolute:false, heading:-1}` (sentinel `-1` for unknown heading).
- `createWebSensorsBackend()` — default backend over `devicemotion` / `deviceorientation` window events plus the Generic Sensor API `Magnetometer`; degrades to no-op subscriptions when `window` is absent and to granted permission when the host does not gate.
- `getSensorsBackend()` / `setSensorsBackend(backend|null)` — backend accessor with lazy web default; `null` restores the default. Matches the platform-suite seam convention.
- `requestSensorsPermission()` — wraps iOS `DeviceMotionEvent.requestPermission()`, resolving `true` where ungated.

Backend contract (`SensorsBackend` in `@flighthq/types`): `subscribeMotion` (acceleration + rotation rate together), `subscribeOrientation`, `subscribeMagnetometer`, `requestPermission`. Readings are plain value structs (`MotionReading`, `OrientationReading`) reused via module-level scratch objects to avoid per-event allocation in the hot listener path — consistent with Flight's allocation discipline.

The implementation handles the awkward platform realities well: `accelerationIncludingGravity` mapped to `onAccelerometer`, `rotationRate` (alpha/beta/gamma) mapped to `onGyroscope`, iOS-only `webkitCompassHeading` for heading with a `-1` sentinel elsewhere, and try/catch around the Generic Sensor `Magnetometer` constructor.

## Gaps vs an authoritative sensor library

Compared with the canonical set a mature device-sensors library exposes (Generic Sensor API, W3C device sensor specs, Capacitor/Cordova motion plugins, native CoreMotion/Android SensorManager):

- **Linear acceleration (gravity-removed)** — missing-by-omission. Authoritative suites separate raw acceleration _including_ gravity from `LinearAccelerationSensor` (motion only). The web exposes both `event.acceleration` and `event.accelerationIncludingGravity`; this package only forwards the gravity-including stream as `onAccelerometer`, dropping the more useful gravity-free reading entirely. This is the single most notable gap.
- **Gravity vector** — missing. A dedicated `GravitySensor` / gravity stream is standard; here it is neither exposed nor derivable from what is forwarded.
- **Absolute vs relative orientation as distinct streams** — partial. The `absolute` flag is carried on a single `OrientationReading`, but the web platform distinguishes `deviceorientation` from `deviceorientationabsolute` (and Generic Sensor `AbsoluteOrientationSensor` vs `RelativeOrientationSensor`). Only one orientation subscription exists.
- **Quaternion / rotation matrix orientation** — missing. Generic Sensor `*OrientationSensor` exposes a quaternion; many consumers want this rather than raw Euler alpha/beta/gamma. No quaternion or rotation-matrix reading type.
- **Ambient light sensor** — missing. `AmbientLightSensor` (lux) is a standard Generic Sensor stream commonly bundled in sensor libraries.
- **Proximity sensor** — missing.
- **Barometer / pressure / altitude** — missing. CoreMotion `CMAltimeter` and Android pressure sensors are common in full suites.
- **Sampling frequency / rate control** — missing-by-omission. The Generic Sensor API and native frameworks let callers request a frequency (`{frequency: 60}`) or rate (UI/game/fastest). Here the interval is implicit and unconfigurable.
- **Availability / support queries** — missing. No `isSensorsSupported`/`hasMagnetometer`/per-stream support check; callers cannot know whether a stream will ever fire versus being silently no-op'd. The web backend's silent degradation to no-op makes the absence of a capability query a real usability gap.
- **Permission state introspection** — partial. `requestSensorsPermission()` exists, but there is no `getSensorsPermissionState()` to query without triggering a prompt, and the single permission gate does not distinguish per-sensor permission (motion vs magnetometer/Generic Sensor `permissions.query`).
- **Reading timestamp / accuracy** — missing. `MotionReading`/`OrientationReading` carry no timestamp or accuracy field, which sensor-fusion consumers typically need. The `motion` event's `interval` is also dropped.

Of these, none are explicitly marked "out of scope" in the package or docs. The docs Package Map lists the intended scope as "accelerometer, gyroscope, device orientation" — magnetometer is already a bonus beyond that line — but the project's AAA-completeness rule sets the bar at the full canonical domain, against which light/proximity/barometer/linear-acceleration/rate-control are missing-by-omission, not by design.

## Naming / API-shape notes

- Naming is clean and self-identifying: `attachSensors`/`detachSensors`/`disposeSensors` follow the event-capability quartet (`create*`/`attach*`/`detach*`/`dispose*`) used by `@flighthq/application` window wiring, and `get*Backend`/`set*Backend`/`createWeb*Backend` match the platform suite seam exactly. Good consistency.
- `onGyroscope` carries the `rotationRate` (alpha/beta/gamma in deg/s) repacked into a generic `MotionReading {x,y,z}`. Mapping angular rate's alpha/beta/gamma onto `x/y/z` is a lossy semantic flattening — a dedicated `RotationRateReading` (or documenting the axis mapping on the type) would be clearer; a reader of `onGyroscope: Signal<MotionReading>` cannot tell the units are deg/s, not m/s².
- `onAccelerometer` similarly names the _acceleration-including-gravity_ stream "accelerometer," which is defensible but ambiguous once a linear-acceleration stream is added; reserve `onAccelerometer` carefully or rename to reflect gravity inclusion.
- `subscribeMotion` bundles acceleration + rotation rate in one callback while the entity splits them into two signals — a reasonable backend/entity asymmetry, but it means a native backend cannot deliver gyroscope without also wiring accelerometer.
- Heading `-1` sentinel and `absolute:false` defaults are documented on the type and at the allocator — good.
- Scratch-object reuse (`_motionAcceleration`, etc.) is correct for hot-path allocation but means listeners must not retain the reading across callbacks; this aliasing contract is not documented on the signal types (only implied). Worth a comment on `Sensors`/`SensorsBackend`.

## Recommendation

Treat this as a solid seam that needs depth, not a rewrite. Highest-value additions, roughly in order:

1. **Linear acceleration + gravity streams** — forward `event.acceleration` as `onLinearAcceleration` and add a gravity vector; this is the most glaring inertial-sensor omission.
2. **Support/availability queries** (`isSensorsSupported`, per-stream `has*`) so callers can distinguish "no device" from "silently no-op."
3. **Sampling-rate control** on `SensorsBackend.subscribe*` (a frequency/hint argument) to match Generic Sensor and native frameworks.
4. **Quaternion orientation** reading and a clear absolute-vs-relative orientation split.
5. Lower priority but canonical for an exhaustive suite: ambient light, proximity, and barometer/pressure streams, plus a `getSensorsPermissionState()` and a timestamp/accuracy field on readings.

Also fix the gyroscope axis ambiguity with a dedicated `RotationRateReading` type (or documented axis/unit mapping). The architecture (entity/runtime, value readings, swappable backend) is sound and will absorb all of these without restructuring.
