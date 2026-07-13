---
package: '@flighthq/ipc'
status: solid
score: 72
updated: '2026-07-13'
ingested:
  - status.md
  - charter.md
  - source (packages/ipc/src)
  - packages/types/src/Ipc.ts, IpcError.ts, IpcPort.ts, IpcSignals.ts
  - packages/host-electron/src/electronIpc.ts
---

# ipc — Review

## Verdict

**`solid` — 72/100.** The prior review (2026-06-25, 35/partial) was a merge-gate review of an integration slice that shipped `packages/ipc` without its `@flighthq/types` companion and therefore did not compile. **That blocker is resolved:** the full type surface now exists in the tree — `packages/types/src/Ipc.ts` carries `IpcBackendCapabilities`, `IpcChannel`, `IpcMessageEvent`, `IpcTarget`, `IpcTimeoutError`, and the widened `IpcBackend` (optional `handle`/`sendTo`/`getCapabilities`), with `IpcError.ts`, `IpcPort.ts`, and `IpcSignals.ts` as separate one-concept files. Every import in `ipc.ts` and `ipc.test.ts` resolves. The 2026-07-02 charter Decision "fix test fixture method mismatches" is implemented: the test's `FakeIpcBackend` extends the real `IpcBackend` and implements `handle`/`sendTo`/`getCapabilities` per the interface.

What stands today is the well-rounded command capability the earlier standalone review judged sound: 17 exports covering send, request/reply invoke, per-channel subscribe (args-spread and event-shaped), responder seam, targeted send, once/remove-all/count listener management, timeout wrapper, typed channel descriptors, capability introspection, and an opt-in signal group — over one swappable backend with an inert web default. The score lands at solid-not-authoritative because the Gold tier a mature IPC library carries (duplex ports, transferables, broadcast) is typed-only or absent, the structured error taxonomy is unreachable, and no native backend yet realizes the optional arms.

## Present capabilities (verified against source)

17 exports in `packages/ipc/src/ipc.ts`, 43 tests colocated, `describe` blocks alphabetized and mirroring exports:

- **Backend seam:** `getIpcBackend` / `setIpcBackend` / `createWebIpcBackend` / `hasIpcBackend`. Web default no-ops `send`, resolves `invoke` to `undefined`, returns inert unsubscribe, reports all-false `getCapabilities()`. `hasIpcBackend` distinguishes a real host from the lazy default.
- **Channels:** `createIpcChannel(name)`; every channel-accepting function takes `string | Readonly<IpcChannel>` via a `resolveChannel` helper.
- **Send:** `sendIpcMessage` (fire-and-forget), `sendIpcMessageTo` (targeted via optional `backend.sendTo`, no-op when absent).
- **Request/reply:** `invokeIpc`, `invokeIpcWithTimeout` (races a `setTimeout` rejecting with `IpcTimeoutError`, clears the timer on either settle, swallows the late invoke rejection when the timeout wins), and the responder side `onIpcInvoke` (delegates to optional `backend.handle`, inert no-op unsubscribe when absent).
- **Subscribe:** `onIpcMessage` (args spread), `onIpcMessageEvent` (delivers `IpcMessageEvent` with `channel`, `senderId: -1`, `args`, and a `reply` thunk gated on `senderId !== -1` — pinned inert by test until a backend supplies sender identity), `onceIpcMessage` (auto-unsubscribe).
- **Listener management:** package-local registry backing `getIpcListenerCount` and `removeAllIpcListeners` (per-channel or all).
- **Signals:** `enableIpcSignals` / `getIpcSignals` — lazy opt-in group (`onBackendChanged`, `onChannelMessage`); emission is guarded, delivery never requires the group. Tree-shake contract pinned via `vi.resetModules()` isolation test.

Contract shape holds: `sideEffects: false`, single `.` export, `index.ts` is a thin `export * from './ipc'`, module state (`_backend`, `_ipcSignals`, `_listeners`) is lazy, deps are exactly `signals` + `types`, sentinels not throws (the one throw, `IpcTimeoutError`, is a deliberate caller-facing timeout signal), naming fully `Ipc`-qualified and self-identifying.

## Gaps (AAA-depth judgment)

1. **Duplex ports are typed but unbuilt.** `IpcPort` exists in `@flighthq/types` (with the documented `openIpcPort`/`postIpcPortMessage`/`onIpcPortMessage`/`destroyIpcPort` lifecycle) but none of those functions exist in `@flighthq/ipc`, and `IpcBackend` has no `openPort`. A mature IPC library's MessagePort-equivalent is missing — the largest single gap.
2. **Structured errors are unreachable.** `IpcError`/`IpcErrorCode` are typed (`handler-threw` / `no-handler` / `timeout` / `serialization-failure` / `backend-absent`) but nothing constructs or returns them; `invokeIpc` rejects with a plain `Error` from the backend. The taxonomy is a header with no implementation.
3. **No transferables / zero-copy path.** No `IpcTransferable` type, no `sendIpcMessageWithTransfer`. Relevant for surface/pixel-buffer crossing; scope was deliberately deferred pending a serialization decision.
4. **No broadcast.** No send-to-all-peers verb; targeted send covers one `IpcTarget` only.
5. **No native backend realizes the optional arms.** `host-electron`'s `createElectronIpcBackend` is the minimal main-process trio (`subscribe` real; `send`/`invoke` inert) — no `handle`, `sendTo`, or `getCapabilities`. Consequently `senderId` is always `-1` and `reply()` always no-ops (charter Decision 2026-07-02 records this as correct-for-now), and the responder/targeted/capability arms have never run against a real host.
6. **Capability flags vs method presence — two truth sources.** `sendIpcMessageTo`/`onIpcInvoke` gate on method presence (`sendTo?.`, `typeof handle === 'function'`) while `getCapabilities()` is a parallel, unconsulted descriptor. A backend can report `canTarget: false` yet define `sendTo`. Charter Open direction; a canonicity decision, not a sweep.
7. **No diagnostics layer.** Silent sentinels (inert web sends, no-op targeted send, null signals) have no `explain*` queries or `enable*Guards` per the diagnostics inversion rule. Suite-wide pattern, not ipc-specific.

## Charter contradictions

None. The charter's What-it-is (17 exports, responder/targeted/event/timeout/signal arms, inert web default) matches source exactly. Both 2026-07-02 Decisions are realized: fixtures align with the backend interface, and the `senderId`/`reply` backend-dependency is implemented and test-pinned exactly as blessed. All four Open directions remain genuinely open — none was silently resolved in source.

## Contract & docs fit

- **Envelope:** front matter valid; `crate: flighthq-ipc` — no Rust crate exists yet (conformance gap, cross-worktree).
- **Types-first:** now satisfied; the header layer fully describes the API. Minor layout note: `Ipc.ts` bundles five concepts (backend, capabilities, channel, event, target, timeout error) while `IpcError`/`IpcPort`/`IpcSignals` got their own files — a soft deviation from one-concept-per-file, consistent with other platform-suite headers.
- **Stale self-descriptions:** `package.json` description still reads "send, invoke, per-channel subscribe" — omits responder, targeted send, timeout, listener management, and signals. The `agents/index.md` Package Map line and `agents/packages/map.md` line ("`sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend") likewise predate the command-capability shape — shared-doc edits, out of sweep scope.
- **No package README**, where sibling cells (`keyboard`, `device`) have one.

## Candidate open directions

Carried from charter (all still live): responder ownership; renderer-side Electron backend (prerequisite for real `senderId`/`reply`, `sendTo`, `handle`); Gold tier `IpcPort`/`IpcTransferable`/`IpcSerializer`; `IpcError` realization. Add: capability-descriptor canonicity (gap 6) and whether a broadcast verb belongs in the seam or stays a host concern.
