# Dependency Alignment: @flighthq/keyboard

**Verdict:** Clean — both declared deps are used, correctly typed, pinned `*`, and the mapping (`signals` runtime + `types` header) is exactly what a soft-keyboard event capability should pull; no issues found.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Runtime dep, correctly a value import (`createSignal`, `emitSignal`); the event-capability signal entity (`onShow`/`onHide`/`onResize`) is the package's reason to depend on it. Pinned `*`. | — |
| None | `@flighthq/types` | Cross-package types (`SoftKeyboard`, `SoftKeyboardBackend`, `SoftKeyboardInfo`) consumed via `import type` from the header; all three are defined in `packages/types/src/Keyboard.ts`, none redefined inline here. Pinned `*`, pulls no runtime weight. | — |
| None | layering / boundaries | Capability is a flat free-function command+event surface over a swappable `SoftKeyboardBackend`; depends only on `signals` (infra) and `types` (header). No reach across the platform suite, no renderer/backend edges, no `@flighthq/sdk` import. | — |
| None | tree-shaking | `"sideEffects": false`; backend is lazily created in `getSoftKeyboardBackend`, module-level state (`_backend`, `_scratch`, `_subscriptions`) is inert at import — no top-level side effects. | — |

`npm run packages:check` passes (86 packages valid); it confirms manifest/export/side-effect shape. Judgment adds: the declared-vs-used set is exact (see below), and the edge set is unsurprising for an event-style platform capability — `signals` for the entity, `types` for the seam.

## Declared vs used

- **Unused declared deps:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/keyboard.ts` (and the test).
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` imports in `src/` are `signals` and `types`, both declared. No `@flighthq/sdk` import anywhere.
- **Pinning:** both workspace deps pinned `"*"` per convention; `typescript` is the only devDependency.
