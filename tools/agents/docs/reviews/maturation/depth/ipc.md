# Maturation Roadmap: @flighthq/ipc

**Current verdict**: solid — 72/100. The canonical three-verb host-IPC seam (`send`/`invoke`/`subscribe`) is correct, idiomatic, fully tested, and properly shaped as a swappable backend, but it is missing several primitives a mature host-IPC layer is expected to expose, most missing-by-omission rather than by design.

This package is deliberately a thin **command-capability cell**, not a self-contained IPC engine. The frontier here is not "more transport" — it is closing the named gaps a renderer-side IPC consumer reaches for (once/remove listeners, an error/timeout/serialization contract, a responder seam, targeted send) while keeping every transport concern delegated to the host backend. Most of the work is in `@flighthq/types` (the contract) and in colocated free functions, not in new dependencies.

## Bronze

The minimum genuinely-useful version: pin down the contract that is currently unstated, and add the listener-management verbs every IPC API ships. All cheap, all high-value, all renderer-side.

- **Document the `invoke` rejection + serialization contract on `IpcBackend`** (in `@flighthq/types/src/Ipc.ts`). State explicitly: a host handler that throws → the returned `Promise` rejects (with a plain `Error`, not a wrapper type); web default resolves `undefined` (the "no main process" sentinel); the serialization model is structured-clone over the `args` boundary (functions, class instances, and DOM nodes are not transferable; typed arrays and `ImageSource` pixel buffers are). This is load-bearing for the Rust port and the C/C++ boundary and currently has no written contract.
- **`onceIpcMessage(channel, listener): () => void`** — subscribe that auto-unsubscribes after the first message; still returns an unsubscribe for the not-yet-fired case. Implemented in-package over `subscribe` (no backend change needed).
- **`removeAllIpcListeners(channel?): void`** — drop every in-package listener for a channel (or all channels when omitted). Tracked in a package-local `Map<string, Set<...>>` so it works regardless of backend, mirroring how `onIpcMessage` already wraps `subscribe`.
- **`getIpcListenerCount(channel): number`** — count of active in-package listeners on a channel; `0` for an unknown channel (sentinel, not throw). Reads the same local registry.
- **`hasIpcBackend(): boolean`** — distinguish "a real native backend is installed" from the lazy web default, so callers can branch instead of inferring from an `undefined` invoke result.

## Silver

Competitive and solid: name the responder seam, add the round-trip ergonomics (timeout), and give listeners a sender/event handle so reply-to-caller flows are expressible — matching Electron/Tauri-class libraries.

- **`onIpcInvoke(channel, handler): () => void`** — the responder counterpart to `invokeIpc`, mirroring `ipcMain.handle`. Requires a new `IpcBackend.handle(channel, handler)` method in `@flighthq/types`; web default returns an inert unsubscribe, electron backend maps to `ipcMain.handle`. This closes the one naming asymmetry the depth review flags (caller side exists, responder side does not).
- **`IpcMessageEvent` type in `@flighthq/types`** — a `Readonly` event handle delivered to listeners carrying `channel`, `senderId` (a `number`/`-1` sentinel for unknown), and a `reply(...args)` thunk. Add an opt-in `onIpcMessageEvent(channel, listener)` (the event-shaped variant) alongside the existing args-spread `onIpcMessage`, so the variadic-symmetry path stays untouched while a reply-capable path exists.
- **`invokeIpcWithTimeout(channel, timeoutMs, ...args): Promise<unknown>`** — rejects with a sentinel `IpcTimeoutError` after `timeoutMs`; documents the default-no-timeout behavior of plain `invokeIpc`. Implemented in-package via `Promise.race`, no backend change.
- **Targeted send: `sendIpcMessageTo(target, channel, ...args): void`** — add an `IpcTarget` type (`{ readonly windowId: number }` / process id) in `@flighthq/types` and an optional `IpcBackend.sendTo(target, channel, args)`; web/main-only backends no-op. Gives the missing `webContents.send` analogue an explicit, documented home instead of silent omission.
- **`createIpcChannel(name): IpcChannel`** — a typed channel descriptor (plain data: `{ readonly name: string }`) that the send/invoke/subscribe functions accept in place of a bare string, so a feature can publish its channel constants once and get a single grep target. Keep the string overloads; the descriptor is additive.
- **Backend capability flags** — extend `IpcBackend` with optional `getCapabilities(): IpcBackendCapabilities` (`Readonly<{ canSend; canInvoke; canHandle; canTarget }>`) so callers and tests can introspect what a host actually supports rather than discovering no-ops at runtime.
- **`enableIpcSignals()` / `IpcSignals`** (opt-in) — a signal group for backend-level lifecycle events (backend installed/reset, channel error) for consumers that need multi-listener/priority dispatch, via `@flighthq/signals`, defined in this package per the `enable*` convention. Off by default, fully tree-shaken when unused.

## Gold

Authoritative / AAA: exhaustive contract coverage, duplex ports for streaming, full error/edge handling, and 1:1 Rust parity. Nothing a host-IPC expert would find missing — while keeping all transport in the host backend.

- **Duplex ports: `IpcPort` + `createIpcPort` / `openIpcPort(channel): Promise<IpcPort>`** — a `MessagePort`/`MessageChannel`-style bidirectional channel (`postIpcPortMessage`, `onIpcPortMessage`, `closeIpcPort` → `destroyIpcPort` for the underlying native handle). Requires `IpcBackend.openPort(channel)` in `@flighthq/types`; web/electron backends realize it over `MessageChannelMain`/`postMessage`. This is the streaming/backpressure primitive the depth review notes as missing-by-design — promote it to designed-and-named.
- **Transferable contract: `IpcTransferable` type + `sendIpcMessageWithTransfer(channel, args, transfer)`** — name the structured-clone-with-transfer path explicitly (typed arrays, `ArrayBuffer`, `ImageSource` pixel buffers transferred zero-copy rather than cloned). Document exactly which Flight value types survive the boundary and which are cloned — directly relevant to passing `surface`/`ImageSource` buffers across processes.
- **Reply correlation + structured errors** — define `IpcError` (plain data: `{ readonly code: string; readonly message: string; readonly channel: string }` — a sentinel-carrying value, not a thrown wrapper) and the full rejection taxonomy (handler-threw, no-handler, timeout, serialization-failure, backend-absent). Each `invoke*` documents which it can produce.
- **`-formats` neighbor or in-crate codecs** — if a host needs a non-structured-clone wire format (JSON, MessagePack) for a C/C++ shell, expose a swappable `IpcSerializer` seam (`setIpcSerializer`/`createStructuredCloneIpcSerializer`) rather than hard-coding structured clone. Keeps the boundary explicit and portable.
- **Exhaustive tests** — colocated tests for once/remove/count, timeout race + cleanup, responder register/unregister, targeted-send no-op on incapable backends, port open/post/close lifecycle, transfer-list round-trip, every error-taxonomy branch, capability-flag gating, and aliased/idempotent unsubscribe. Plus a `host-electron` integration test exercising `handle`/`sendTo`/`openPort` against the fake `ElectronApi`.
- **Rust parity: `flighthq-ipc` crate** — mirror the seam as `IpcBackend` trait + free functions (`send_ipc_message`, `invoke_ipc`, `on_ipc_message`, `on_ipc_invoke`, `send_ipc_message_to`, `open_ipc_port`). Native default backend (in-process channel over `std::sync::mpsc`/`crossbeam`) behind the `native` feature; `host-web` fills the web seam. Honor the async/`Send` note from the Rust map — keep the trait native-clean (sync send, `async` invoke returning a `Send` future) and let `host-web` bridge `!Send` internally. Record any intentional TS↔Rust divergence in the conformance map.
- **Full doc comments / API guide** — every function documents allocation, the serialization model, error/sentinel behavior, and the renderer-vs-host ownership boundary, so `@flighthq/types/src/Ipc.ts` alone fully specifies the contract.

## Sequencing & effort

Recommended order, smallest-blast-radius and highest-value-per-effort first:

1. **Bronze contract doc (≈0.5 day, no API change).** Write the `invoke` rejection + serialization model into `Ipc.ts`'s doc comment first — it is free, unblocks every later decision, and is the single highest-value item the depth review calls out. Pure documentation; no code.
2. **Bronze listener verbs (≈1 day, in-package only).** `onceIpcMessage`, `removeAllIpcListeners`, `getIpcListenerCount`, `hasIpcBackend`. These need a package-local listener registry but **no `@flighthq/types` change and no backend change** — fully self-contained, fully testable in jsdom. Run `npm run exports:check` / `npm run order` after.
3. **Silver responder seam (≈1–1.5 days, types + electron).** `onIpcInvoke` requires `IpcBackend.handle` in `@flighthq/types` and a matching `createElectronIpcBackend` arm (`ipcMain.handle`). **Cross-package: touches `@flighthq/host-electron`** — surface this as the first design decision (see below).
4. **Silver event handle + timeout + channel descriptor (≈1.5 days).** `IpcMessageEvent`/`onIpcMessageEvent`, `invokeIpcWithTimeout`/`IpcTimeoutError`, `createIpcChannel`/`IpcChannel`, capability flags. Types-first, then in-package; timeout and channel descriptor are in-package, the event handle needs a backend method.
5. **Silver targeted send + signals (≈1 day).** `sendIpcMessageTo`/`IpcTarget`, `enableIpcSignals`. Both additive and optional.
6. **Gold ports + transferables + serializer seam (≈3–5 days).** The largest chunk: duplex `IpcPort`, transfer contract, `IpcSerializer`. Each needs a new `IpcBackend` method and a `host-electron` realization. Do `IpcPort` last — it is the only piece that introduces a stateful, `destroy*`-bearing resource and the most host-specific.
7. **Gold Rust crate (parallel track, ≈3–4 days).** Can start once the TS `IpcBackend` contract (through Silver) is stable; mirror incrementally and record divergences.

**Dependencies on other packages / types:**

- Every contract change lands in `@flighthq/types/src/Ipc.ts` **first** (header layer): `IpcBackend` gains `handle`, `sendTo`, `openPort`, `getCapabilities`; new types `IpcMessageEvent`, `IpcTarget`, `IpcChannel`, `IpcPort`, `IpcError`, `IpcTimeoutError`, `IpcBackendCapabilities`, `IpcSerializer`.
- `@flighthq/host-electron` must grow a matching arm for every new backend method (`handle`, `sendTo`, `openPort`, capabilities) or explicitly no-op it. The current electron backend is **main-process-only** (send/invoke no-op) — the responder and targeted-send work also clarifies whether a renderer-side electron backend belongs here.
- `@flighthq/signals` for the optional `enableIpcSignals` group.
- Rust `flighthq-types` / `flighthq-ipc` / `flighthq-host-web` for the parity track.

**Cross-package / design-decision items to surface to the user (do not decide autonomously):**

- **Responder ownership.** Decide whether `onIpcInvoke` (a Flight-side, possibly same-process invoke responder) belongs in `@flighthq/ipc` or stays permanently host-owned. This is the central architectural question the depth review flags; it determines whether `IpcBackend.handle` is added at all. Document the boundary either way.
- **Renderer vs main electron backend.** Targeted send (`sendIpcMessageTo`) and the responder seam interact with the fact that the current electron backend is main-side only. Whether to add a renderer-side electron backend (`ipcRenderer.send`/`invoke`) is a `host-electron` shape decision that affects this package's capability model.
- **Serializer seam vs hard-coded structured clone.** Introducing `IpcSerializer` is a portability/complexity tradeoff for the C/C++ shell case; confirm it is wanted before building it (it can stay implicit if structured clone is mandated everywhere).
- **`ImageSource`/surface-buffer transfer semantics** cross into `@flighthq/surface` expectations and the C/C++ memory model — confirm the zero-copy transfer guarantee is in scope before specifying it.
