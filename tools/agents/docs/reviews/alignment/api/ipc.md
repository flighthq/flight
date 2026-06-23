# API Alignment: @flighthq/ipc

**Verdict:** Strongly aligned — a textbook command-capability cell (backend trio + flat free functions over `IpcBackend`); the only blemish is operand-word asymmetry between `invokeIpc` and the `*IpcMessage` pair.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `invokeIpc` vs `sendIpcMessage` / `onIpcMessage` | Operand vocabulary is inconsistent across the message trio: `send`/`on` carry the full `IpcMessage` operand word, but `invoke` drops `Message` and operates on bare `Ipc`. `send` and `invoke` are the two halves of the same request concept (fire-and-forget vs request/response) and should read as a pair. Note these exact three names are the ones canonically listed in the CLAUDE map, so the asymmetry is map-sanctioned — flagging only as observed drift, not a mandate to rename. | If revisiting the seam, prefer a symmetric pair (e.g. `sendIpcMessage` + `invokeIpcMessage`, or `sendIpc` + `invokeIpc`) so both verbs share the same operand word. Coordinate with the map first since the names are enumerated there. |
| Info | `invokeIpc` return type | Returns `Promise<unknown>`; the web default resolves to `undefined` (a sentinel) rather than throwing when no main process exists — correct per the sentinel rule. Recorded only to confirm intent, not a defect. | None. |

## Clean

- **Backend trio is canonical.** `createWebIpcBackend()` / `getIpcBackend()` / `setIpcBackend(backend: IpcBackend \| null)` match the command-capability seam pattern exactly, identical in shape to `@flighthq/clipboard`, `@flighthq/shell`, and `@flighthq/storage` (`set*Backend(backend: *Backend \| null)` with no `Readonly<>` on the installable reference — consistent with siblings).
- **Verb discipline.** `create*` (allocates the backend object), `get*` (lazy accessor returning the live backend), `set*` (installs/replaces) are each used with their correct meaning. No teardown verbs are present and none are needed (an unsubscribe closure, not a `dispose*`, is the correct lifetime handle here).
- **Event-style `on*` over `subscribe`.** `onIpcMessage(channel, listener): () => void` is exactly the command-capability inbound-event shape from the map — a flat `on*` returning an unsubscribe closure, delegating to the backend's `subscribe`.
- **Sentinels over throws.** The web default no-ops `send`, resolves `invoke` to `undefined`, and returns an inert unsubscribe from `subscribe` — expected-unavailable handled with sentinels, never an exception. There is always a backend (lazy web default), so no null-return surface leaks to callers.
- **Readonly / primitive discipline.** Variadic payloads are typed `readonly unknown[]`; `channel` is a primitive `string` (exempt). No mutable-by-default object parameters.
- **Cross-package type hygiene.** `IpcBackend` is imported from `@flighthq/types` (the header layer) on its own `import type { IpcBackend }` line, not redefined inline. The variadic→array bridging (`...args` spread into the array-shaped `IpcBackend` methods) is applied consistently across `send`, `invoke`, and `on`.
- **"Ipc" acronym.** The abbreviation rule targets shortening type words (`getDOBounds`); `IPC` is a universally recognized acronym and is the package's canonical operand name in the CLAUDE map — not a violation.
- **Package shape.** Single `.` export, `"sideEffects": false`, no top-level registration (the only module state is the lazily-initialized `_backend`, placed at the file bottom per source style), exports alphabetized.
