# Dependency Alignment: @flighthq/updater

**Verdict:** Clean — both declared deps are used, no phantom or unused deps, no `@flighthq/sdk` import, no inline cross-package types; the footprint is minimal and identical to peer event packages (`power`, `network`).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | `@flighthq/signals` | Used at runtime (`createSignal`, `emitSignal`); correctly a regular `dependency`, value import, pinned `"*"`. | None. |
| — | `@flighthq/types` | Used type-only (`AppUpdater`, `UpdaterBackend`) via `import type`; correctly a `dependency`, pinned `"*"`. Types (`AppUpdater`, `UpdaterBackend`, `UpdateInfo`) live in `packages/types/src/Updater.ts`, not inline. | None. |

Notes adding judgment beyond `npm run packages:check` (which reports 86 packages valid):

- **No barrel import.** No `@flighthq/sdk` import in `src/` — confirmed.
- **No inline cross-package types.** `updater.ts` declares zero local `interface`/`type`; all shapes resolve to `@flighthq/types`. Correct header-layer usage.
- **Layering / mapping reads cleanly.** An event-capability package over a swappable backend should depend on exactly `signals` (its signal entity) + `types` (the `*Backend` trait and payload types) and nothing else. That is precisely what it declares — no surprising edges, no reach across or "up" a layer. The dependency set is byte-identical to the other event capabilities (`power`, `network`), which is the expected shape for this package class.
- **Tree-shaking.** `"sideEffects": false`; backend registration is opt-in via `setUpdaterBackend` with a lazily-created web default (`getUpdaterBackend`), no module-top-level side effects. Type-only dep imported with `import type`, so `@flighthq/types` pulls no runtime weight.
- **Test deps.** `updater.test.ts` imports only `@flighthq/signals` (`connectSignal`) and `@flighthq/types` (`UpdateInfo`, `UpdaterBackend`) — both already declared; no extra test-only dependency needed.

## Declared vs used

- **Unused declared:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/`.
- **Phantom (used but undeclared):** none. The only imports in `src/` are `@flighthq/signals` and `@flighthq/types`, both declared.
- **Pinning:** both workspace deps pinned `"*"` per convention. `typescript` is the standard `^5.3.0` devDependency.
