# Dependency Alignment: @flighthq/lifecycle

**Verdict:** Clean — declared deps exactly match usage, layering is textbook (event-capability cell over `signals` + the `types` header), and nothing surprising; no action needed.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Runtime dep, correctly used (`createSignal`, `emitSignal` in src; `connectSignal` in test). Pinned `*`. This is the expected backbone for an event-style capability. | — |
| None | `@flighthq/types` | Type-only dep, imported with `import type` (`AppLifecycle`, `AppLifecycleState`, `LifecycleBackend`). All three live in `packages/types/src/Lifecycle.ts`; nothing redefined inline. Pinned `*`. | — |
| None | `@flighthq/sdk` | Not imported (correct — packages must not import the barrel). | — |
| None | `sideEffects: false` | Honored: module top-level declares only `let _backend = null` and a `WeakMap`; backend creation and subscription are deferred to `get*`/`attach*`. Tree-shakable. | — |

## Declared vs used

- **Unused declared:** none. Both `@flighthq/signals` and `@flighthq/types` are imported.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports are `signals` and `types`, both declared. No third-party runtime imports; `typescript` is the sole devDependency.

### Notes beyond `packages:check`

`npm run packages:check` passes (86 packages valid) and already enforces the structural rules (workspace `*` pinning, export shape, side-effect-free source). Judgment adds:

- The dependency mapping reads exactly as the package's role predicts. Per the codebase map, `@flighthq/lifecycle` is an **event** capability in the platform suite: "an entity of signals with `create*`/`attach*`/`detach*`/`dispose*`" over a swappable `LifecycleBackend`. Its deps are precisely the two that role implies — `signals` (the entity is signals) and `types` (the `*Backend` seam + payload types). There are no surprising edges and no reach across capability boundaries (it does not touch `@flighthq/app`, `application`, or any sibling capability), which matches the suite's "self-contained cell" design.
- `import type` discipline is correct: the sole `@flighthq/types` import is a dedicated `import type { ... }` line, so it pulls no runtime weight — consistent with treating `types` as the header layer.
- The web default backend is created lazily inside `getLifecycleBackend()` rather than at module load, satisfying the "web backend always lazily available, no import side effects" rule for the platform suite.
