# TS↔Rust Alignment: @flighthq/geolocation

**Verdict:** Aligned — all portable functions map 1:1 (camelCase→snake_case, full type words preserved); the one omission (`createWebGeolocationBackend`) and the two Rust-only additions are the documented seam-plus-sentinel pattern, with only a minor naming-nuance worth recording.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `clearGeoWatch` (geolocation.ts) | `clear_geo_watch` (geolocation.rs) | OK — 1:1. |
| `createGeoPosition` (geolocation.ts) | `create_geo_position` (geolocation.rs) | OK — 1:1. |
| `getCurrentGeoPosition` (geolocation.ts) | `get_current_geo_position` (geolocation.rs) | OK — `Promise<GeoPosition \| null>` → `async … -> Option<GeoPosition>` (sentinel convention carried). |
| `getGeolocationBackend` (geolocation.ts) | `get_geolocation_backend` (geolocation.rs) | OK — 1:1; lazy default-install preserved. |
| `requestGeolocationPermission` (geolocation.ts) | `request_geolocation_permission` (geolocation.rs) | OK — `Promise<boolean>` → `async … -> bool`. |
| `setGeolocationBackend` (geolocation.ts) | `set_geolocation_backend` (geolocation.rs) | OK — `null` arg → `Option<Arc<…>>` (null→Option carried). |
| `watchGeoPosition` (geolocation.ts) | `watch_geo_position` (geolocation.rs) | OK — `-1` sentinel → `GEO_WATCH_UNAVAILABLE` (= `u32::MAX`); handler `Fn` carried. |
| `createWebGeolocationBackend` (geolocation.ts) | _(not ported)_ | Expected. `rust:conformance` classifies it **web-relocated** — `navigator.geolocation` wiring belongs in `flighthq-host-web`, not the native crate. No native substrate in the box. Accounted-for, not a gap. |
| _(none)_ | `create_default_geolocation_backend` (geolocation.rs) | Rust-only. The in-crate sentinel default that replaces the absent web default. Matches the seam-plus-sentinel pattern; sibling `create_default_haptics_backend` does the same. |
| _(none)_ | `GEO_WATCH_UNAVAILABLE` (geolocation.rs) | Rust-only const. The `-1` watch sentinel expressed as `u32::MAX` (Rust uses unsigned ids; `-1` cannot be returned). Convention-faithful, language-forced. |

## In sync

- **Crate name** is identity: `@flighthq/geolocation` → `flighthq-geolocation`. No undocumented rename.
- **File name** tracks: `geolocation.ts` ↔ `geolocation.rs`; same domain basename.
- **Shared types** come from `flighthq-types` (`GeoPosition`, `GeolocationBackend`, `GeolocationRequestOptions`), matching the TS `@flighthq/types` header-layer rule. `GeoPosition` field word-for-word (`altitudeAccuracy`→`altitude_accuracy`, `timeoutMs`→`timeout_ms`, `maximumAgeMs`→`maximum_age_ms`).
- **Conventions carried:** sentinel returns (`null`→`Option`, `-1`→`GEO_WATCH_UNAVAILABLE`, `false`), `Readonly<>`→`&` borrows, `create*` allocation verb. No `dispose_*`/`destroy_*`/`acquire_*`/`release_*` apply here.
- **Module doc** is explicit about the divergence: the rustdoc header states the web backend lives in `host-web` and the in-crate default is a sentinel.
- **Tests** mirror the TS suite (fake backend yields `(1, 2)`; watch delivers latitude 3 and an incrementing id), aligned per-function with `serial_test`.

## Divergence-map note

The map covers geolocation at the **category** level (it is named in the seam-plus-sentinel lists, conformance.md L100/L126/L144) and the `createWebGeolocationBackend` omission is captured generically by the conformance script's `web-relocated` rule. What is **not** recorded anywhere is the per-function substitution `createWebGeolocationBackend` (TS) → `create_default_geolocation_backend` (Rust) — i.e. the native crate adds a `create_default_*` constructor in place of the relocated `createWeb*` one. This is consistent across the platform suite but split in naming:

- `create_default_*_backend`: `geolocation`, `haptics`
- `create_web_*_backend`: `statusbar`, `share`

Two names for the same role (the in-crate default that stands in for the relocated web backend) is a real Rust-internal inconsistency. Recommend a one-line convention entry in the divergence map fixing a single name for this stand-in (`create_default_*_backend` reads more honestly than `create_web_*` for a non-web sentinel) and noting the `createWeb* → create_default_*` substitution so it is auditable rather than silent. Not a correctness defect; a naming-consistency cleanup for the suite.
