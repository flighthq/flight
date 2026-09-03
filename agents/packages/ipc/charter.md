---
package: '@flighthq/ipc'
role: package
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

Explicit, operation-tight inter-process messaging over a caller-supplied `Host`. The package exposes six flat functions: `invokeIpc`, `onIpcInvoke`, `onIpcMessage`, `onceIpcMessage`, `sendIpcMessage`, and `sendIpcMessageTo`. Each function requires the exact `HasIpc*` witness for the one slot it consumes and reads that slot directly. The required `ipc` Host group has five independent optional slots: `handle`, `invoke`, `message`, `send`, and `targetedSend`. There is no aggregate backend, resolver, sentinel, installed state, missing-provider runtime arm, or web default. Electron renderer adapters provide `send` and `invoke`; Electron main adapters provide `message`, `handle`, and generic targeted send. Target identity belongs to the caller and provider: IPC core is generic in the target type and never names Electron `WebContents`, while the Electron boundary requires only the narrow structural `ElectronIpcTarget` send facade. Every backend is an Entity, and subscription/handler registration returns explicit release ownership.

## Decisions

- **[2026-07-02] Fix test fixture method mismatches.** Test fixtures have method signature mismatches against the current `IpcBackend` contract. Fix to align with the actual backend interface.
- **[2026-07-02] `senderId` and `reply()` are backend-dependent.** `senderId` is hardcoded to `-1` and `reply()` always no-ops because no current backend surfaces sender identity. This is correct behavior for the web default and the current Electron main-process-only backend. A real value requires a backend that provides sender identity (e.g. an Electron renderer-side backend with `webContents` access).

- **[2026-09-02] IPC capabilities are operation-tight and process-side explicit.** `message`, `send`, `invoke`, `handle`, and `targetedSend` are independent Host slots. Electron renderer owns `send` and `invoke`; Electron main owns `message`, `handle`, and `targetedSend`. Every Flight operation takes the exact capability witness, so unsupported operations are compile-time errors rather than inert sentinel answers. Targeted send stays generic in the provider/caller target type; Electron knowledge is confined to the narrow structural send facade at the adapter boundary. All five backends carry Entity identity, registration releases are explicit, and the stale `@flighthq/signals` dependency is removed. This closes review gaps 1-3 and 6. Landed in `0c1199cd9`.

  **Why:** Electron's renderer and main processes expose different real capability vectors. An aggregate backend would either lie about coverage or reintroduce optional methods and runtime fallbacks. Independent slots make capability presence a Host-construction fact. A generic target keeps IPC portable while allowing Electron `WebContents` or richer application-owned handles to satisfy the platform boundary structurally.

  **Supersedes both 2026-07-02 entries above, which are left in place because this ledger is append-only.** There is no longer an `IpcBackend` contract for test fixtures to mismatch, and the `senderId` / `reply()` ruling described the single main-process-only backend and the web default, neither of which now exists.

## Open directions

- Duplex `IpcPort`, zero-copy `IpcTransferable`, and a swappable `IpcSerializer` remain designed but unbuilt (Gold tier).
- A separately imported diagnostics layer for dynamic assembly and JavaScript callers remains open; typed callers already receive a compile-time error when a capability witness is absent.
