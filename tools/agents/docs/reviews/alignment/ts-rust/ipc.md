# TS↔Rust Alignment: @flighthq/ipc

**Verdict:** Aligned. All native-applicable functions port 1:1 with correct snake_case names, verbs, and sentinels; the one "missing" export (`createWebIpcBackend`) is a documented `host-web` concern, and the conformance script's two other ⚠️ flags are a test-coverage gap, not name drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `@flighthq/ipc` | `flighthq-ipc` | None — package→crate is identity. |
| `ipc.ts` | `ipc.rs` | None — basename tracks. |
| `getIpcBackend` (`ipc.ts`) | `get_ipc_backend` (`ipc.rs`) | Match — full type word preserved. |
| `setIpcBackend(backend: IpcBackend \| null)` | `set_ipc_backend(backend: Option<Arc<dyn IpcBackend>>)` | Match — `null` → `Option`, sentinel convention carried. |
| `invokeIpc` | `invoke_ipc` (`async`) | Function ported correctly. **Flagged ⚠️ by `rust:conformance` only because it measures coverage by Rust _test_ names, and the crate has no `invoke_ipc_*` test.** Not a name divergence; it is a missing-test gap. |
| `onIpcMessage` | `on_ipc_message` | Function ported correctly. Same situation as above — **no `on_ipc_message_*` Rust test**, so the script flags it ⚠️. Note the listener signature differs by design: TS spreads variadic args to the listener; Rust passes a `Vec<Box<dyn Any>>`. Idiomatic and expected. |
| `sendIpcMessage` | `send_ipc_message` | Match — has a Rust test. |
| `createWebIpcBackend` | (none — lives in `host-web`) | **Documented divergence**, not drift. `conformance.md` lists `ipc` among the suite whose browser-API verbs live in `host-web`; the native core crate correctly omits the web backend and instead ships an in-crate `StubIpcBackend` (no-op), matching the "Rust ambient default is native/std" flip in `rust/index.md`. |

## In sync

- Crate name, file basename (`ipc.rs`), and Cargo `description` all match the TS package (description is verbatim).
- The three native registry/seam functions (`get_ipc_backend`, `set_ipc_backend`, `send_ipc_message`) are name- and verb-aligned and carry the `null`→`Option` sentinel.
- `invoke_ipc` and `on_ipc_message` are present and correctly named; only their Rust tests are absent.
- The web no-op semantics (`send` no-ops, `invoke` resolves to nothing, `subscribe` returns an inert unsubscribe) are preserved by `StubIpcBackend` — the Rust default backend mirrors `createWebIpcBackend`'s behavior even though the constructor itself is deferred to `host-web`.
- No extra/undocumented Rust functions; no abbreviated or renamed-without-reason symbols.

## Divergence-map notes

- The `createWebIpcBackend` omission is already covered by the bulk `host-web` entry in `conformance.md` (line listing `ipc` among browser-validated suites). No per-function entry needed, but the bulk entry is the load-bearing rationale — keep it.
- **Stale-risk on the conformance ⚠️:** the `6 / 3 / 3` row makes `ipc` look two-thirds unported, when in fact only one export (`createWebIpcBackend`) is intentionally absent and the other two ⚠️s are purely a _test_-coverage gap (`invoke_ipc`, `on_ipc_message` exist as functions). Recommend adding Rust tests `invoke_ipc_*` and `on_ipc_message_*` so the conformance signal reflects reality; the `EchoBackend` test fixture already returns a value from `invoke`, so an `invoke_ipc` assertion test is low-effort.
- Minor (non-alignment): the crate declares a `flighthq-signals` dev/dep that `ipc.rs` does not use — worth pruning, but outside this review's scope.
