---
package: '@flighthq/sensors'
updated: 2026-06-25
basedOn: ./review.md
---

# sensors — Assessment

Reasoned over `review.md` (2026-06-25 merge-gate revision: base `origin/main` `eb73c3d74`, evidence `integration-b2824e3d8` delta). The dominant fact is that this integration head does not compile — the `@flighthq/types/src/Sensors.ts` half of the change is missing — so the first recommendation is a restoration, not a refinement. Everything below the restoration is real work but moot until the build is green.

## Recommended (sweep-safe, within-package)

These are within the `sensors` cell and carry no design fork. The first one is the merge gate; the rest are cleanups that should ride along once the build compiles.

1. **Restore the `@flighthq/types/src/Sensors.ts` surface this head depends on.** Re-land the 7 new reading types (`AmbientLightReading`, `PressureReading`, `ProximityReading`, `QuaternionReading`, `RotationRateReading`) and the supporting aliases (`SensorAccuracy`, `SensorsPermissionState`, `SensorSamplingRate`, `SensorSubscribeOptions`), extend `MotionReading`/`OrientationReading` with `accuracy/interval/timestamp`, widen `SensorsBackend` to the ~20-member surface the web backend and the test fake implement, and grow `Sensors` to its 11 signals. Source of truth is the head implementation in `head/packages/sensors/src/sensors.ts`; the types must match what it imports and writes. (Strictly this edit lands in the `types` package, so it is a coordinated two-package merge, not a within-`sensors` edit — but it is non-negotiable for the sensors delta to be mergeable, so it is named here as the gate.)
2. **Collapse the dead-equal ternary in `getWebSensorsPermissionState`** (`sensors.ts:742`): `sensor === 'orientation' ? 'accelerometer' : 'accelerometer'` has identical branches. Either fold to a single expression or, if `'orientation'` is meant to map to a distinct Permissions-API name, fix the mapping. Pure within-package nit.
3. **Type the `getRotationMatrixFromQuaternion` out-parameter** (`sensors.ts:492`): replace the bare `out: number[]` with a typed/length-bracketed matrix out if matrix math stays in `sensors`. Tied to the homing fork below — sweep only if the fork lands "stays in sensors."

## Backlog (parked)

- **`enableSensorsSignals` tree-shaking gate** — _parked: needs an `npm run size` measurement that cannot be run from a static bundle._ 11 unconditional signal slots may or may not justify the opt-in gate and its added public surface.
- **Wire `timestamp` from DOM `Event.timeStamp` on web** — _parked: borders an Open direction (is the inert-field set native-only by design?)._ Currently every web reading sets `timestamp = -1` even though the source event carries a usable timestamp.
- **Rust `flighthq-sensors` crate** — _parked: cross-worktree, and gated on the fusion-math homing decision._ The value-typed `*Reading` structs and pure conversion helpers are an ideal first conformance/mixing leaf, but porting before the TS boundary settles would churn.

## Approved

_None. Approval is the user's verbal gate; this section is an append-only ledger that only the user fills. Nothing here is approved by the act of reviewing._

## Notes for the charter's Open directions

These are design forks and cross-package items — they do **not** belong in Recommended and an agent must not act on them autonomously:

- **Fusion-math homing.** Six quaternion/Euler/gravity/world-frame helpers ship in `sensors` on `*Reading` types. Ratify homing them here, or move the generic core to `geometry`/`math` and keep only `*Reading`-typed wrappers. This is the central undecided boundary and gates both the matrix-out type (Recommended #3) and the Rust crate (Backlog).
- **Inert seam fields as charter Boundary.** `accuracy` (always `'unknown'`), `timestamp` (`-1`), and the `rate` hint are plumbed through types but unconsumed on web. Bless as native-only-by-design, or commit to wiring them on web (at least `timestamp`).
- **Per-sensor permission granularity.** `getSensorsPermissionState('motion'|'orientation'|'magnetometer')` collapses `'motion'`/`'orientation'` to one Permissions-API name on web — finer scoping is a native concern or a charter goal. (Also the source of the dead ternary in Recommended #2.)
- **Stub triage / Package Map line.** The `index.md` line still reads "accelerometer, gyroscope, device orientation"; once the header is restored and the delta compiles, widen it to the 11-stream + fusion-math surface and confirm the package is no longer a triage "stub."
