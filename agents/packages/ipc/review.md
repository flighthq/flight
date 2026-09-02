---
package: '@flighthq/ipc'
status: partial
score: 48
updated: '2026-09-02'
ingested:
  - status.md
  - charter.md
  - source (packages/ipc/src)
  - packages/types/src/Ipc.ts
  - packages/host-electron/src/electronIpc.ts
  - packages/host-web/src/webHost.ts (ipc slot)
  - packages/host-tauri/src/tauriRegister.ts (ipc slot)
  - packages/host-capacitor/src/capacitorRegister.ts (ipc slot)
---

# ipc — Review

## Verdict

**`partial` — 48/100.** The R3 reduction (2026-08-30) stripped the package from 17 exports to 2: `onIpcMessage` and `onceIpcMessage`. The removal was correct -- the deleted surface (send, invoke, responder, timeout, targeted send, channels, signals, capability flags, listener registry, ambient backend seam) had no real provider behind it and the ambient resolver was architecturally unsound. What remains is honest: two thin subscribe-wrappers over an explicitly passed `HasIpcMessage` host, with a single real provider (Electron main-process `ipcMain.on`). The score drops from 72 to 48 because the package now covers one capability (receive messages on a named channel) where a complete IPC domain covers at least four (send, receive, request/response, port), and the prior Gold-tier surface that inflated the score has been correctly deleted as fabrication rather than incorrectly retained as progress.

## Present capabilities (verified against source)

Two exports in `packages/ipc/src/ipc.ts`, seven tests in `ipc.test.ts`, `describe` blocks alphabetized and mirroring exports:

- **`onIpcMessage(host, channel, listener)`** — subscribes to every message on `channel` via `host.ipc.message.subscribe`. Returns the unsubscribe for that subscription only. The listener receives args spread from the provider's `readonly unknown[]` array. Thin wrapper: one line of logic (the args-spread).

- **`onceIpcMessage(host, channel, listener)`** — subscribes to the next message only, then auto-releases. Returns an idempotent, origin-pinned unsubscribe. Handles the acquisition race where a provider delivers synchronously during `subscribe` before the unsubscribe handle is returned -- the `done` flag and post-subscribe guard close this window. This is the one piece of non-trivial logic in the package.

Both functions take `HasIpcMessage` as their first argument -- a compile-time witness that the host slot exists. There is no resolver, no sentinel, no module-scoped state, and no "no provider" runtime arm. A caller without a provider cannot call these at all (type error).

**Export lanes:** `index.ts` re-exports from `./contract`; `contract.ts` re-exports from `./ipc`. Both lanes expose the same two functions. The `.`/`./contract` split is structurally present but functionally degenerate (identical surface).

**Types:** `IpcMessageBackend` in `packages/types/src/Ipc.ts` is a single-method `Entity` with `subscribe(channel, listener): () => void`. `HasIpcMessage` in `packages/types/src/Host.ts` nests it at `{ ipc: { message: IpcMessageBackend } }`.

**Provider (external):** `createElectronIpcMessageBackend(electron)` in `packages/host-electron/src/electronIpc.ts` -- wraps `ipcMain.on`/`ipcMain.removeListener`, maps Electron's `(_event, ...args)` signature to the `(args: readonly unknown[])` contract. Per-subscription cleanup only; no provider-level destroy because `ipcMain` is the caller's to tear down. Web, Tauri, and Capacitor hosts ship `ipc: {}` with no message provider.

**Tests:** 7 tests across 2 `describe` blocks. Coverage is thorough for the surface: first-message-and-release, pre-message unsubscribe, idempotent stop, synchronous-delivery-during-subscribe race, multi-message delivery, channel isolation, origin-pinned unsubscribe (two listeners on the same channel), and two-host independence. The test helper `messageHost()` builds a recording `HasIpcMessage` using `createEntity`, verifying Entity identity on the backend.

## Gaps

1. **No send capability.** `sendIpcMessage` was deleted. The platform (Electron renderer-to-main `ipcRenderer.send`, Tauri `invoke`, Capacitor message posting) supports send, but Flight has no `HasIpcSend` or equivalent slot. The charter's Open directions and the types file both name this as an unbuilt Electron capability.

2. **No request/response (invoke/handle) capability.** The prior `invokeIpc`/`onIpcInvoke` pair was deleted because no backend implemented it. Electron `ipcRenderer.invoke`/`ipcMain.handle` is the canonical case. Requires a new slot with a real provider.

3. **No targeted send (main-to-renderer).** Needs `webContents`-specific addressing, documented in `Ipc.ts` as a distinct capability. A new slot, not a method on the message backend.

4. **No duplex port / channel abstraction.** The charter names `IpcPort`, `IpcTransferable`, and `IpcSerializer` as designed-but-unbuilt Gold tier. The types were removed during R3.

5. **No diagnostics layer.** No `explain*` queries or `enable*Guards` for the silent behavior when a host lacks the message capability (compile-time guard covers this for typed callers, but dynamic assembly or JS callers get no runtime signal). Suite-wide pattern.

6. **Unused `@flighthq/signals` dependency.** `package.json` lists `@flighthq/signals` as a runtime dependency. No source file imports from it -- the signals surface (`enableIpcSignals`, `getIpcSignals`) was deleted during R3 but the dependency was not removed.

7. **Stale `dist/` output.** `dist/index.d.ts` still exports the pre-R3 surface (13 names including `createIpcChannel`, `enableIpcSignals`, `invokeIpc`, `sendIpcMessage`, etc.). A clean rebuild would fix this; it is a build-artifact issue, not a source issue.

## Charter contradictions

The charter's "What it is" section still describes the pre-R3 package: "17 exports covering send, invoke, subscribe, targeted send, timeout wrapper, listener introspection, and the backend seam." The live source has 2 exports covering subscribe only. The charter has not been updated to reflect R3.

Specific mismatches:

- Charter names `enableHostWebIpc()` and `setIpcBackend` -- both deleted.
- Charter names "resolution is custom > host > sentinel, order-independent" -- the resolver/sentinel architecture no longer exists.
- Charter says "without a host, the sentinel inertly no-ops every transport call" -- there is no sentinel; without `HasIpcMessage` the caller cannot compile.
- Charter Decision "[2026-07-02] Fix test fixture method mismatches" references a `FakeIpcBackend` that no longer exists; the current test helper is a recording `messageHost()` factory.

The charter's Open directions and Decisions are still structurally valid -- the open questions remain genuinely open and the `senderId`/`reply` decision's premise (no backend surfaces sender identity) is still true, but the specific machinery it references has been removed.

## Contract & docs fit

**Package shape:** Two blessed lanes (`.` and `./contract`) present. `sideEffects: false` declared. No top-level side effects. Entity identity on `IpcMessageBackend` via `createEntity`.

**Types-first:** Satisfied. `IpcMessageBackend` is in `@flighthq/types`, not in the implementation package. `HasIpcMessage` capability witness is in `Host.ts`.

**Naming:** `onIpcMessage` and `onceIpcMessage` use the full unabbreviated type name. Globally self-identifying.

**Explicit dependency:** Host is a value argument, not a singleton. No module-scoped mutable state.

**Sentinels-not-throws:** Not applicable -- compile-time witness (`HasIpcMessage`) eliminates the "missing backend" case entirely. The package does not throw.

**Stale dependency:** `@flighthq/signals` is listed in `dependencies` but unused. Should be removed.

**Stale `package.json` description:** "Inter-process message reception over an explicit host capability" -- this is actually accurate for the post-R3 shape.

**SDK barrel:** `packages/sdk/src/platform.ts` and `packages/sdk/src/index.ts` both re-export `@flighthq/ipc`, which now surfaces only `onIpcMessage` and `onceIpcMessage`.

**Candidate revisions to admin docs:**

- The charter's "What it is" must be rewritten to describe the 2-export, receive-only, explicit-host shape.
- `agents/packages/map.md` likely references the pre-R3 surface (not checked in this survey, but the prior review noted the same stale description).
- The `assessment.md` "Approved" item ("Fix test fixture method mismatches") is now obsolete -- the test fixtures and the `FakeIpcBackend` they referred to no longer exist.

## Candidate open directions

The charter's existing Open directions remain relevant (responder ownership, renderer-side Electron backend, Gold tier ports/transferables/serializer) and should be retained with updated framing that acknowledges the R3 reduction. Additional questions the charter does not answer:

- **What is the package's post-R3 scope?** Is it permanently a thin two-function subscribe wrapper, or is it the home for future send/invoke/handle capabilities as new slots are built? The answer determines whether gaps 1-4 above are "ipc gaps" or "unbuilt platform slots that will be separate packages."
- **Should the unused `@flighthq/signals` dependency be removed?** If signals will return when the package grows, keeping the dependency avoids churn; if R3 was a permanent reduction, it is dead weight.
- **Does a two-function package justify its own package?** The logic in `onIpcMessage` is one line; `onceIpcMessage` is the only non-trivial function. Whether this stays standalone or absorbs into `platform` or the host layer is an architectural question.
