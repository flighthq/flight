# TS↔Rust Alignment: @flighthq/storage

**Verdict:** Strongly aligned — all eight TS verbs port 1:1 with correct snake*case/sentinel/`Option` mapping; the only gaps are the \_documented* native-vs-web default-backend flip (web `create*` → Rust `NativeStorageBackend`) and two real drifts: a missing `native` cargo-feature gate and a `set_storage_backend` panic-on-reinit that diverges from TS's null-resettable seam.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `clearStorage` / `storage.ts` | `clear_storage` / `storage.rs` | In sync. |
| `getStorageItem` / `storage.ts` | `get_storage_item` / `storage.rs` | In sync. `string \| null` → `Option<String>`. |
| `getStorageKeys` / `storage.ts` | `get_storage_keys` / `storage.rs` | In sync. `string[]` → `Vec<String>`. |
| `removeStorageItem` / `storage.ts` | `remove_storage_item` / `storage.rs` | In sync. |
| `setStorageItem` / `storage.ts` | `set_storage_item` / `storage.rs` | In sync. |
| `getStorageBackend` / `storage.ts` | `get_storage_backend` / `storage.rs` | Name in sync, **return shape differs**: TS returns a `StorageBackend` value (lazy web default); Rust returns `&'static Mutex<Box<dyn StorageBackend>>`. This is the inevitable consequence of Rust's global-slot model and is consistent with other Rust seams, but it is a per-crate signature divergence not separately recorded. |
| `setStorageBackend(StorageBackend \| null)` / `storage.ts` | `set_storage_backend(Box<dyn StorageBackend>)` / `storage.rs` | Name in sync, **behavior diverges**: (1) Rust has no `null` reset path — TS `setStorageBackend(null)` falls back to the web default, Rust cannot revert to the in-memory default. (2) Rust **panics if called twice** (`OnceLock::set` once-only), whereas TS allows reinstalling any number of times. This is a real behavioral asymmetry, not just a type mapping; not in the divergence map. |
| `createWebStorageBackend` / `storage.ts` | _(none — replaced by `NativeStorageBackend`)_ / `storage.rs` | **Documented flip.** rust/index.md §Host layer: "TS's ambient default backend is web; Rust's ambient default is native/std… `storage` (file KV)." conformance.md line 119 lists `storage` under host-web/existence-rule. The web `create*` backend is host-web work; Rust instead ships `NativeStorageBackend` (file-backed JSON) + an in-memory default. Covered at policy level, but the specific `createWebStorageBackend` → `NativeStorageBackend` rename is not in a per-crate divergence entry. |
| _(none)_ | `NativeStorageBackend` (+ `new`) / `storage.rs` | Rust-only public type: the in-crate native default per rust/index.md §Host layer. Expected by policy. **Drift:** the doc says this in-crate native backend should be "gated behind a `native` cargo feature (off for wasm)", but `Cargo.toml` has **no `native` feature** — `std::fs`, the JSON codec, and `NativeStorageBackend` compile unconditionally. This breaks the wasm build story the policy assumes. |

## In sync

- Package→crate name is identity (`@flighthq/storage` → `flighthq-storage`); no undocumented rename.
- All five pure verbs (`clear_storage`, `get_storage_item`, `get_storage_keys`, `remove_storage_item`, `set_storage_item`) match names, sentinel conventions (`false`/`None`/`[]`), and the "expected-failure, no panic" posture exactly. Doc comments mirror the TS comments nearly verbatim.
- The `StorageBackend` seam correctly lives in `flighthq-types` and is re-exported from the crate root (header-layer convention upheld).
- File-name tracking: TS `storage.ts` ↔ Rust `storage.rs`, TS `index.ts` barrel ↔ Rust `lib.rs`. Aligned.
- No teardown verbs (`dispose_`/`destroy_`/`acquire_`/`release_`) in this package, so none to preserve.
- No out-parameters in this package (all value/sentinel returns), so `out → &mut` mapping is N/A.
- The Rust `serde_json_minimal_*` helpers and `InMemoryStorageBackend` are private implementation detail of the native default, not public surface — correctly absent from TS and from the conformance count.

## Divergence-map suggestions

1. Add a per-crate `storage` divergence entry recording: web default backend (`createWebStorageBackend`) → in-crate `NativeStorageBackend` + in-memory default, per the §Host layer native-vs-web flip. The policy paragraph covers the _why_, but the specific symbol rename is searchable only by inference today.
2. Record (or fix) the `set_storage_backend` semantics: TS is reinstallable and null-resettable; Rust is once-only and panics on the second call. Either note this as an intentional `OnceLock` divergence or switch Rust to a `Mutex`-swap so it matches TS's reinstall/reset behavior.
3. Either add the documented `native` cargo feature to `flighthq-storage` (gating `NativeStorageBackend` + `std::fs` off for wasm) or amend rust/index.md if the gate is no longer the intended design — the doc and the crate currently disagree.
