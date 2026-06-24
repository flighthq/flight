---
package: '@flighthq/sensors'
updated: 2026-06-24
basedOn: ./review.md
---

# sensors — Assessment

Sorted from `review.md` and the prior `reviews/maturation/depth/sensors.md` roadmap (now spent — the session absorbed all of Bronze, all of Silver, and most of Gold, taking the package from 55/100 to `solid` 80/100). The roadmap's remaining residue is the Gold tail: native-only streams, accuracy/ calibration, the fusion-math home decision, and the Rust crate.

The package is in good shape: idiomatic event-entity + swappable backend, 11 streams, full availability/permission introspection, alias-safe out-param fusion helpers, clean header-layer discipline. The dominant findings are not "build more" but **ratify decisions the worker made without a charter** — fusion math homed in `sensors`, the breaking `onGyroscope` reshape, three plumbed-but- inert fields — plus a native-backend / Rust-crate tail that cannot be exercised on web. Almost everything concrete therefore hangs off an Open direction or crosses a package boundary, so `Recommended` is deliberately small. The design forks and cross-package items route to the charter's Open directions (see end), not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/sensors`, no cross-package coupling, no breaking change, no open design decision.

- **Remove the dead `_absoluteOrientationQuaternion` scratch object.** It is allocated and written in the `subscribeAbsoluteOrientation` Generic-Sensor path purely to feed `getEulerFromQuaternion`, while the `subscribeQuaternion` path already exposes the quaternion directly — so the scratch is redundant. The worker status itself flags it as a minor cleanliness issue. Within-package, purely cosmetic, decides nothing. (review.md "Gaps" — dead scratch object.)

## Backlog

Parked: each waits on an Open direction, crosses a package boundary, is native-backend-only, or is a separate Rust-port task. Reason given per item.

**Gated on Open direction #2 (are `accuracy` / `timestamp` / `rate` native-only by charter, or web gaps?) — do not sweep:**

- **Source `timestamp` from the DOM `Event.timeStamp` on the web backend.** The web handlers set `timestamp = -1` unconditionally even though `Event.timeStamp` is available — the one "calibration-class" field the web backend _could_ fill and does not. The fix is a one-line within-package change, but the review explicitly raises whether `timestamp` should be web-sourced or left native-only as a charter Boundary (#2). Not sweep-safe until that line is drawn. (review.md "Gaps" — `timestamp` always `-1`; open direction #2.)
- **Wire the `rate` hint, or document its native-only asymmetry at the type.** `SensorSubscribeOptions.rate` (`'ui'|'normal'|'game'|'fastest'`) is declared in types and accepted by every `subscribe*`, but the web backend reads only `frequency`; `rate` is consumed nowhere (zero `.rate` reads in source). On web this is defensible, but the field is effectively native-backend-only with nothing documenting the asymmetry. Whether that is blessed-as-native-only (then a type comment) or a gap is decision #2. (review.md "Gaps" — `rate` declared but unwired; open direction #2.)
- **Populate `accuracy` (currently always `'unknown'` on web).** Inert in the default backend; a native host fills it. Same #2 decision — is the field a native-only Boundary or a documented degrade? Native work besides, so doubly parked. (review.md "Gaps" — `accuracy` always `'unknown'`.)

**Gated on Open direction #3 (`enableSensorsSignals` tree-shaking gate):**

- **Gate the 11 signal slots behind an `enableSensorsSignals` opt-in group.** The entity now allocates 11 signals unconditionally; the signals `enable*` convention permits an opt-in group, but it adds public surface and is only worth it if the unused-stream weight is real. The roadmap explicitly says _measure with `npm run size` before committing_. The size measurement is sweep-safe; the split-or-not is a design decision (#3). (review.md open direction #3; roadmap Silver "Signals opt-in group".)

**Native-backend-only — defer until a `host-*` exists to validate the seam:**

- **Uncalibrated gyroscope / magnetometer streams** (`subscribeUncalibratedGyroscope` / `subscribeUncalibratedMagnetometer`, raw + bias) — Android `TYPE_*_UNCALIBRATED`, CoreMotion raw+bias. No web equivalent; correctly deferred. (review.md "Gaps"; roadmap Gold.)
- **Exotic native streams** — step counter / step detector, pedometer, significant-motion, heart rate. No web equivalent; guarded sentinels on web, real only on a native host. (review.md "Gaps"; roadmap Gold.)

**Cross-package / admin-doc — not within `@flighthq/sensors`:**

- **Widen the Package Map line in `index.md`.** It still reads "accelerometer, gyroscope, device orientation"; the package now spans 11 streams plus fusion math. Edits a shared admin doc outside the package cell, and should land together with the fusion-math scope ruling (#1, whether quaternion/ orientation math is in-scope here). Routed with #1. (review.md "Contract & docs fit" — stale Package Map line.)
- **Reflect `crate: flighthq-sensors` as "TS-only, crate pending" in the conformance map / register.** The charter front-matter asserts the crate but none exists. A register/conformance-map edit, not package source. (review.md "Contract & docs fit".)

**Separate Rust-worktree task — gated on the TS seam stabilizing and on #1:**

- **Build the `flighthq-sensors` crate** mirroring the matured seam 1:1 — `SensorsBackend` trait + `set_sensors_backend`, snake*case free functions, `*Reading`structs as plain`Copy`value types,`Option`/`bool`sentinels, native default behind the`native` feature, fusion math as a value-typed \_mixing\*-eligible module fingerprinted headlessly. The value-typed readings + pure conversion helpers are ideal first conformance/mixing targets, which is itself an argument for the fusion-math home decision (#1). A Rust-port task, not in-package TS work. (review.md "Gaps" — no Rust crate; roadmap Gold/§7.)

## Approved

_None. Approval is the user's verbal gate._

---

### Routed to the charter's Open directions (for an explicit conversation — charter not edited here)

The charter is a stub (`North star` / `Boundaries` / `Decisions` / `Open directions` all `TODO`), so the session made several rulings with no charter to authorize them. These are the design forks the `Backlog` items hang off; settle them before sweeping the gated work. Two (#1, #4) are decisions the worker _already made by shipping_ and need ratification, not fresh debate.

1. **Where does sensor-fusion math live — `sensors` or `geometry`?** The session homed six quaternion/Euler/gravity/world-frame helpers in `sensors` (the roadmap and prior depth review both flagged this as a human decision; it was decided implicitly by shipping). They are sensors-shaped (they speak `OrientationReading`/`QuaternionReading`, not generic `Matrix`/`Vector3`), so keeping them here is defensible — but ratify it, or move the generic core to `geometry`/`math` and keep only the `*Reading`-typed wrappers. This is the package's central undecided boundary and the gate on the Rust crate's mixing story. (Cross-package: `geometry`/`math`.)
2. **Are `accuracy` / `timestamp` / `rate` native-only by charter design, or web gaps?** Three fields are plumbed through types but inert/unconsumed on the web backend. Bless them as native-only (then document the asymmetry at the type), or decide that `timestamp` at least should be sourced from `Event.timeStamp` on web. Gates the three #2 Backlog items.
3. **`enableSensorsSignals` tree-shaking gate?** 11 signal slots allocate unconditionally. Decide whether the unused-stream weight (measure with `npm run size`) warrants the opt-in gate the signals convention permits, against the public surface it adds.
4. **Bless the breaking `onGyroscope` reshape** (`MotionReading` → `RotationRateReading`, deg/s with named alpha/beta/gamma axes) as a charter **Decision** so it is not re-litigated. Correct under the no-back-compat rule, but the ruling currently lives only in a worker status doc.
5. **Per-sensor permission granularity.** `getSensorsPermissionState('motion'|'orientation'|'magnetometer')` exists, but the web mapping collapses `'motion'` and `'orientation'` to the same `'accelerometer'` Permissions-API name. Is finer per-sensor scoping a native-backend concern or a charter goal?
