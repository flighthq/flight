# Dependency Alignment: @flighthq/app

**Verdict:** Clean — declared deps are minimal and correct, layering is respected, and no convention violations were found beyond what `npm run packages:check` already passes.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Runtime dep, used (`createSignal`, `emitSignal`), pinned `"*"`. Correct and predictable for a signals-based event entity. | — |
| None | `@flighthq/types` | Type-only dep (`App`, `AppBackend`, `MenuItemTemplate`), imported with `import type` on its own line, pinned `"*"`. | — |
| None | `@flighthq/sdk` | Not imported. Compliant with the no-barrel rule. | — |
| None | cross-package types | `App`/`AppBackend`/`MenuItemTemplate` are defined in `@flighthq/types` (App.ts, Menu.ts) and consumed, not redefined inline. `MenuItemTemplate` is shared from `Menu.ts` across App/Tray/Menu — centralized, no duplication. | — |
| None | tree-shaking | `"sideEffects": false`; backend is lazily created via `getAppBackend()`, no module-top-level registration or side effects. | — |

## Declared vs used

- **Unused declared deps:** none. Both `@flighthq/signals` and `@flighthq/types` are imported by `src/app.ts`.
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` imports in `src/` are `@flighthq/signals` and `@flighthq/types`, both declared.
- **Pinning:** workspace deps both pinned `"*"` per convention.
- **type-only correctness:** `@flighthq/types` is imported solely under `import type`, pulling no runtime weight; the runtime import (`@flighthq/signals`) is the only value-level dependency.

The dependency mapping reads exactly as the package's purpose predicts: an event entity built on `@flighthq/signals` over a swappable backend whose shape lives in `@flighthq/types`. No surprising edges.
