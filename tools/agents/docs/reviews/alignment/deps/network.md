# Dependency Alignment: @flighthq/network

**Verdict:** Clean — both declared deps are used, correctly classified, and pinned `"*"`; the two-edge mapping (`signals` + `types`) is exactly what an event-style platform capability should declare.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` (runtime) | Used as a value import (`createSignal`, `emitSignal`) for the `Network` signal entity; correctly a regular `dependency`, not `import type`. Matches the docs rule that event capabilities expose an entity of signals. | — |
| None | `@flighthq/types` (type-only) | Imported with `import type` (`Network`, `NetworkBackend`, `NetworkStatus`, `NetworkConnectionType`), all defined in `packages/types/src/Network.ts`. No runtime weight; no inline cross-package type redefinition. | — |
| Info | `WebNetworkConnection` interface (network.ts:100) | Local DOM shape for the experimental Network Information API (`navigator.connection`). This is a web-backend implementation detail, not a cross-package contract, so keeping it inline is correct — it should NOT migrate to `@flighthq/types`. | Leave as is |
| Info | mapping predictability | Dep set is identical to sibling event package `@flighthq/power` (`signals` + `types`). A reader predicts these deps directly from the package's "connectivity status + online/offline signals over a swappable backend" role. No surprising edges. | — |

Beyond `npm run packages:check` (which passed: 86 packages valid): no `@flighthq/sdk` barrel import, no cross-package imports outside the header (`types`) and signals infrastructure, no reach across or up a layer. `"sideEffects": false` holds — module top level only declares `let _backend = null`, a scratch object, and a `WeakMap`; no eager backend registration, listeners, or timers (delivery is opt-in via `attachNetwork`).

## Declared vs used

- **Unused declared:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/`.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports are `signals` and `types`, both declared. `typescript` is the sole devDependency and is used by `build`/`typecheck`.
- **Pinning:** both workspace deps pinned `"*"` per convention.
