---
package: '@flighthq/ipc'
updated: 2026-06-25
basedOn: ./review.md
---

# ipc — Assessment

This assessment reasons over the **merge candidate** in `integration-b2824e3d8`, not the abstract feature. The candidate is `revise`: the design is sound (the same command capability the prior 84/solid review documented), but the integration branch carries a partial slice — the `packages/ipc/` source landed while its `@flighthq/types` Ipc additions did not, so the package does not compile. The single gating action is a **re-integration** of the missing types-side change, which is cross-package and therefore not in `@flighthq/ipc`'s own sweep scope. That blocker, and the dispatch directives for the integration worker, live in `outgoing/integration/ipc.md`.

Because the candidate does not build, almost nothing is sweep-safe _within this package right now_: any in-package edit would be made against a non-compiling tree. The recommendations below are the in-package follow-ups that become available **once the types-side change is re-landed** — they are held, not actionable against the current slice.

## Recommended

Sweep-safe within `@flighthq/ipc` — but **gated on the merge blocker being cleared first** (the package must compile before any of these can be made or tested).

- **Pin the inert-`reply` contract with a test + doc, once types are present.** `onIpcMessageEvent` hard-codes `senderId` to `-1` and `reply()` early-returns (review.md › "delta-introduced coherence gap" context). Add a colocated test asserting the `-1` / no-op-`reply` behavior, and a doc comment on `IpcMessageEvent` noting `reply` is inert until a backend supplies `senderId`. Pure in-package test + doc, no behavior change. (Whether a backend should ever surface `senderId` is the renderer-vs-main-electron fork — Open direction, not here.)
- **Test-pin the lazy-signals tree-shake contract.** Add the symmetric assertions that `getIpcSignals()` returns `null` before `enableIpcSignals()` and that the subscribe paths skip emission while the group is disabled (the `if (signals !== null)` guard in `onIpcMessage`/`onIpcMessageEvent`). In-package only; locks the side-effect-free-import guarantee.

## Backlog

Parked: each waits on the merge blocker, an Open direction, a `host-electron` change, or a contract decision the assessment cannot make sweep-safe.

- **Re-land the `@flighthq/types` Ipc surface into the integration branch** — review.md › "Merge blocker." This is the gating item, but it is cross-package (`@flighthq/types`) and an integration-assembly action, not an `@flighthq/ipc` edit. Tracked here for completeness; the actionable form is in `outgoing/integration/ipc.md`.
- **Make capability flags vs. method-presence one source of truth** — review.md › "delta-introduced coherence gap" + charter Open direction #5. `sendIpcMessageTo` / `onIpcInvoke` branch on method presence while `getCapabilities` is parallel and unconsulted. A contract-canonicity _decision_ (which is authoritative), not a sweep — route to the charter; the in-package change (gate on `canTarget`/`canHandle`) follows the ruling.
- **Realize the new Silver arms in `host-electron`** (`handle`, `sendTo`, `getCapabilities`) — review.md › Axis 6/7 note. Cross-package, and entangled with the renderer-vs-main-electron Open direction; `createElectronIpcBackend` is main-process-only today. Decide the host shape first.
- **Realize `IpcError` / `IpcErrorCode`** — charter Open direction #6. The taxonomy was typed in the builder state but is unreachable; whether in-package wrappers carry `IpcError` vs. it staying a host-only descriptor is a contract direction. Parked.
- **Gold: duplex `IpcPort`** (`openIpcPort` / `postIpcPortMessage` / `onIpcPortMessage` / `destroyIpcPort`) — roadmap Gold. Needs `IpcBackend.openPort` in `@flighthq/types` and a `host-electron` realization; introduces the only `destroy*`-bearing stateful resource. Cross-package + gated on the Gold-scope Open direction.
- **Gold: `IpcTransferable` + `sendIpcMessageWithTransfer`** — roadmap Gold. Zero-copy transfer of `ImageSource`/typed-array buffers crosses into `@flighthq/surface` and the C/C++ memory model (Open direction #4). Parked.
- **Gold: swappable `IpcSerializer` seam** — roadmap Gold. A portability bet for a non-structured-clone wire format. Whether to introduce it at all is an Open direction. Parked.
- **Rust `flighthq-ipc` crate** — charter Open direction #8. The charter carries `crate: flighthq-ipc` but none exists; cross-worktree, needs the native-default-backend + conformance-divergence decisions. Parked as conformance debt.
- **Refresh the Package Map line for `@flighthq/ipc`** — review.md › Candidate doc revision. An edit to `tools/agents/docs/index.md` (a shared doc), out of this package's sweep scope.

## Approved

_None. Approval is the user's verbal gate. Approved entries are appended only after the user names them or sweeps them in; this section is never populated by an assessment pass._

## Notes for the charter's Open directions

These are design forks surfaced (or reinforced) by this delta; they belong in `charter.md › Open directions`, not in Recommended:

- **Capability flags vs. method-presence canonicity** (Open direction #5) — _reinforced by this delta_: the slice ships both truth sources (`getCapabilities` and `sendTo?`/`typeof handle`) with nothing reconciling them. Which is authoritative, and should in-package functions gate on `canTarget`/`canHandle`?
- **Renderer-side vs main-side Electron backend** (Open direction #2) — determines whether the Silver responder/targeted-send arms are ever realizable end-to-end.
- **Gold-tier scope/order** (Open directions #3, #4) — ports, transferables, serializer, and the surface-buffer transfer semantics.
- **`IpcError` realization** (Open direction #6) and the **Rust `flighthq-ipc` crate** (Open direction #8).
