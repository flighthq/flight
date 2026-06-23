# Dependency Alignment: @flighthq/signals

**Verdict:** Clean — a single, correct, pinned dependency on the type header (`@flighthq/types`); no phantom, unused, up-layer, or cross-backend edges, and the mapping is exactly what an infrastructure signals package should read as.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`*`) | Sole runtime dep; used by every source file (`Signal`, `SignalData`, `SignalConnectOptions`), imported with `import type`, pinned `"*"`. Correct. | — |
| None | `typescript` (devDep) | Build-only; correctly in `devDependencies`, not `dependencies`. | — |
| None | tsconfig `references` | `references: [{ path: ../types }]` matches the single declared dep exactly; no stale or missing project reference. | — |
| Info | `@flighthq/sdk` | Not imported (correct — barrel import is forbidden). No occurrence anywhere in `src/`. | — |
| Info | Cross-package types | `Signal`, `SignalData`, `SignalConnectOptions` are defined in `@flighthq/types` (`Signal.ts`, `SignalConnectOptions.ts`) and consumed here — none redefined inline. `signal.ts`/`slot.ts` re-export the type names (`export type { ... }`) as pure type pass-throughs; no runtime weight. | — |
| Info | Tree-shaking / side effects | `"sideEffects": false` and no module-top-level side effects: `internal.ts`'s `nullSignalEmit` is a plain const arrow fn; no registration, listeners, timers, or shared mutable state at import time. | — |
| Info | Layering | Bottom infrastructure layer (CLAUDE.md: "Signals is fundamental infrastructure and should have few dependencies"). Depends only on the header; reaches neither up a layer nor across to siblings/backends. No surprising edges. | — |

`npm run packages:check` passes (`86 packages and 16 examples valid`); the above is judgment beyond it (type-only discipline, side-effect-freedom, layering posture, and that the lone dep is genuinely used rather than merely declarable).

## Declared vs used

- **Declared:** `@flighthq/types` (`dependencies`), `typescript` (`devDependencies`).
- **Used in `src/`:** `@flighthq/types` only (`Signal`, `SignalData`, `SignalConnectOptions`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none — every non-relative import (`@flighthq/types`) is declared; all other imports are relative (`./emitter`, `./signal`, `./slot`, `./throttle`, `./internal`).
