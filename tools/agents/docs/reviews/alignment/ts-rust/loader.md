# TS↔Rust Alignment: @flighthq/loader

**Verdict:** Aligned on the three authoritative exports (1:1, names exact, file/crate names track); two extra Rust accessor functions and the async→sync model are reasonable port adaptations but are not recorded in the divergence map, and the `lib.rs` doc comment is stale.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createResourceLoader` (`resourceLoader.ts`) | `create_resource_loader` (`resource_loader.rs`) | In sync. |
| `queueResourceLoad` (`resourceLoader.ts`) | `queue_resource_load` (`resource_loader.rs`) | Name maps 1:1. Behavioral divergence: TS returns `Promise<T>`; Rust returns a `ResourceLoadResult<T>` handle. Late-queue is a `throw` (TS) → `panic!` (Rust) — correct per the programmer-error convention. Async→sync model not in the divergence map. |
| `startResourceLoad` (`resourceLoader.ts`) | `start_resource_load` (`resource_loader.rs`) | Name in sync. TS runs queued factories concurrently; Rust runs them synchronously in queue order (no async runtime in the workspace). Documented in the module doc only. |
| — (no TS export) | `get_resource_loader_progress` (`resource_loader.rs`) | Extra Rust function with no TS counterpart. Needed because Rust has no `Promise`; not flagged by `rust:conformance` (it only checks TS→Rust presence, not extra Rust fns) and not in the divergence map. |
| — (no TS export) | `get_resource_loader_result` (`resource_loader.rs`) | Extra Rust function. This is the read-side of the sync handle model that replaces the TS `Promise<T>` return. Reasonable, but unrecorded drift. |
| `ResourceLoader` (type, `@flighthq/types`) | `ResourceLoaderHandle` (`resource_loader.rs`) | TS `ResourceLoader` exposes only signals; the queue/counters live behind a `ResourceLoaderInternal` cast. Rust splits this into a public `ResourceLoaderHandle` wrapping `flighthq_types::ResourceLoader`. Structural adaptation (no cast trick in Rust); acceptable, the public `ResourceLoader` type is still the shared seam. |
| `crate name` | `flighthq-loader` | In sync — identity. The former `resources-loader` → `loader` rename is recorded in `conformance.md` (line 39). |

## In sync

- **All three authoritative TS exports are present** in Rust with exact `camelCase→snake_case` names and the full `ResourceLoader` type word preserved. `rust:conformance` reports no missing loader functions.
- **File names track:** `resourceLoader.ts` ↔ `resource_loader.rs`; barrel `index.ts` ↔ `lib.rs`.
- **Crate name is identity** with the TS package; the prior `resources-loader` name is a recorded, applied rename in the conformance map.
- **Convention carry-over:** out/handle params via `&mut ResourceLoaderHandle`; sentinel `Option` for "not yet resolved" results; late-queue programmer error is `panic!` (matching the TS `throw` → panic rule). No teardown verbs apply here (GC-managed, nothing to dispose/destroy).
- **Signals** map cleanly: `onProgress`/`onError`/`onComplete` ↔ `on_progress`/`on_error`/`on_complete` with `ResourceLoadProgress` payload and `()` for bare notifications.

## Should be added to the divergence map

The loader has a real, locked-in async→sync model divergence that is currently only described in the `resource_loader.rs` module doc, not in `conformance.md`'s divergence map. Add an entry under the value-type / no-async-runtime divergences:

- TS `queueResourceLoad` returns `Promise<T>`; Rust returns a `ResourceLoadResult<T>` handle read via the extra `get_resource_loader_result` (plus `get_resource_loader_progress`) because the workspace has no async runtime, and `startResourceLoad` runs tasks synchronously in order rather than concurrently. The two extra Rust functions are the read-side of that handle model.

## Minor

- The `lib.rs` crate-level doc comment is stale relative to `resource_loader.rs`: it says loads run "concurrently" and that each queued task "returns a `Future`," whereas the implementation (and the `resource_loader.rs` module doc) runs them synchronously in queue order and returns a `ResourceLoadResult` handle. Reconcile `lib.rs` to the actual sync model.
