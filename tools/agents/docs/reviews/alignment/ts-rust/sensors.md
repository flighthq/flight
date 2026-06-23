# TS↔Rust Alignment: @flighthq/sensors

**Verdict:** In sync — all 9 portable functions map 1:1 with correct naming/verbs/sentinels; the single TS-only function (`createWebSensorsBackend`) is a browser-bound divergence already recorded in the conformance map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebSensorsBackend` (`sensors.ts`) | — (no port; in-crate `StubSensorsBackend`) | Expected divergence, **already documented**. The web backend wraps browser-only APIs (`devicemotion`/`deviceorientation` window events, Generic Sensor API `Magnetometer`, `DeviceMotionEvent.requestPermission`). Per `rust/conformance.md` line 119, `sensors` is listed among the capabilities whose `createWeb*Backend` lives in `host-web`; the native crate holds only the seam (`get_sensors_backend`/`set_sensors_backend`) plus a no-op `StubSensorsBackend` default. No fix needed; not silent drift. |

No undocumented name divergence, no missing ports, no abbreviated names, no extra Rust functions beyond the test-only `FakeBackend`/`StubSensorsBackend` helpers (not public exports).

## In sync

- **Package → crate name:** `@flighthq/sensors` → `flighthq-sensors` (identity). ✔
- **File names:** `sensors.ts` ↔ `sensors.rs`; barrel `index.ts` ↔ `lib.rs`. ✔
- **9/9 portable functions** map 1:1 with camelCase→snake_case and full type words preserved:
  - `attachSensors` → `attach_sensors`
  - `createMotionReading` → `create_motion_reading`
  - `createOrientationReading` → `create_orientation_reading`
  - `createSensors` → `create_sensors`
  - `detachSensors` → `detach_sensors`
  - `disposeSensors` → `dispose_sensors`
  - `getSensorsBackend` → `get_sensors_backend`
  - `requestSensorsPermission` → `request_sensors_permission`
  - `setSensorsBackend` → `set_sensors_backend`
- **Teardown verbs preserved:** `dispose_sensors` (detach/release-to-GC) and `detach_sensors` carry the TS meanings; no `destroy_*` misuse.
- **Sentinels carry:** `request_sensors_permission` returns `bool` (`true` when ungated); `create_orientation_reading` sets `heading: -1.0` (unknown), matching TS `-1`.
- **Backend seam:** `get_sensors_backend`/`set_sensors_backend` present; `set` takes `Option<Arc<dyn SensorsBackend>>` mirroring TS `SensorsBackend | null`, with lazy default (stub on Rust, web on TS). ✔
- **Idempotent attach + subscription teardown semantics** match (prior subscription torn down first; combined unsubscribe).
- **Type layer aligned:** `flighthq-types` `Sensors` carries `on_accelerometer`/`on_gyroscope`/`on_magnetometer`/`on_orientation` (snake_case 1:1), plus `MotionReading`, `OrientationReading`, `SensorsBackend`.

No new divergence-map entries required; the existing line-119 entry covers this crate and does not look stale.
