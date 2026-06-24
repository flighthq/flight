---
package: '@flighthq/sensors'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/sensors.md
  - source
---

# sensors — Review

## Verdict

`solid` — 80/100. This session took the package from a competent-but-thin four-stream event seam (the prior depth review's 55/100) to a near-complete device-sensors library: 11 sensor streams, full availability/permission introspection, sampling-rate options on the backend seam, and a set of quaternion/Euler/gravity/world-frame conversion helpers. Architecture (event-entity + swappable backend, value-typed readings, scratch reuse) is sound and idiomatic. It is not yet `authoritative` because of one unresolved cross-package design decision (fusion math homed unilaterally in `sensors`), a few seam fields that are declared but unwired on the web backend, and the captured `dist` being stale relative to the source.

Evidence is the incoming bundle `builder-67dc46d64`; source references are to `head/packages/sensors/src/sensors.ts` and `head/packages/types/src/Sensors.ts`.

## Status claims vs. the diff

The worker `status.md` is broadly accurate but **underclaims** in two ways and one of its "deferred" items was in fact implemented — verify-against-diff caught this:

- **Test count.** Status claims "42 tests passing." The head test file has **60** `it(` blocks across 32 `describe` blocks (one per exported function, alphabetized, mirroring source order). The extra 18 cover the helpers the status listed as deferred.
- **Fusion math was NOT deferred.** Status item 5 says `getWorldAccelerationFromDeviceAcceleration` and the world-frame/complementary-filter helpers were _deferred pending a cross-package decision_ (does quaternion math live in `sensors` or `geometry`?). The diff contradicts this: the patch adds **four** fusion/conversion helpers to source — `getEulerFromQuaternion`, `getGravityFromOrientation`, `getScreenRelativeOrientation`, and `getWorldAccelerationFromDeviceAcceleration` (patch lines 247630, 247653, 247731, 247774). The worker made the cross-package call (math lives in `sensors`) and shipped it, rather than surfacing it. This is the single most important thing for the user to ratify — see Charter contradictions and Candidate open directions.
- **Stale `dist`.** The bundle's realized API surface (`head/packages/sensors/dist/sensors.d.ts`) lists only 25 exports and is missing all seven source additions made late in the session (`getEulerFromQuaternion`, `getGravityFromOrientation`, `getScreenRelativeOrientation`, `getWorldAccelerationFromDeviceAcceleration`, `hasAccelerometer`, `hasGravitySensor`, `hasLinearAccelerationSensor`). The `dist` was captured before the final `tsc -b`. Source is the ground truth here; the realized-surface artifact is unreliable for this package in this bundle.

## Present capabilities

Source: `head/packages/sensors/src/sensors.ts` (32 exported functions). Types: `head/packages/types/src/Sensors.ts`.

**Streams (11 signals on `Sensors`).** `onAccelerometer` (incl. gravity), `onGyroscope` (now a proper `RotationRateReading` with named alpha/beta/gamma deg/s axes — the prior lossy `MotionReading` reuse is gone), `onLinearAcceleration` (gravity-removed), `onGravity` (derived `accelerationIncludingGravity − acceleration`), `onMagnetometer`, `onOrientation`, `onAbsoluteOrientation` (Generic Sensor `AbsoluteOrientationSensor` with `deviceorientationabsolute` fallback), `onQuaternion`, `onAmbientLight`, `onBarometer`, `onProximity`. `attachSensors` wires all ten backend subscriptions, is idempotent (tears down a prior subscription via the `WeakMap`), and `detachSensors`/`disposeSensors` are the clean teardown pair.

**Reading allocators (9).** `createMotionReading`, `createOrientationReading`, `createRotationRateReading`, `createQuaternionReading`, `createAmbientLightReading`, `createPressureReading`, `createProximityReading`, plus `createSensors` and `createWebSensorsBackend`. Each reading now carries `accuracy`/`interval`/`timestamp` with documented sentinels (`-1`, identity quaternion `w=1`, `altitude=-1`/`distance=-1`/`max=-1` when underivable).

**Availability queries (10).** `hasAccelerometer`, `hasGyroscope`, `hasMagnetometer`, `hasOrientationSensor`, `hasGravitySensor`, `hasLinearAccelerationSensor`, `hasAmbientLightSensor`, `hasBarometer`, `hasProximitySensor`, `isSensorsSupported` — each delegating to a backend `is*Supported` query. This closes the prior review's "silent no-op vs. no device" usability gap directly. The web backend answers honestly: `isBarometerSupported`/`isProximitySupported` return `false` (no web API), the others feature-detect `DeviceMotionEvent`/`DeviceOrientationEvent` or the Generic Sensor constructor.

**Permission.** `requestSensorsPermission` (iOS `DeviceMotionEvent.requestPermission` gate) plus the new non-prompting `getSensorsPermissionState(sensor?)` over the W3C Permissions API, returning the four-state `SensorsPermissionState`.

**Rate control.** `SensorSubscribeOptions { frequency?, rate? }` threads through every backend `subscribe*`; the web backend honors `frequency` on Generic Sensor constructors and documents that the window-event streams ignore it.

**Conversion / fusion helpers (4, alias-safe `out`-param).** `getRotationMatrixFromQuaternion` (column-major 3×3), `getQuaternionFromOrientationReading` (Euler ZXY → quaternion), `getEulerFromQuaternion` (quaternion → Euler ZXY, normalized alpha to [0,360)), `getGravityFromOrientation` (device-frame gravity projection at 9.80665 m/s²), `getScreenRelativeOrientation` (compensates raw angles for `screen.orientation.angle`), and `getWorldAccelerationFromDeviceAcceleration` (inverse-quaternion rotation of an acceleration vector into the world frame). Each reads all inputs into locals before writing `out`, with the aliasing contract documented at the function.

**Backend seam.** `getSensorsBackend`/`setSensorsBackend`/`createWebSensorsBackend` match the platform-suite command convention exactly; `_backend` lazily defaults to web; `null` restores it. All scratch readings and the `_subscriptions` WeakMap live at the file bottom per source-style.

## Gaps

Measured against an exhaustive native sensor suite (CoreMotion / Android `SensorManager` / Generic Sensor API), what remains:

- **`rate` hint is declared but unwired.** `SensorSubscribeOptions.rate` (`'ui'|'normal'|'game'|'fastest'`) is defined in types and accepted by every `subscribe*`, but the web backend reads only `options?.frequency` — `rate` is never consumed anywhere (grep: zero `.rate` reads in source). On the web that is defensible (only `frequency` maps to a Generic Sensor constructor), but the field is effectively native-backend-only today and nothing documents that asymmetry at the option type beyond a general "backends degrade" note. A native backend must map `rate` → platform hint.
- **Uncalibrated gyroscope/magnetometer streams** (Android `TYPE_GYROSCOPE_UNCALIBRATED`, CoreMotion raw + bias) — absent. Status item 3; native-only, correctly deferred.
- **Exotic native streams** — step counter, pedometer, heart rate, significant-motion. Absent; no web equivalent. Status item 4.
- **`accuracy` is always `'unknown'` on web.** The field exists on every reading but the web backend cannot populate it; a native host fills it. Acceptable, but it means the field is inert in the default backend.
- **`timestamp` is always `-1`.** The web handlers set `timestamp = -1` unconditionally even though the DOM `Event.timeStamp` is available; the field is plumbed but never sourced from the event. Minor, but the one place the web backend could fill a "calibration-class" field and does not.
- **No Rust `flighthq-sensors` crate.** Charter front-matter declares `crate: flighthq-sensors`; none exists yet. Correctly deferred until the TS API stabilizes — the value-typed `*Reading` structs and the pure conversion helpers are ideal first conformance/mixing targets (plain `Copy`, headlessly fingerprintable), which strengthens the case for keeping the math here.
- **Dead scratch object.** `_absoluteOrientationQuaternion` is allocated and written in the `subscribeAbsoluteOrientation` Generic-Sensor path purely to feed `getEulerFromQuaternion`; the `subscribeQuaternion` path exposes the quaternion directly. The status itself flags this as a minor cleanliness issue — it is real but cosmetic.

## Charter contradictions

The charter (`charter.md`) is a stub: `What it is` is seeded from the depth review, and `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO`. There is therefore **no blessed principle to contradict** — and that itself is the finding. The session made at least two decisions a charter would normally govern, with no charter to authorize them:

1. **Fusion/conversion math homed in `sensors`.** Six quaternion/Euler/gravity/world-frame functions now live here. The status' own deferral note (item 5) and the prior depth review both flagged this as a `sensors`-vs-`geometry` boundary question needing a human decision. It was decided implicitly by shipping. Not wrong — these are sensors-shaped (they speak `OrientationReading`/`MotionReading`/ `QuaternionReading`, not generic `Matrix`/`Vector3`) — but it is exactly the kind of cross-package call the codebase map says to _surface, not act on autonomously_.
2. **A breaking API change** (`onGyroscope`: `MotionReading` → `RotationRateReading`) was made on pre-release grounds. Correct under the project's no-back-compat rule, but it is a Decision-ledger-worthy ruling that currently lives only in a worker status doc.

Both should be promoted into the charter (a Decision or an Open direction) so the next agent inherits them.

## Contract & docs fit

**Lives up to the contract:**

- **`@flighthq/types`-first.** All readings, `SensorsBackend`, `Sensors`, `SensorAccuracy`, `SensorsPermissionState`, `SensorSamplingRate`, `SensorSubscribeOptions` are defined in `packages/types/src/Sensors.ts`; the implementation imports them. Header-layer discipline is clean.
- **Naming.** Full, unabbreviated, self-identifying; the event-capability quartet (`create*`/`attach*`/`detach*`/`dispose*`) and the seam triad (`get*Backend`/`set*Backend`/ `createWeb*Backend`) match `@flighthq/application` and the platform suite exactly. `has*`/`is*` for booleans, `get*` for the `out`-param conversions and accessors, `create*` for allocators.
- **Sentinels, not throws.** `-1`/`false`/`'unsupported'`/no-op unsubscribe everywhere; no thrown errors on the expected-failure paths; `try/catch` only guards the optional Generic Sensor constructors.
- **`out`-params + alias safety.** Every conversion helper writes `out` and reads inputs first, with a documented aliasing contract — and the tests include alias cases (7 alias-related assertions).
- **Allocation discipline.** Scratch readings reused in the hot listener path; the scratch-reuse aliasing contract is now documented on the reading types, on `SensorsBackend`, and on `attachSensors` (closing the prior review's "implied-only" note).
- **Single root export, `sideEffects: false`.** `index.ts` is `export * from './sensors'`; `package.json` declares `"sideEffects": false`; no top-level side effects (lazy `_backend`).
- **Order.** Exported functions and `describe` blocks are alphabetized and aligned; every export has a colocated test (`exports:check` would pass against source).

**Candidate revisions to the contract/admin docs:**

- **Package Map line is stale.** `index.md` lists `@flighthq/sensors` as "accelerometer, gyroscope, device orientation." The package now spans 11 streams (light/proximity/barometer/gravity/linear-accel/ quaternion/absolute-orientation) plus fusion math. The map line should be widened, and it is worth a word on whether quaternion/orientation math is in-scope here (per contradiction 1).
- **`crate: flighthq-sensors`** is asserted in front-matter but unbuilt; the conformance map / register should reflect "TS-only, crate pending" until the port lands.

## Candidate open directions

The charter is silent on all of these; each is something this review had to assume:

1. **Where does sensor-fusion math live — `sensors` or `geometry`?** The session homed six quaternion/Euler/gravity/world-frame helpers in `sensors`. Ratify this, or move the generic core (quaternion↔matrix↔Euler) to `geometry`/`math` and keep only the `*Reading`-typed wrappers here. This is the package's central undecided boundary and the gate on the Rust crate.
2. **Is `accuracy`/`timestamp`/`rate` a charter Boundary (native-only by design) or a web gap?** Three fields are plumbed through types but inert/unconsumed on the web backend. Decide whether the charter blesses them as native-only (then document the asymmetry at the type) or whether `timestamp` at least should be sourced from `Event.timeStamp` on web.
3. **`enableSensorsSignals` tree-shaking gate?** The entity now allocates 11 signal slots unconditionally; `enableSensorsSignals` is absent (status item 6 deferred pending an `npm run size` measurement). Decide whether 11 inert signals warrant the opt-in gate the signals convention permits.
4. **Bless the breaking `onGyroscope` reshape** (`MotionReading` → `RotationRateReading`) as a charter Decision so it is not re-litigated.
5. **Per-sensor permission granularity.** `getSensorsPermissionState('motion'|'orientation'|'magnetometer')` exists, but the web mapping collapses `'motion'` and `'orientation'` to the same `'accelerometer'` Permissions-API name. Is finer per-sensor scoping a native-backend concern or a charter goal?
