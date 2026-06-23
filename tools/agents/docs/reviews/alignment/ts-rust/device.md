# TS↔Rust Alignment: @flighthq/device

**Verdict:** Near-perfect alignment — one documented backend-default flip and one undocumented Rust-only convenience function (`get_device_memory`) that needs a divergence-map entry (or removal).

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createDeviceInfo` (`device.ts`) | `create_device_info` (`device.rs`) | In sync. |
| `createSafeAreaInsets` (`device.ts`) | `create_safe_area_insets` (`device.rs`) | In sync. |
| `createWebDeviceBackend` (`device.ts`) | `create_native_device_backend` (`device.rs`) | Renamed `Web`→`Native`. Documented & intentional: rust/index.md (Host layer, line 77) lists `device` among capabilities that ship a "native default backend in-crate," flipping TS's ambient web default to native/std. The conformance script also classifies `createWeb*`/`*Backend` as `web-relocated`, so it is not flagged as a gap. Not silent drift. Consider noting the specific `createWeb*Backend → create_native_*_backend` rename pattern as an explicit row in the divergence map for traceability. |
| `getDeviceBackend` (`device.ts`) | `get_device_backend` (`device.rs`) | In sync. Rust lazily installs the native default (TS lazily installs web) — consistent with the documented flip. |
| `getDeviceInfo` (`device.ts`) | `get_device_info` (`device.rs`) | In sync. `out: DeviceInfo` → `&mut DeviceInfo`; out-param convention preserved. |
| `getSafeAreaInsets` (`device.ts`) | `get_safe_area_insets` (`device.rs`) | In sync. |
| `setDeviceBackend` (`device.ts`) | `set_device_backend` (`device.rs`) | In sync. `DeviceBackend \| null` → `Option<Arc<dyn DeviceBackend>>`; sentinel/null convention preserved. |
| — (no TS counterpart) | `get_device_memory` (`device.rs`) | **Undocumented drift.** Rust-only convenience export (`fn get_device_memory() -> i64`, returns `memory` field or `-1`) with no `@flighthq/device` equivalent. The divergence map's "Rust-only" section covers Rust-only _crates_ only, not Rust-only _functions_. Per the convention ("extra Rust functions not present upstream" must be a recorded entry with a rationale), either add it to TS as `getDeviceMemory(): number`, remove it from Rust, or record it in the divergence map. Mirrors the TS `DeviceInfo.memory` sentinel (`-1`) cleanly, so adding it upstream is the low-risk fix and keeps both sides symmetric. |

## In sync

- Package→crate name is identity: `@flighthq/device` → `flighthq-device`.
- File name tracks: TS `device.ts` ↔ Rust `device.rs`; `index.ts` ↔ `lib.rs` (standard barrel convention).
- All seven TS exports have a 1:1 Rust port with full type words preserved (`DeviceInfo`, `SafeAreaInsets`, `Device*` never abbreviated) and correct camelCase→snake_case.
- Convention carry-over is clean: out-params (`out` → `&mut`, returns `&mut`), null sentinel (`DeviceBackend | null` → `Option<...>`), and the `create*`/`get*`/`set*` verb prefixes all preserved.
- Sentinel semantics match: `createDeviceInfo` zeroes strings to `''`/`String::new()`, booleans to `false`, and `memory` to `-1` on both sides; `createSafeAreaInsets` zeroes all edges.
- The `createWebDeviceBackend → create_native_device_backend` rename is a recognized, documented divergence (ambient-default flip), not silent drift.

### Should be added to the divergence map

1. `get_device_memory` — record as a Rust-only convenience function with rationale, or (preferred) lift it into TS so the surfaces stay symmetric.
2. (Nice-to-have) An explicit row for the `createWeb*Backend → create_native_*_backend` ambient-default rename pattern, so the `Web`→`Native` swap for `device` (and its siblings) is traceable from the map, not only from rust/index.md prose + the script's `web-relocated` heuristic.
