---
package: '@flighthq/ipc'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/ipc.md
  - reviews/maturation/depth/ipc.md
  - source
---

# ipc — Review

## Verdict

`solid` — 84/100. The renderer-side host-IPC seam has gone from the bare three-verb primitive (72/100 in the prior depth review) to a well-rounded command capability: it now ships the listener-management verbs, a documented invoke/serialization contract, a named responder seam, a timeout wrapper, an event-shaped subscribe with reply, targeted send, typed channel descriptors, a capability descriptor, and an opt-in signal group. Bronze and Silver from the maturation roadmap are genuinely landed and tested. It is held back from `authoritative` by (a) the entire Gold tier being unbuilt (ports, transferables, serializer seam), (b) the only real backend (`host-electron`) not yet realizing any of the new seam arms, so the additions are contract-only against a live host, and (c) a handful of small coherence gaps where the new contract surface (capabilities, `IpcError`) has no in-package consumer. The status report's self-estimate of 90/authoritative is optimistic on the "authoritative" label — the seam is wide and clean, but a third of the designed surface is type-only.

## Present capabilities

Source is `<sha>:packages/ipc/src/ipc.ts` (one file, 18 exports) plus nine `@flighthq/types` type files. Verified against the diff and the realized `dist/ipc.d.ts`:

**Core seam** (pre-existing, intact): `getIpcBackend`, `setIpcBackend`, `createWebIpcBackend`, `sendIpcMessage`, `invokeIpc`, `onIpcMessage`. The web default no-ops `send`, resolves `invoke` to `undefined`, and returns inert unsubscribes — correct for a context with no main process.

**Bronze (listener management + introspection):**

- `hasIpcBackend()` — distinguishes a real installed backend (`_backend !== null`) from the lazy web fallback, so callers branch instead of inferring from an `undefined` invoke result.
- `getIpcListenerCount(channel)` — reads the package-local `Map<string, Set<() => void>>` registry; `0` for an unknown channel (sentinel, not throw).
- `onceIpcMessage(channel, listener)` — auto-unsubscribes after the first message via a captured `unsubscribe` thunk; still returns an unsubscribe for the not-yet-fired case. Tested both paths.
- `removeAllIpcListeners(channel?)` — drops every tracked listener for a channel or all channels. Iterates over a `[...set]` snapshot, so unsubscribe-during-iteration is safe.

**Silver:**

- `createIpcChannel(name): IpcChannel` — typed channel descriptor `{ name }`. Every channel-accepting function takes `string | Readonly<IpcChannel>`, resolved through one `resolveChannel` helper; string overloads preserved. Descriptor acceptance is tested across send/subscribe/count/remove.
- `onIpcInvoke(channel, handler)` — responder counterpart to `invokeIpc`, delegating to optional `backend.handle`; returns an inert no-op when the backend lacks `handle`. Closes the one naming asymmetry the depth review flagged.
- `onIpcMessageEvent(channel, listener)` — event-shaped subscribe delivering `IpcMessageEvent` (`channel`, `senderId`, `args`, `reply`). The args-spread `onIpcMessage` path is left untouched alongside it.
- `invokeIpcWithTimeout(channel, timeoutMs, ...args)` — `Promise.race` of the invoke against a `setTimeout` that rejects with `IpcTimeoutError`; the timer is cleared on either settle, and the invoke rejection is swallowed if the timeout wins (no unhandled rejection).
- `sendIpcMessageTo(target, channel, ...args)` — targeted send over optional `backend.sendTo`; no-ops when absent.
- `enableIpcSignals()` / `getIpcSignals()` — opt-in `IpcSignals` group (`onBackendChanged`, `onChannelMessage`), lazily created so it tree-shakes when unused; `setIpcBackend` and the subscribe paths emit into it when active.

**Contract (`@flighthq/types`):** `IpcBackend` now carries a full JSDoc contract (invoke rejection semantics, structured-clone serialization model, `ImageSource`-buffer note) and optional `handle`, `sendTo`, `getCapabilities`. New one-concept-per-file types: `IpcBackendCapabilities`, `IpcChannel`, `IpcError` (+ `IpcErrorCode` taxonomy), `IpcMessageEvent`, `IpcPort`, `IpcSignals`, `IpcTarget`, `IpcTimeoutError`. All are barrel-exported from `types/src/index.ts`.

**Tests:** the colocated `ipc.test.ts` covers every export with an `afterEach` that resets the backend and clears listeners. The fake backend is capability-parameterized and exercises the optional-method absent cases (`delete backend.handle`, `delete backend.sendTo`), the timeout-loses and timeout-wins races, listener count increment/decrement, descriptor acceptance, and the signal emissions. `exports:check` will bind every export to its test.

## Gaps

Measured against an authoritative host-IPC layer and the package's own maturation roadmap:

- **Gold tier entirely unbuilt.** `IpcPort` (+ `openIpcPort`/`postIpcPortMessage`/`onIpcPortMessage`/ `destroyIpcPort`), `IpcTransferable` + `sendIpcMessageWithTransfer`, and the `IpcSerializer` seam are not implemented. `IpcPort` is typed (an opaque `_portId` handle) but has no functions; `IpcTransferable` is not even a type yet. The duplex/streaming and zero-copy-transfer primitives — the parts most relevant to passing `surface`/`ImageSource` buffers across a process boundary — are absent.
- **The seam outruns its only backend.** `host-electron`'s `createElectronIpcBackend` (`<sha>:packages/host-electron/src/electronIpc.ts`) still implements only `send`/`invoke`/`subscribe` (and `send`/`invoke` are inert main-process no-ops). None of `handle`, `sendTo`, or `getCapabilities` is realized. So `onIpcInvoke`, `sendIpcMessageTo`, and capability introspection are exercised only against the in-test fake; against the one shipped host they silently no-op. The status report flags this as deferred (correctly), but it means the Silver responder/targeted-send work is contract-ready, not end-to-end.
- **Capability descriptor has no in-package consumer.** `getCapabilities()` is on the contract and on the web default (all-false), but no function reads it — `sendIpcMessageTo` and `onIpcInvoke` probe for the method's _presence_ (`sendTo?`, `typeof handle === 'function'`) instead of the `canTarget`/`canHandle` flags. The descriptor is a surface waiting for a consumer; today method-presence and capability-flag are two parallel truth sources that could disagree.
- **`IpcError` / `IpcErrorCode` defined but unused.** The structured-error taxonomy is fully typed in `@flighthq/types` but no in-package operation produces or returns an `IpcError`. `invokeIpc` rejections surface as plain `Error` (per the documented contract), and `invokeIpcWithTimeout` throws `IpcTimeoutError`. So the `no-handler` / `serialization-failure` / `backend-absent` codes are designed-but-unreachable — the reply-correlation/structured-error Gold item is type-only.
- **`onIpcMessageEvent.reply` is a permanent no-op.** `senderId` is hard-coded to `-1` (no backend surfaces sender identity), so `reply()` always early-returns. Correct and forward-compatible, but the reply-to-caller flow is currently unrealizable end-to-end — another seam ahead of its backend.
- **No Rust `flighthq-ipc` crate.** The charter carries `crate: flighthq-ipc` but no crate exists yet. The TS contract through Silver is now stable enough to mirror; this is the conformance debt.

## Charter contradictions

The charter's `North star`, `Boundaries`, and `Decisions` are all `TODO` stubs — there is no stated principle to contradict, so this section is empty by construction. The one seeded line ("the renderer/app side of a host IPC channel … over a swappable backend with a web no-op default") is fully honored: every transport concern is delegated to the backend, the web default is inert-not-throwing, and the package never reaches across into a host.

The structural forks are clean here:

- **Fork B (closed union vs open registry):** N/A in the usual sense — there is no `kind` switch. The backend itself is the swappable seam (one active backend, `set*Backend`), which is fork D's runtime-backend dimension, correctly applied.
- **Fork D (runtime backend vs wasm mixing):** `ipc` is squarely a runtime-backend-seam package, not a wasm-mixable leaf (it carries a stateful active-backend + listener registry). Consistent with the Rust map's "all-or-nothing" classification — no drift.
- **No hot-loop inflation (fork C):** there is no per-frame path; the only mutable module state is the backend slot, the listener registry, and the lazy signals singleton. All side-effect-free at import.

## Contract & docs fit

**Lives up to the contract:**

- **Types-first.** Every cross-package type lives in `@flighthq/types`, one concept per file, filename = type name; the package imports them and defines nothing cross-package inline. Exemplary header-layer discipline — nine new type files, all barrel-exported.
- **Naming.** Every export carries the full unabbreviated `Ipc` domain word and is globally self-identifying (`sendIpcMessageTo`, `onIpcMessageEvent`, `getIpcListenerCount`). The `create/get/set/has` prefixes, `enable*Signals` opt-in, and `createWeb*Backend` triad all match the platform-suite convention.
- **Sentinels not throws.** `getIpcListenerCount` returns `0`, `getIpcSignals` returns `null`, the web default no-ops — expected-failure paths return sentinels. The one thrown type, `IpcTimeoutError`, is a caller-facing timeout signal (a deliberate, documented rejection), not an internal-invariant throw.
- **Single root export, `sideEffects: false`, side-effect-free import.** `index.ts` is a thin `export * from './ipc'`; no top-level registration; lazy backend and lazy signals. Fully tree-shakable. `package.json` correctly adds `@flighthq/signals`; `tsconfig.json` adds the `../signals` reference.
- **`Readonly<>` discipline.** Channel/target/event/capability parameters are `Readonly<…>`; the variadic `...args: readonly unknown[]` shape is consistent across send/invoke/subscribe.

**Teardown-verb note (minor):** `IpcPort` is specced with `destroyIpcPort` (frees a native handle) — the correct verb per the dispose/destroy rule, even though unbuilt. Good forward choice.

**Candidate doc revisions:**

- The **Package Map** line for `@flighthq/ipc` still reads "`sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend" — the original three-verb framing. The package has materially outgrown it (responder seam, targeted send, event handle, timeout, signals, capabilities). The line should be refreshed to reflect the command-capability shape, or at least not enumerate only the original three.
- The **status doc** self-estimate (90/100, authoritative) overstates the tier: a third of the designed surface (all of Gold) is type-only and the one real backend doesn't realize the new arms. Recorded here as 84/solid; the gap is the "authoritative" bar, not the quality of what landed.

## Candidate open directions

The charter's `North star` / `Boundaries` / `Decisions` are empty, so the following had to be assumed to review and should be settled into the charter:

1. **Responder ownership boundary.** Does a Flight-side invoke responder (`onIpcInvoke`) belong in `@flighthq/ipc` at all, or is `handle` permanently host-owned? It is currently a thin delegation that no-ops without a backend `handle`. This is the central architectural question and determines whether `IpcBackend.handle` stays in the contract.
2. **Renderer-side vs main-side Electron backend.** `sendIpcMessageTo` and `onIpcInvoke` interact with the fact that `createElectronIpcBackend` is main-process-only (`send`/`invoke` inert). Should the host grow a renderer-side arm (`ipcRenderer.send`/`invoke`/`ipcMain.handle`/`webContents.send`)? This is a `host-electron` shape decision that defines this package's realizable capability set.
3. **Is the Gold tier in scope, and in what order?** Duplex `IpcPort`, zero-copy `IpcTransferable`/ `sendIpcMessageWithTransfer`, and the swappable `IpcSerializer` are designed but unbuilt. Ports and transferables are the streaming/zero-copy primitives a `surface`-buffer-across-processes flow needs; the serializer seam is a C/C++-shell portability bet. Each needs a backend method and a host realization.
4. **`ImageSource`/surface-buffer transfer semantics.** The transfer path crosses into `@flighthq/surface` and the C/C++ memory model. Confirm the zero-copy guarantee is in scope before specifying it.
5. **Should capability flags or method-presence be the single source of truth?** Today `sendIpcMessageTo`/ `onIpcInvoke` branch on method presence while `getCapabilities` is parallel and unconsulted. Decide which is canonical (and whether the in-package functions should gate on `canTarget`/`canHandle`).
6. **`IpcError` realization.** The structured-error taxonomy is typed but unreachable. Decide whether in-package wrappers (timeout, no-handler, backend-absent) should return/carry `IpcError`, or whether it stays a host-backend-only descriptor.
7. **Rust `flighthq-ipc` crate.** The TS seam through Silver is stable; what is the native default backend (in-process `std::sync::mpsc`/`crossbeam` channel behind the `native` feature), and what TS↔Rust divergences get recorded in the conformance map?
