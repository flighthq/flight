# TS↔Rust Alignment: @flighthq/power

**Verdict:** In sync — all native-appropriate functions are ported 1:1 with correct snake_case names; the only TS function absent from the crate (`createWebPowerBackend`) is a browser-API backend sanctioned for `host-web` by the conformance map, and the crate's one extra symbol is the native stub backend the Rust host pattern requires.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebPowerBackend` (power.ts) | — (no Rust fn) | Expected divergence, recorded. Web-only backend over the Battery Status API + Screen Wake Lock API; lives in `host-web` per conformance.md line 119 (`power` is in the platform-integration WEB_PACKAGES set; `scripts/rust-conformance.ts` line 209). The crate's `StubPowerBackend` is the native default backend, matching rust/index.md "Host layer" (native ambient default, gated stub). Not a gap. |
| `attachPower` (power.ts) | `attach_power` (power.rs) | Present and correctly named, but no colocated Rust test. Flagged "missing" by the conformance script only because it lacks a ported test (classified `web-relocated`). Unlike `createWebPowerBackend`, this function is pure signal/subscription wiring with no browser API, so it is natively testable; a ported test would close the coverage gap. Minor. |
| `detachPower` (power.ts) | `detach_power` (power.rs) | Same as above — ported, correct name, native-testable, no colocated test. Minor. |
| `disposePower` (power.ts) | `dispose_power` (power.rs) | Same as above — `dispose_*` teardown verb preserved correctly; ported, no colocated test. Minor. |

## In sync

- Package→crate name is identity: `@flighthq/power` → `flighthq-power`. No undocumented rename.
- File names track: TS `power.ts` ↔ Rust `power.rs`; barrel `index.ts` ↔ `lib.rs`. Test `power.test.ts` ↔ inline `#[cfg(test)] mod tests` in `power.rs`.
- Fully ported with matching names and tests: `createPower`→`create_power`, `createPowerStatus`→`create_power_status`, `getPowerBackend`→`get_power_backend`, `getPowerStatus`→`get_power_status`, `setPowerBackend`→`set_power_backend`, `setPowerKeepAwake`→`set_power_keep_awake`. Full type words preserved (no abbreviation).
- Conventions carry across correctly:
  - Out-param: `getPowerStatus(out)` → `get_power_status(&mut PowerStatus)` returning the borrow; alias-safe (reads inputs into the backend before writing).
  - Sentinel: `setPowerBackend(PowerBackend | null)` → `set_power_backend(Option<Arc<dyn PowerBackend>>)`; `null` → `None`. `batteryLevel: -1` sentinel mirrored as `-1.0`. `setPowerKeepAwake` returns `bool` in both.
  - Teardown verb: `dispose_power` correctly used (detach-and-release-to-GC; no native resource, so `destroy_*` would be wrong) — matches TS `disposePower`.
- No extra Rust public functions beyond the TS surface. `StubPowerBackend` is a private struct, not an exported function, and is the expected native ambient default (the Rust counterpart to TS's lazy `createWebPowerBackend` default), so it is not undocumented API drift.

### Suggested divergence-map note

The `power` web-relocation is already covered by the blanket platform-suite entry (conformance.md line 119). No new map entry is required. One nuance the map blanket obscures: of the 4 functions the script flags for `power`, only `createWebPowerBackend` is genuinely web-relocated — `attach_power` / `detach_power` / `dispose_power` are present in the crate and natively testable, so their "gap" is a missing test, not a missing/relocated function. Adding the three small ported tests would drop the flag from 4 to 1 and make the remaining count exactly match the one true web-relocated function.
