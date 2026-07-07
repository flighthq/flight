---
package: '@flighthq/ipc'
crate: flighthq-ipc
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# ipc — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Renderer/app-side seam onto a host's inter-process messaging channel -- the Flight-facing API for talking to a split-process host's other side (Electron renderer-to-main, or any runtime with a main/worker/host process boundary). Exposes flat command verbs (`sendIpcMessage`, `invokeIpc`, `onIpcMessage`, plus responder/targeted/event/timeout/signal arms) over a single swappable `IpcBackend`, with a lazily-installed web default that inertly no-ops every transport call. 17 exports covering send, invoke, subscribe, targeted send, timeout wrapper, listener introspection, and the backend seam.

## Decisions

- **[2026-07-02] Fix test fixture method mismatches.** Test fixtures have method signature mismatches against the current `IpcBackend` contract. Fix to align with the actual backend interface.
- **[2026-07-02] `senderId` and `reply()` are backend-dependent.** `senderId` is hardcoded to `-1` and `reply()` always no-ops because no current backend surfaces sender identity. This is correct behavior for the web default and the current Electron main-process-only backend. A real value requires a backend that provides sender identity (e.g. an Electron renderer-side backend with `webContents` access).

## Open directions

- Responder ownership: whether `onIpcInvoke` (Flight-side invoke handler) belongs here or stays permanently host-owned.
- Renderer-side Electron backend: the current `createElectronIpcBackend` is main-process-only. Main-to-renderer messaging needs either a seam change or a window-specific factory.
- Duplex `IpcPort`, zero-copy `IpcTransferable`, and swappable `IpcSerializer` are designed but unbuilt (Gold tier).
- `IpcError` structured error taxonomy is typed but unreachable; `invokeIpc` rejects with plain `Error`.
