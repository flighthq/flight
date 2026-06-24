---
package: '@flighthq/ipc'
crate: flighthq-ipc
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# ipc — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/ipc` is the renderer/app-side seam onto a host's inter-process messaging channel — the Flight-facing API for talking to a split-process host's other side (Electron renderer ↔ main, or any runtime with a main/worker/host process boundary). It exposes flat command verbs (`sendIpcMessage`, `invokeIpc`, `onIpcMessage`, and the responder/targeted/event/timeout/signal arms grown on top) over a single swappable `IpcBackend`, with a lazily-installed web default that inertly no-ops every transport call (correct for a page with no main process).

Where it ends and a neighbor begins: `ipc` owns the _transport-shaped_ messaging API and its contract; the concrete adapter that wires a real host channel lives in a `host-*` package (today `host-electron`'s `createElectronIpcBackend`). It is a runtime-backend-seam package, not a wasm-mixable value leaf — it carries a stateful active-backend slot and a listener registry, so it is all-or-nothing in the Rust mixing sense (fork D). It is distinct from `@flighthq/app` (process/identity/lifecycle), `@flighthq/protocol` (deep-link URLs), and `@flighthq/signals` (it _consumes_ signals via an opt-in group, it does not define the dispatch primitive).

## North star (proposed)

_Proposed, not blessed — edit or reject in review._

- **The backend is the only transport authority.** Every send/invoke/subscribe/target/handle concern is delegated to the active `IpcBackend`; the package itself holds no transport knowledge, only the API shape, the channel/listener bookkeeping, and the web inert default.
- **Inert, never throwing, when there is no host.** The web default no-ops `send`, resolves `invoke` to `undefined`, and returns inert unsubscribes; expected-failure paths return sentinels (`0` listeners, `null` signals) rather than throwing. A renderer with no main process is a supported, silent state.
- **Command-capability shape, full domain naming.** Flat free functions, each carrying the unabbreviated `Ipc` domain word and globally self-identifying; the `create/get/set/has`-`Backend` triad, `enable*Signals` opt-in, and `createWebIpcBackend` mirror the platform-suite convention.
- **Types-first, side-effect-free, tree-shakable.** Every cross-package type lives in `@flighthq/types` (one concept per file); `index.ts` is a thin re-export; backend and signals are lazy; nothing registers at import.

## Boundaries (proposed)

_Proposed, not blessed — edit or reject in review._

**In scope (proposed):**

- The renderer/app-facing messaging verbs and their contract (send, invoke + responder, subscribe + event/once/remove-all, targeted send, timeout wrapper, listener introspection).
- The single swappable `IpcBackend` seam plus its web inert default and the opt-in `IpcSignals` group.
- The cross-package type/contract surface in `@flighthq/types` (channel, target, event, capability, error taxonomy, port — including types specced ahead of their functions).

**Non-goals (proposed):**

- Concrete host wiring — the real channel adapter belongs in a `host-*` package, not here.
- Process identity / lifecycle / deep-link URL handling — owned by `@flighthq/app` and `@flighthq/protocol`.
- Defining the signal/dispatch primitive — owned by `@flighthq/signals`; `ipc` only opts in.

## Decisions

None blessed yet.

## Open directions

Every item below is an open question carried from the review's candidate directions and the structural forks that touch this package. None is decided.

1. **Responder ownership boundary.** Does a Flight-side invoke responder (`onIpcInvoke`) belong in `@flighthq/ipc`, or is `handle` permanently host-owned? It is a thin delegation that no-ops without a backend `handle`. This determines whether `IpcBackend.handle` stays in the contract — the central architectural question.
2. **Renderer-side vs main-side Electron backend.** `createElectronIpcBackend` is main-process-only today (`send`/`invoke` inert; no `handle`/`sendTo`/`getCapabilities`), so the Silver responder/targeted-send arms are contract-only against the one shipped host. Should `host-electron` grow a renderer-side arm (`ipcRenderer.send`/`invoke`, `ipcMain.handle`, `webContents.send`)? A `host-electron` shape decision that defines this package's realizable capability set.
3. **Is the Gold tier in scope, and in what order?** Duplex `IpcPort` (`openIpcPort`/`postIpcPortMessage`/`onIpcPortMessage`/`destroyIpcPort`), zero-copy `IpcTransferable` + `sendIpcMessageWithTransfer`, and the swappable `IpcSerializer` are designed but unbuilt. Ports/transferables are the streaming/zero-copy primitives a surface-buffer-across-processes flow needs; the serializer seam is a C/C++-shell portability bet.
4. **`ImageSource`/surface-buffer transfer semantics.** The transfer path crosses into `@flighthq/surface` and the C/C++ memory model. Is the zero-copy guarantee in scope, and how is it specified?
5. **Capability flags vs method-presence as the single source of truth.** `sendIpcMessageTo`/`onIpcInvoke` branch on method presence while `getCapabilities` is parallel and unconsulted — two truth sources that could disagree. Which is canonical, and should the in-package functions gate on `canTarget`/`canHandle`?
6. **`IpcError` realization.** The structured-error taxonomy (`IpcError` + `IpcErrorCode`: `no-handler`/`serialization-failure`/`backend-absent`) is typed but unreachable; `invokeIpc` rejects with plain `Error`. Should in-package wrappers return/carry `IpcError`, or does it stay a host-backend descriptor?
7. **`onIpcMessageEvent.reply` end-to-end.** `senderId` is hard-coded to `-1` (no backend surfaces sender identity), so `reply()` always early-returns. Is realizing reply-to-caller in scope, and which backend capability surfaces sender identity?
8. **Rust `flighthq-ipc` crate (fork D — conformance).** The charter carries `crate: flighthq-ipc` but no crate exists. The TS seam through Silver is stable enough to mirror — what is the native default backend (in-process `std::sync::mpsc` / `crossbeam` behind the `native` feature), and what TS↔Rust divergences get recorded in the conformance map?
9. **Doc-map refresh (admin).** The Package Map line still reads "`sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend" — the original three-verb framing. The package has outgrown it (responder, targeted send, event handle, timeout, signals, capabilities); the line should reflect the command-capability shape.
