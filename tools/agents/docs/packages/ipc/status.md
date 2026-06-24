---
package: '@flighthq/ipc'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# ipc — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/ipc

**Session date**: 2026-06-24 **Previous score**: 72/100 (solid) **Estimated new score**: 90/100 (authoritative)

## Implemented APIs

### Bronze (contract + listener management)

**`@flighthq/types/src/Ipc.ts`** — Updated `IpcBackend` with full JSDoc contract:

- Documented `invoke` rejection semantics (plain `Error` on handler throw; `undefined` on web)
- Documented serialization model (structured-clone, no functions/class instances/DOM nodes; typed arrays cloned by default)
- Added optional `handle?(channel, handler): () => void` — in-process invoke responder
- Added optional `sendTo?(target, channel, args): void` — targeted window/process delivery
- Added optional `getCapabilities?(): Readonly<IpcBackendCapabilities>` — capability introspection

**New type files** (all in `packages/types/src/`, one concept per file):

- `IpcBackendCapabilities.ts` — `{ canSend, canInvoke, canHandle, canTarget }` capability descriptor
- `IpcChannel.ts` — `{ name: string }` typed channel descriptor
- `IpcError.ts` — `IpcErrorCode` union + `IpcError` plain-data structured error (code/message/channel)
- `IpcMessageEvent.ts` — event handle for `onIpcMessageEvent`: channel, senderId (-1 sentinel), args, reply thunk
- `IpcPort.ts` — `IpcPort` entity for duplex port (Gold-tier, typed and designed)
- `IpcSignals.ts` — `IpcSignals` opt-in signal group (onBackendChanged, onChannelMessage)
- `IpcTarget.ts` — `{ windowId: number }` targeted-send descriptor
- `IpcTimeoutError.ts` — `IpcTimeoutError extends Error` with channel/timeoutMs fields

**New functions** in `packages/ipc/src/ipc.ts`:

Bronze:

- `hasIpcBackend(): boolean` — distinguishes real native backend from lazy web default
- `getIpcListenerCount(channel): number` — count of active in-package listeners (0 for unknown channel)
- `onceIpcMessage(channel, listener): () => void` — auto-unsubscribes after first message
- `removeAllIpcListeners(channel?): void` — drop all listeners for a channel or all channels

Silver:

- `createIpcChannel(name): IpcChannel` — typed channel descriptor factory
- `enableIpcSignals(): IpcSignals` — opt-in signal group activation (lazy, tree-shaken when unused)
- `getIpcSignals(): Readonly<IpcSignals> | null` — accessor for the signals group
- `invokeIpcWithTimeout(channel, timeoutMs, ...args): Promise<unknown>` — rejects with `IpcTimeoutError`
- `onIpcInvoke(channel, handler): () => void` — in-process invoke responder (delegates to `backend.handle`)
- `onIpcMessageEvent(channel, listener): () => void` — event-shaped subscribe with `IpcMessageEvent`
- `sendIpcMessageTo(target, channel, ...args): void` — targeted window/process send

Also updated:

- `createWebIpcBackend()` — now implements `getCapabilities()` returning all-false
- All channel parameters now accept `string | Readonly<IpcChannel>` (string overloads preserved)
- `packages/ipc/package.json` — added `@flighthq/signals` dependency
- `packages/ipc/tsconfig.json` — added `../signals` reference

**Tests**: 42 tests covering all new functions, including:

- IpcChannel descriptor acceptance in all channel-accepting functions
- IpcTimeoutError fields (channel, timeoutMs)
- `onIpcInvoke` with and without backend.handle support
- `onIpcMessageEvent` event fields and reply no-op when senderId is -1
- `onceIpcMessage` auto-unsubscribe and manual cancel
- `removeAllIpcListeners` per-channel and all-channels variants
- `enableIpcSignals` singleton, onBackendChanged signal, onChannelMessage signal
- `hasIpcBackend` before/after backend install and reset
- `sendIpcMessageTo` and no-op when backend lacks sendTo
- Listener count tracking (increment, decrement on unsubscribe)

## Deferred Items and Why

### Cross-package design decisions (do not decide autonomously)

1. **Responder ownership boundary** — `onIpcInvoke` is implemented as a thin delegation to `IpcBackend.handle`, but the deeper question — whether a Flight-side invoke responder belongs in `@flighthq/ipc` vs. permanently in the host backend — is flagged as a design decision in the maturation roadmap. The current implementation is additive: if the backend has no `handle`, `onIpcInvoke` returns an inert no-op.

2. **Renderer vs main Electron backend** — `sendIpcMessageTo` and `onIpcInvoke` interact with whether the Electron backend is main-side only or also has a renderer-side arm (`ipcRenderer.send`/`invoke`). This is a `host-electron` shape decision. The `@flighthq/ipc` seam is ready; the adapter needs to grow matching arms.

3. **`IpcSerializer` seam** — Gold-tier. The maturation roadmap asks: confirm that a swappable serializer (for non-structured-clone wire formats needed by a C/C++ shell) is wanted before building. Deferred.

4. **`ImageSource`/surface-buffer transfer semantics** — The `IpcTransferable` Gold type and `sendIpcMessageWithTransfer` function cross into `@flighthq/surface` expectations. Deferred pending surface-team confirmation of zero-copy transfer scope.

### Gold-tier items not yet implemented

- **`IpcPort` / `openIpcPort` / `postIpcPortMessage` / `onIpcPortMessage` / `destroyIpcPort`** — Duplex port requires `IpcBackend.openPort` and a stateful resource lifecycle with `destroy*`. The `IpcPort` type is defined. Implementation deferred — it is the most host-specific piece and requires backend realization in `host-electron`.
- **`IpcTransferable` + `sendIpcMessageWithTransfer`** — transfer-list path for zero-copy ArrayBuffer/typed array crossing. Type needs designing; blocked on serialization scope decision.
- **Exhaustive Gold tests** — timeout-race cleanup, targeted-send on incapable backend, port lifecycle, transfer round-trip. The core behaviors are tested; the edge-case battery remains.
- **Rust `flighthq-ipc` crate** — The TS `IpcBackend` contract (through Silver) is now stable enough to mirror. Work requires the Rust worktree; deferred to a Rust-focused session.

## Concerns and Surprises

- The module-level `_ipcSignals` singleton cannot be reset between tests (no teardown API). The `getIpcSignals` test acknowledges this with a robustness check rather than relying on null-ness. A `resetIpcSignalsForTesting` export would help test isolation, but it is not part of the public API surface and is not needed here.
- `IpcPort._portId` uses an opaque numeric field with a leading underscore to signal "internal use only." The design rule prefers runtime slots, but `IpcPort` has no entity/runtime pair. This is acceptable for a value-typed entity that exists only as a handle to a native resource.
- The `reply` thunk on `IpcMessageEvent` always sets `senderId: -1` at present (no backend surfaces sender identity). This is correct behavior today but means `reply` always no-ops. The design is forward-compatible: when a backend provides sender identity, it would need to supply a richer event object. The current implementation is a safe stub.

## Suggestions for Future Sessions

1. Implement `@flighthq/host-electron` arms for `handle`, `sendTo`, `getCapabilities` — these are the most valuable Silver additions to realize against a real backend.
2. Implement `IpcPort` lifecycle once `IpcBackend.openPort` is confirmed as part of the contract.
3. Start `flighthq-ipc` Rust crate — the TS contract is now stable through Silver.
4. Add a `removeAllIpcListeners` call to the `afterEach` teardown in any test suite that registers IPC listeners, to prevent cross-test contamination.
