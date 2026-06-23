# Depth Review: @flighthq/ipc

**Domain**: Inter-process messaging — the renderer/app side of a host IPC channel (e.g. Electron renderer ↔ main, or any split-process host), over a swappable backend with a web no-op default.

**Verdict**: solid — 72/100

The package is intentionally a thin, host-agnostic **seam** rather than a self-contained IPC engine. Within its declared scope — "send, invoke, per-channel subscribe over a swappable web/native backend" — it implements the canonical three-verb messaging primitive completely, cleanly, and with full test coverage. It is not a "stub" (no `TODO`, no unimplemented branch, no missing test); it is a deliberately small command-capability cell in the platform suite. But measured against an _authoritative_ IPC library it is missing several primitives that a mature host-IPC layer is expected to expose, and most of those gaps are missing-by-omission, not missing-by-design.

## Present capabilities

The package exposes exactly six functions plus the `IpcBackend` contract (in `@flighthq/types`):

- `sendIpcMessage(channel, ...args)` — fire-and-forget, renderer→host. Variadic args packed to an array at the seam.
- `invokeIpc(channel, ...args): Promise<unknown>` — request/response round-trip; resolves the host's response (or `undefined` on web).
- `onIpcMessage(channel, listener): () => void` — per-channel subscription, host→renderer, returns an unsubscribe. Incoming args are spread back to the listener, symmetric with `sendIpcMessage`'s variadic shape.
- `createWebIpcBackend()` — the inert web default: `send` no-ops, `invoke` resolves `undefined`, `subscribe` returns an inert unsubscribe. Correct behavior for a context with no main process.
- `getIpcBackend()` / `setIpcBackend(backend | null)` — backend accessor + installer with lazy web fallback; `null` resets to web.

This matches the platform suite's **command-capability** shape exactly (flat functions + `get*/set*/createWeb*Backend`), and it is the canonical Electron triad: `send` ↔ `ipcRenderer.send`/`ipcMain.on`, `invoke` ↔ `ipcRenderer.invoke`/`ipcMain.handle`, `subscribe` ↔ `ipcMain.on`/`webContents.send`. The `createElectronIpcBackend` adapter in `@flighthq/host-electron` confirms the seam realizes against a real host. Test coverage is complete: every exported function has a colocated test, including the unsubscribe path, variadic round-tripping, and the `null`→web-fallback reset.

## Gaps vs an authoritative IPC library

A mature host-IPC layer (Electron's `ipcRenderer`/`ipcMain`, Tauri's `event`/`invoke`, Chrome extension messaging) typically also provides:

- **A reply/responder side for `invoke` (missing-by-design, partially).** This package is explicitly the _caller_ side; the _handler_ registration (`ipcMain.handle`-equivalent, e.g. `onIpcInvoke(channel, handler)`) lives in the host backend. That split is defensible for a renderer-facing cell, but an authoritative library names the responder seam so a same-process or in-app responder is reachable. Right now there is no Flight-side way to _answer_ an invoke; it is entirely delegated.
- **Removable/once listeners and listener introspection (missing-by-omission).** Only `onIpcMessage` (returns unsubscribe). No `onceIpcMessage`, no `removeAllIpcListeners(channel)`, no `getIpcListenerCount`. Mature IPC APIs offer all three.
- **Targeted send / sender identity (missing-by-omission).** `send` is broadcast-on-a-channel only. There is no concept of a target window/frame/process id, and `onIpcMessage` listeners receive only args — no `IpcEvent`/sender handle to reply to a specific caller. Electron's `event.sender`, `event.reply`, and `senderFrame` have no analogue.
- **Error propagation contract (missing-by-omission).** `invokeIpc` resolves `unknown` and the web default resolves `undefined`; there is no documented rejection semantics for a host handler that throws, no timeout, and no way to distinguish "no main process" (web) from "host returned undefined". An authoritative `invoke` defines how remote errors surface.
- **Streaming / ports / transferables (missing-by-design).** No `MessagePort`/`MessageChannel`-style duplex ports, no transferable/structured-clone guarantees, no backpressure. Reasonable to leave to the host, but worth an explicit note.
- **Serialization contract (under-specified).** `args: readonly unknown[]` crosses a process boundary, but nothing states the serialization model (structured clone? JSON? what about functions, typed arrays, `ImageSource` buffers — directly relevant to this SDK). For a C/C++ port and for Rust conformance this is load-bearing and currently unstated.

## Naming / API-shape notes

- Naming is exemplary and on-convention: every exported function carries the full unabbreviated domain word (`sendIpcMessage`, `invokeIpc`, `onIpcMessage`, `getIpcBackend`), self-identifying without context, and the `createWeb*Backend`/`get*Backend`/`set*Backend` triad matches every other command capability in the suite. `send`/`invoke`/`subscribe` are the right, instantly-transferable verbs.
- The variadic-in / array-at-seam / spread-out symmetry between `sendIpcMessage` and `onIpcMessage` is a nice, deliberate touch and is tested.
- Package is correctly `"sideEffects": false`, root-only export, lazy backend with no top-level registration — fully tree-shakable and side-effect-free per the ground rules.
- One asymmetry: there is `onIpcMessage` (host→renderer subscribe) and `invokeIpc` (renderer→host request), but no named _handler_ counterpart for invoke. If a responder seam is ever added it should mirror this naming (`onIpcInvoke`).

## Recommendation

Keep the verdict as **solid**, not authoritative. The core triad is correct, idiomatic, fully tested, and properly shaped as a swappable seam — this is a faithful, well-named renderer-side IPC primitive. To reach AAA depth for the domain _as exposed in-SDK_, prioritize: (1) define the `invoke` error/rejection and timeout contract and the serialization model in the `IpcBackend` doc comment (cheap, high-value, port-relevant); (2) add `onceIpcMessage` and `removeAllIpcListeners`; (3) decide whether a Flight-side invoke _responder_ seam (`onIpcInvoke`) belongs here or is permanently host-owned, and document that boundary either way. Targeted-send / sender-identity and MessagePort-style ports can stay host-backend concerns but should be explicitly called out as missing-by-design rather than left silent.
