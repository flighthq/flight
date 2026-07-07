---
package: '@flighthq/sensors'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/sensors.md
  - source
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# sensors — Review (merge gate: integration-b2824e3d8 → origin/main)

## Verdict

`partial` — 45/100 **as a merge candidate**. This is not a judgment of the package design, which is sound and ambitious. It is a judgment of the **integration delta as presented**: the head `packages/sensors/` was expanded to an 11-stream library that imports seven types and many fields from `@flighthq/types` — but the matching `@flighthq/types` header changes **did not land in this integration head**. `head/packages/types/src/Sensors.ts` is byte-identical to base (md5 `2d9363dc060385b2add6c85d67564c2c` in both). The package therefore **does not typecheck** in the bundle under review: it imports symbols that do not exist. This is a hard, mechanical merge blocker that overrides every other axis.

Note on provenance: a prior `review.md` (front-matter `score: 80`, `solid`) reasoned over a _different_ bundle (`builder-67dc46d64`) in which the types file _did_ carry the new surface and `dist` was stale. **That review does not describe the bundle being merged here.** The integration head dropped the types-package half of the change. The score regression from 80 to 45 reflects the integration delta, not a re-litigation of the builder bundle.

Evidence base: `base/` is `origin/main` (`eb73c3d74`), not under review. The delta is `head/packages/sensors/` plus the `packages/sensors/` hunks of `changes.patch` (`changes.patch:30708` for the test, `:31497` for the source). The `@flighthq/types` half is judged only insofar as the sensors delta _depends_ on it and that dependency is unsatisfied in this head.

## The blocking finding — the header layer is missing from this head

The head implementation (`b2824e3d8:head/packages/sensors/src/sensors.ts:2-14`) opens with:

```ts
import type {
  AmbientLightReading,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  Sensors,
  SensorsBackend,
  SensorsPermissionState,
  SensorSubscribeOptions,
} from '@flighthq/types';
```

But `b2824e3d8:head/packages/types/src/Sensors.ts` exports exactly four symbols, with the _base_ shape:

```ts
export interface MotionReading { x; y; z; }            // no accuracy / interval / timestamp
export interface OrientationReading { ... }             // no accuracy / interval / timestamp
export interface SensorsBackend { subscribeMotion; subscribeOrientation; subscribeMagnetometer; requestPermission; }
export interface Sensors { onAccelerometer; onGyroscope; onMagnetometer; onOrientation; }  // 4 signals
```

Concretely, the delta is unsatisfiable against the header in its own bundle:

- **7 missing type imports.** `AmbientLightReading`, `PressureReading`, `ProximityReading`, `QuaternionReading`, `RotationRateReading`, `SensorsPermissionState`, `SensorSubscribeOptions` are imported but exist **nowhere** in `head/packages/types/` (`grep -rl` returns empty). `SensorAccuracy` / `SensorSamplingRate` are likewise absent.
- **Field gaps on the two surviving types.** Every allocator writes fields the type lacks: `createMotionReading` sets `accuracy/interval/timestamp` (`sensors.ts:78-80`); `createOrientationReading` sets `accuracy/interval/timestamp` (`sensors.ts:84-94`). The base `MotionReading`/`OrientationReading` have none of these.
- **Signal-count gap.** `createSensors` constructs 11 signals (`sensors.ts:121-135`, incl. `onAbsoluteOrientation`, `onAmbientLight`, `onBarometer`, `onGravity`, `onLinearAcceleration`, `onProximity`, `onQuaternion`); the head `Sensors` type declares 4. `attachSensors` emits to all 11 (`sensors.ts:25-55`).
- **Backend-method gap.** `createWebSensorsBackend` implements ~20 members (`getPermissionState`, ten `is*Supported`, ten `subscribe*`); the head `SensorsBackend` declares 4. The fake in `sensors.test.ts:72-174` implements the same wide surface.

This is not a lint nit or a stale artifact — it is a compile failure. `npm run check` (typecheck) cannot pass on this head. Per the contract's types-first rule ("define its types in `@flighthq/types` first, then implement against them"), the header is the design surface, and here it is absent. **A merge that lands this head as-is breaks the build.**

## The seven standards, judged on the delta

1. **Composition / bedrock — PASS (design), with one open seam.** The unit is a clean event-entity + swappable backend composition; streams are flat `subscribe*`/signal pairs, not config-gated branches. The one composition question is whether the six quaternion/Euler/gravity/world-frame helpers (`getEulerFromQuaternion` `sensors.ts:423`, `getGravityFromOrientation` `:446`, `getQuaternionFromOrientationReading` `:467`, `getRotationMatrixFromQuaternion` `:492`, `getScreenRelativeOrientation` `:524`, `getWorldAccelerationFromDeviceAcceleration` `:566`) are bedrock-here or belong in `geometry`/`math`. They operate on `*Reading` types, which is a real argument for homing them here — this is a charter Open direction, surfaced not blocked.

2. **Naming clarity — PASS.** Exported names carry full unabbreviated type words and are globally self-identifying (`getWorldAccelerationFromDeviceAcceleration`, `createRotationRateReading`, `hasLinearAccelerationSensor`). `get*`/`has*`/`is*` discipline is correct throughout. No abbreviations.

3. **Tree-shaking / bundle invariant — PASS, one parked question.** `index.ts` is a single `export * from './sensors'` barrel (`b2824e3d8:head/packages/sensors/src/index.ts:1`); `package.json` unchanged from base (`sideEffects: false` floor intact); no top-level registration or side effects — module scope holds only `let _backend = null` and scratch readings (`sensors.ts:656-667`). The open question is whether 11 unconditionally-allocated signal slots warrant an `enableSensorsSignals` gate; parked pending an `npm run size` measurement (cannot run here).

4. **Registry vs closed union — N/A.** No `kind`/handler family in the delta. The backend seam is already an open swap (`setSensorsBackend`), which is the right shape.

5. **Subject triad + plurality guard — PASS.** No format codecs, no second backend yet (web only). The native backend is correctly deferred to a future host, not split prematurely.

6. **Contract hygiene — MIXED.** Out-params are alias-safe and documented ("read all input values into locals before writing", e.g. `sensors.ts:529-531`, `:571-578`); sentinels (`-1`, identity quaternion, no-op unsubscribe) replace throws; `dispose*` is correct (detach-to-GC, `sensors.ts:415`). **But the types-first rule is violated by omission** — the header the implementation depends on is not present in this head (the blocking finding). Two within-package nits: `getRotationMatrixFromQuaternion` takes a bare `out: number[]` (`sensors.ts:492`) rather than a typed/length-bracketed matrix out, and `getWebSensorsPermissionState` has a dead-equal ternary `sensor === 'orientation' ? 'accelerometer' : 'accelerometer'` (`sensors.ts:742`) — both branches identical, a latent bug if per-sensor permission scoping is ever wanted.

7. **Tests & honesty — PASS in shape, BLOCKED in fact.** Tests are colocated, `describe` blocks alphabetized and mirror exports one-to-one (`sensors.test.ts:179-771`), and exercise allocators, idempotency, all streams, alias-safety (distinct + aliased `out`), and sentinel ranges. The honesty problem is not the test prose — it is that **the test imports the same seven nonexistent types** (`sensors.test.ts:2-12`) and constructs a fake backend over a surface the header does not declare. The suite cannot compile or run against this bundle's `@flighthq/types`.

## Why the score, precisely

Design and within-package craft would sit comfortably in `solid` territory. The merge-gate score is dragged to `partial`/45 by a single fact: **the delta does not build in its own bundle** because its header dependency is absent. That is disqualifying for a merge gate regardless of how good the implementation reads. Restore the `@flighthq/types/src/Sensors.ts` changes (the 7 new reading types, the field extensions, the 11-signal entity, the widened backend, the `SensorAccuracy`/`SensorsPermissionState`/`SensorSamplingRate`/`SensorSubscribeOptions` aliases) into this integration head and the same code jumps back toward 80.

## Notes for the charter's Open directions

- **Fusion-math homing (the central undecided boundary).** Six quaternion/Euler/gravity/world-frame helpers are shipped in `sensors` operating on `*Reading` types. Ratify homing them here, or move the generic core (quaternion↔matrix↔Euler) to `geometry`/`math` and keep only `*Reading`-typed wrappers. Gate on the Rust crate.
- **`getRotationMatrixFromQuaternion` out type.** If matrix math stays in `sensors`, decide whether the `out: number[]` should be a typed geometry `Matrix3`/`Float32Array` rather than a bare array.
- **Inert seam fields.** `accuracy` (`'unknown'`), `timestamp` (`-1`, despite DOM `Event.timeStamp` being available), and the `rate` hint are plumbed but unconsumed on web. Bless as native-only or wire on web.
- **`enableSensorsSignals` gate.** 11 unconditional signal slots — decide after an `npm run size` read.
- **Per-sensor permission granularity.** The web mapping collapses `'motion'`/`'orientation'` to `'accelerometer'` — finer scoping is a native concern or a charter goal (and is the source of the dead ternary at `sensors.ts:742`).
- **Rust `flighthq-sensors` crate.** Asserted in front-matter, unbuilt; an ideal first value-typed conformance/mixing leaf once the fusion-math homing settles.
