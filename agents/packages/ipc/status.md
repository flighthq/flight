---
package: '@flighthq/ipc'
updated: 2026-08-30
by: principal
---

# ipc — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/ipc/src/`, `packages/types/src/Ipc.ts`, and the
`host-*` packages on 2026-08-30 after the R3 reduction.

- **One provider, and no second opinion.** `host.ipc.message` is Electron-only. Web, Tauri, and
  Capacitor ship `ipc: {}` with a comment naming why. A single provider means the seam has never been
  cross-checked against a disagreeing implementation.
- **Four platform operations are unbuilt and deliberately not members of this slot.** Electron
  supports main-to-renderer send, targeted send, invoke, and handle. Each needs a specific
  `webContents` target or a request/response pair, so each is a distinct capability with its own
  provider rather than a method hung on `message`.

Resolved by the R3 slice: the unimplemented duplex-port tier, channel wrapper, aggregate `IpcBackend`,
capability/target/event/error families, ambient resolver, sentinel, diagnostics, signals, and fabricated
operations were deleted. There is no runtime arm that can answer for a provider that is not present.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — R3 reduced IPC to the one capability a host provides: top-level
  `Host.ipc.message`, Electron-only, behind exact `HasIpcMessage`. `IpcMessageBackend` extends `Entity`
  and its constructor composes `createEntity`; `onceIpcMessage` handles synchronous delivery during
  subscription acquisition. Per-subscription cleanup owns the acquired listener, so the provider has
  no whole-provider destroy.
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
