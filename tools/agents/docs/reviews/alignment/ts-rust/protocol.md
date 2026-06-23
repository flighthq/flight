# TS↔Rust Alignment: @flighthq/protocol

**Verdict:** Fully aligned — all 10 native-core functions map 1:1, and the only "missing" export (`createWebProtocolBackend`) is a recorded web-relocated divergence; no drift, no stale map entries.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createWebProtocolBackend` (`protocol.ts`) | — (no `create_web_protocol_backend`; replaced by in-crate `DefaultProtocolBackend` sentinel in `protocol.rs`) | None — recorded divergence. `protocol` is listed in the "Web-relocated functions" set (conformance.md line 119); the browser-API backend lives in `host-web`, and Rust supplies a native default sentinel instead. Matches the host-layer pattern (rust/index.md: ambient default flips from web to native/std). |
| `setProtocolBackend(backend: ProtocolBackend \| null)` (`protocol.ts`) | `set_protocol_backend(backend: Option<Arc<dyn ProtocolBackend>>)` (`protocol.rs`) | None — `null` → `Option`, as required. |
| `createProtocolHandler` (`protocol.ts`) | `create_protocol_handler` (`protocol.rs`) | None. |
| `attachProtocolHandler` (`protocol.ts`) | `attach_protocol_handler` (`protocol.rs`) | None. |
| `detachProtocolHandler` (`protocol.ts`) | `detach_protocol_handler` (`protocol.rs`) | None. |
| `disposeProtocolHandler` (`protocol.ts`) | `dispose_protocol_handler` (`protocol.rs`) | None — `dispose_` teardown verb preserved. |
| `getProtocolBackend` (`protocol.ts`) | `get_protocol_backend` (`protocol.rs`) | None. |
| `isProtocolSchemeRegistered` (`protocol.ts`) | `is_protocol_scheme_registered` (`protocol.rs`) | None — `is_` boolean prefix preserved. |
| `registerProtocolScheme` (`protocol.ts`) | `register_protocol_scheme` (`protocol.rs`) | None. |
| `setProtocolSchemeAsDefault` (`protocol.ts`) | `set_protocol_scheme_as_default` (`protocol.rs`) | None. |
| `unregisterProtocolScheme` (`protocol.ts`) | `unregister_protocol_scheme` (`protocol.rs`) | None. |

## In sync

- **Crate name** is identity: `@flighthq/protocol` → `flighthq-protocol`. No undocumented rename.
- **File names track:** TS `protocol.ts` ↔ Rust `protocol.rs`; barrel `index.ts` ↔ `lib.rs`. Same domain basename.
- **All 10 native-core functions** map 1:1 with correct camelCase→snake_case and full type words preserved (no abbreviation; `ProtocolScheme`, `ProtocolHandler`, `ProtocolBackend` words intact).
- **No extra Rust functions** beyond the upstream set (the only added items are the private `DefaultProtocolBackend` struct and `ProtocolSubscription` internal state, not public API).
- **Conventions carry across:** sentinel returns (`bool` false / `Option`), `&str` params, `dispose_`/`detach_`/`attach_` verbs, and the `get_*_backend`/`set_*_backend` seam pattern all match.
- **Backend trait shape matches:** `ProtocolBackend` exposes `register`/`unregister`/`is_registered`/`set_as_default`/`subscribe` in both, with `subscribe` returning an unsubscribe closure in both.
- **Conformance script** reports 1 ⚠️ for protocol (`createWebProtocolBackend`), which the map already accounts for — not a real gap.

**Divergence map status:** Current. The `protocol` entry in the "Web-relocated functions" list (conformance.md line 119) accurately covers the single difference. Nothing to add; no entry looks stale. (Optional nicety: the map covers `createWeb*Backend` relocation generically but does not name the Rust-side replacement pattern — an in-crate `Default*Backend` sentinel — per crate; this is consistent across the host suite and does not need a per-crate note.)
