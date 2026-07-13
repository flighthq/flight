---
package: '@flighthq/sensors'
status: solid
score: 76
updated: 2026-07-13
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - prior review (2026-06-25)
---

# sensors — Review (live-tree survey, 2026-07-13)

> Supersedes the 2026-06-25 merge-gate review (`partial — 45, does not typecheck`). Its blocking finding is resolved: `packages/types/src/Sensors.ts` now exports the full 13-symbol header — `SensorAccuracy`, `SensorsPermissionState`, `SensorSubscribeOptions`, the `SensorReading` base (accuracy/interval/timestamp) with the seven reading types extending it, the wide `SensorsBackend`, and the 11-signal `Sensors` entity. The package compiles; the 771-line test suite mirrors the surface.

## Verdict

**solid — 76/100.** A genuinely broad 11-stream sensors library (31 exports): accelerometer-with-gravity, gyroscope/rotation-rate, linear acceleration, gravity, magnetometer, relative + absolute orientation, quaternion, ambient light, barometer, proximity — each with a `has*` availability probe, over a web backend that layers the Generic Sensor API on top of `devicemotion`/`deviceorientation`/`deviceorientationabsolute` fallbacks (with a rate-control caveat documented at `sensors.ts:301-305`). Value-typed `create*Reading` allocators, permission introspection (`getSensorsPermissionState`, `requestSensorsPermission`), and six fusion-math helpers round it out. Two things hold the score down: an outright violation of the suite's **blessed** signal opt-in decision, and the inert seam fields carried from the prior survey.

## Changes verified since the prior review

- **Dead ternary fixed** (charter Decision 2026-07-02, the one Approved item): the web permission mapping at `sensors.ts:741` is now a real three-way — `'magnetometer' → 'magnetometer'`, `'orientation' → 'gyroscope'`, else `'accelerometer'`. Implemented; the Approved item is done.
- **Fusion helpers renamed `get*` → `compute*`:** the six are now `computeEulerFromQuaternion`, `computeGravityFromOrientation`, `computeQuaternionFromOrientationReading`, `computeRotationMatrixFromQuaternion`, `computeScreenRelativeOrientation`, `computeWorldAccelerationFromDeviceAcceleration` (out-param first, `Readonly` inputs). The prior review's and the charter Decision's `get*` names are stale; the charter should be refreshed to the `compute*` vocabulary at the next direction session. The homing question (here vs `geometry`/`math`) is unchanged and still open.

## The one convention violation

**`createSensors` eagerly allocates 11 signals** (`sensors.ts:284-299`), and the `Sensors` type declares them non-nullable (`types/src/Sensors.ts:159-171`). The suite principles doc records a blessed decision — *"[2026-07-02] Signal opt-in convention should be enforced. Use `enable*Signals` gates — do not eagerly allocate signals in `create*` functions. Packages violating this should be fixed"* (`agents/packages/platform-integration.md:17`) — and `power` was converted to exactly this shape (nullable slots + `enablePowerSignals`). The sensors charter still parks this as an Open direction "pending `npm run size`", but the suite-level decision has since superseded that: this is no longer a fork, it is drift. The fix is mechanical and mirrors power: nullable slots in `Sensors`, an idempotent `enableSensorsSignals(sensors)`, null-guards at the emit sites in `attachSensors`.

## Other gaps (why not higher)

- **`accuracy`/`interval`/`timestamp` are plumbed but inert on web** — every reading carries them, the web backend fills sentinels (`'unknown'`/`-1`) even where `Event.timeStamp` is available. Charter Open direction; unchanged.
- **Permission granularity is web-limited by design** — `'motion'` and generic queries collapse to `'accelerometer'`; finer scoping is a native-backend concern. The seam (`getPermissionState(sensor?)`) is shaped for it.
- **`computeRotationMatrixFromQuaternion` writes a bare `out: number[]`** rather than a typed matrix — the prior review's nit survives the rename. Ties into the fusion-homing fork (a `geometry` home would give it `Matrix3`).
- **Scratch-reuse hazard is contract-by-comment:** readings passed to listeners are scratch-reused (`sensors.ts` module scratch at file bottom; charter documents "listeners must copy"). Per the diagnostics inversion rule, a misuse warning that lives only in prose is a missing guard — an `enableSensorsGuards` catching a retained scratch reference is the canonical shape. Candidate, not violation.
- **Rust `flighthq-sensors` crate** unbuilt/unverified — cross-tree; the reading structs remain the ideal first conformance leaf once fusion homing settles.

## Charter fit

The charter's fixed Decision (dead ternary) is implemented. Its Decision/Open-direction text uses the stale `get*` helper names, and its `enableSensorsSignals` Open direction is superseded by the suite-level blessed decision — both are charter-maintenance items for the next direction session, surfaced here rather than actioned.

## Candidate open directions

- Fusion math homing (unchanged): keep the `compute*` six here vs extract the generic quaternion/Euler/matrix core to `geometry`.
- Sensor-fusion depth: a complementary/Kalman filter helper (status.md suggestion) — the next capability step for a AAA sensors library once homing is ruled.
- `enableSensorsGuards` for the scratch-reading retention hazard.
