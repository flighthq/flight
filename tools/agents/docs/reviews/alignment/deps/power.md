# Dependency Alignment: @flighthq/power

**Verdict:** Clean — minimal, correct, canonical deps; `packages:check` passes and judgment surfaces no additional issues.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Declared and used at runtime (`createSignal`, `emitSignal` in `power.ts`); `connectSignal` used in test. Correct value dependency. | — |
| None | `@flighthq/types` | Declared and used as `import type` only (`Power`, `PowerBackend`, `PowerStatus`). No runtime weight; tree-shakable. | — |
| None | Local `Web*` interfaces | `WebBatteryManager`, `WebWakeLock`, `WebWakeLockSentinel` are package-private DOM-API shims for the web backend, not cross-package contracts. Correctly kept inline at file bottom rather than pushed into `@flighthq/types`. | — |
| None | Layering | Event-capability cell over a `*Backend` seam; depends only on the header (`types`) and signals infra. No `@flighthq/sdk` import, no peer/sibling-package edges, nothing reaches up a layer. Dep set is identical to sibling event capabilities (`network`, `lifecycle`, `keyboard`, `sensors`) — the canonical shape. | — |
| None | Tree-shaking | `"sideEffects": false` with no top-level side effects; backend is lazily created via `getPowerBackend`. | — |

Mapping reads cleanly: a reader predicting "battery/charging event capability over a swappable backend" would expect exactly `{signals, types}`, which is what is declared.

## Declared vs used

- **Unused declared:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/`.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports are `signals` and `types`, both declared. Remaining identifiers (`navigator`, `document`, Battery Status / Wake Lock APIs) are ambient DOM globals, not packages.
- **Pinning:** both workspace deps pinned `"*"` per convention.
