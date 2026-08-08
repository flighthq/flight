---
package: '@flighthq/ipc'
updated: 2026-08-08
by: principal
---

# ipc — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/ipc/src/`, `packages/types/src/Ipc.ts`, and the `host-*`
packages on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The duplex-port tier is a type with no implementation.** `IpcPort` (`types/src/IpcPort.ts:10`)
  documents `openIpcPort` / `postIpcPortMessage` / `onIpcPortMessage` / `destroyIpcPort`; none of the
  four exists anywhere in `packages/`, and `IpcBackend` (`types/src/Ipc.ts:14-26`) has no `openPort`.
- **`IpcTransferable` / `sendIpcMessageWithTransfer` do not exist** — no type, no function, no
  transfer-list path. Zero-copy transfer scope is undecided, so the type is unwritten, not just
  unimplemented.
- **`IpcError` / `IpcErrorCode` have no producer and no consumer.** The plain-data error type is
  defined (`types/src/IpcError.ts:2`, `:9`) but nothing constructs it: `invokeIpc` surfaces whatever
  the backend rejects with, and the only Flight-authored rejection is `IpcTimeoutError`
  (`ipc.ts:122`).
- **Capability flags are declared but never read.** `getCapabilities` is optional on the backend
  (`types/src/Ipc.ts:25`) and the web default answers all-false (`ipc.ts:64-66`), yet every branch in
  the package tests method presence instead: `onIpcInvoke` checks `typeof backend.handle`
  (`ipc.ts:154`) and `sendIpcMessageTo` optional-chains `sendTo` (`ipc.ts:240`). Which of the two is
  canonical is unruled, and a backend can contradict itself with no seam noticing.
- **`reply` is structurally inert.** `onIpcMessageEvent` hardcodes `senderId: -1` (`ipc.ts:195`), and
  `reply` early-returns on that sentinel (`ipc.ts:198`), so it never sends even against a
  `sendTo`-capable backend. It unblocks only when a backend surfaces real sender identity, which
  needs a richer event than `IpcMessageEvent` (`types/src/Ipc.ts:36-41`) carries.
- **The one native backend is main-side only and mostly inert.** `createElectronIpcBackend`
  (`host-electron/src/electronIpc.ts:6`) implements `subscribe` over `ipcMain` but no-ops `send` and
  resolves `invoke` to `undefined`, and supplies none of `handle` / `sendTo` / `getCapabilities`.
  Neither `host-tauri` nor `host-capacitor` has an IPC backend at all, so no Silver arm is realized
  against a real host and the renderer-vs-main split is still undesigned.
- **`enableIpcSignals` is a permanent module singleton.** `_ipcSignals` (`ipc.ts:43`) is never
  cleared — there is no reset seam — so once enabled the group lives for the module's lifetime and
  test isolation needs a fresh module import.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: the parked
  "doc comment on `IpcMessageEvent.reply` stating it is inert until a backend supplies `senderId`" —
  that comment is present at `types/src/Ipc.ts:34-35`. Also dropped the Rust-crate and score
  bookkeeping (not facts about this tree).
- **2026-06-25** — Pinned the no-realizable-reply contract (`senderId` gates `reply`, not method
  presence) and the lazy `IpcSignals` group/tree-shake contract; tests only, no behavior change.
- **2026-06-24** — Silver landing: `IpcChannel` descriptors accepted everywhere a channel string is,
  plus `enableIpcSignals` / `getIpcSignals`, `invokeIpcWithTimeout` + `IpcTimeoutError`,
  `onIpcInvoke`, `onIpcMessageEvent`, `sendIpcMessageTo`, and the Bronze listener registry
  (`hasIpcBackend`, `getIpcListenerCount`, `onceIpcMessage`, `removeAllIpcListeners`).
