---
package: '@flighthq/ipc'
updated: 2026-06-24
basedOn: ./review.md
---

# ipc — Assessment

The renderer-side host-IPC seam is `solid` (84/100): Bronze and Silver from the maturation roadmap are landed and tested. What remains is either (a) the Gold tier — every item of which needs a new `IpcBackend` method plus a `host-electron` realization, i.e. cross-package — or (b) coherence gaps that are genuinely _design forks_ (which truth source is canonical, whether `IpcError` is realized in-package). That leaves the sweep-safe in-package set small: only the internal cleanups that close a gap without choosing a contract direction.

Charter status: `North star` / `Boundaries` / `Decisions` are all stubs, so the seven candidate directions the review surfaced (responder ownership, renderer-vs-main electron backend, Gold-tier scope/order, surface-buffer transfer semantics, capability-flags-vs-method-presence canonicity, `IpcError` realization, the Rust crate) are routed to the charter's **Open directions**, not into Recommended. Those decisions gate most of the parked work below.

## Recommended

Sweep-safe: within `@flighthq/ipc`, no cross-package coupling, no breaking change, no open contract decision.

- **Tighten the `onIpcMessageEvent` no-realizable-reply path.** `senderId` is hard-coded `-1` and `reply()` always early-returns because no backend surfaces sender identity (review.md › Gaps). Add a colocated test asserting the `-1` / no-op `reply` contract explicitly so the forward-compatible behavior is pinned, and a doc comment on `IpcMessageEvent` (in `@flighthq/types`) stating that `reply` is inert until a backend supplies `senderId`. Pure in-package test + doc; no contract change, no behavior change. (Note: deciding _whether_ a backend should ever surface `senderId` is the renderer-vs-main-electron fork — Open direction, not here.)
- **Strengthen the optional-method-absent coverage on the existing Silver arms.** The fake backend already exercises `delete backend.handle` / `delete backend.sendTo` (review.md › Tests); add the symmetric assertion that `getIpcSignals()` returns `null` before `enableIpcSignals()` and that the signal emissions are skipped while the group is disabled, so the lazy-group tree-shake contract is test-pinned. In-package only.

## Backlog

Parked: each waits on an Open direction, a `host-electron` change, or a contract decision the assessment cannot make sweep-safe.

- **Realize the new Silver arms in `host-electron`** (`handle`, `sendTo`, `getCapabilities`) — review.md › "The seam outruns its only backend." Cross-package (`@flighthq/host-electron`), and it is entangled with the **renderer-vs-main electron backend** Open direction: the current `createElectronIpcBackend` is main-process-only, so realizing targeted send / responder may require a renderer-side arm. Decide the host shape first.
- **Make capability flags vs. method-presence one source of truth** — review.md › Gaps + Open direction #5. `sendIpcMessageTo` / `onIpcInvoke` branch on method presence while `getCapabilities` is parallel and unconsulted. This is a contract canonicity _decision_ (which is authoritative), not a sweep — route to the charter; the in-package change (gate on `canTarget`/`canHandle`) follows the ruling.
- **Realize `IpcError` / `IpcErrorCode`** — review.md › Gaps + Open direction #6. The taxonomy is typed but unreachable; deciding whether in-package wrappers (timeout, no-handler, backend-absent) _return/carry_ `IpcError` vs. it staying a host-only descriptor is a contract direction. Parked on that decision.
- **Gold: duplex `IpcPort`** (`openIpcPort` / `postIpcPortMessage` / `onIpcPortMessage` / `destroyIpcPort`) — roadmap Gold. Needs `IpcBackend.openPort` in `@flighthq/types` **and** a `host-electron` realization over `MessageChannelMain`; introduces the only `destroy*`-bearing stateful resource in the package. Cross-package + gated on the Gold-scope Open direction.
- **Gold: `IpcTransferable` + `sendIpcMessageWithTransfer`** — roadmap Gold. Zero-copy transfer of `ImageSource`/typed-array buffers crosses into `@flighthq/surface` and the C/C++ memory model (Open direction #4: confirm the zero-copy guarantee is in scope). Needs a backend method. Parked.
- **Gold: swappable `IpcSerializer` seam** (`setIpcSerializer` / `createStructuredCloneIpcSerializer`) — roadmap Gold. A portability bet for a non-structured-clone wire format (C/C++ shell). Whether to introduce it at all is the serializer-vs-hard-coded-clone decision (Open direction). Parked until wanted.
- **Rust `flighthq-ipc` crate** — review.md › Gaps + Open direction #7. The charter carries `crate: flighthq-ipc` but none exists; the TS seam through Silver is stable enough to mirror. Cross-worktree (the Rust port) and needs the native-default-backend + conformance-divergence decisions. Parked as conformance debt.
- **Refresh the Package Map line for `@flighthq/ipc`** — review.md › Candidate doc revisions. The map still enumerates the original three verbs; the package has outgrown it (responder seam, targeted send, event handle, timeout, signals, capabilities). This is an edit to `tools/agents/docs/index.md` (a shared doc), not to `@flighthq/<name>` — out of this package's sweep scope; route as a doc fix.

## Approved

_None. Approval is the user's verbal gate._
