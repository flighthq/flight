# Dependency Alignment: @flighthq/input

**Verdict:** Clean — declared deps are minimal, correct, and pinned `*`; imports map exactly to the package's role with no phantom, unused, barrel, or layering violations.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` → value import | Used correctly (`createSignal`, `emitSignal`) for multi-listener input dispatch, which is exactly what signals exist for. Predictable from purpose. | — |
| None | `@flighthq/types` → mixed import | Type-only members (`InputManager`, `InputSignals`, `AttachInputOptions`, `InputKeyboardData`, etc.) on an `import type` line; runtime enums (`KeyCode`, `KeyModifier`) on a separate value `import` line. Split is correct per the "`import type` on its own line" rule. | — |
| Info | `KeyCode` / `KeyModifier` | Imported as values (not `import type`) — correct: they are runtime enums used in expressions (`\|=`, comparisons, lookup-table values), not type positions. Not a phantom runtime pull. | — |
| Info | DOM globals (`Window`, `EventTarget`, `HTMLElement`, `KeyboardEvent`, `requestAnimationFrame`) | Ambient `lib.dom` types/globals, not package deps. No undeclared `@flighthq/*` edge hides here. The package's web-facing surface is expected for an input-normalization layer. | — |

## Declared vs used

- **Declared:** `@flighthq/signals` (`*`), `@flighthq/types` (`*`); dev: `typescript`.
- **Used in src:** `@flighthq/signals` (value), `@flighthq/types` (type + value). Both declared deps are used.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. Test file (`inputManager.test.ts`) imports only `./inputManager`, `@flighthq/signals`, `@flighthq/types` — all declared.
- **Workspace pinning:** both `@flighthq/*` deps pinned `"*"` per convention.
- **No `@flighthq/sdk` import.** No inline cross-package type redefinitions (all input/text types resolved from `@flighthq/types`). No top-level side effects; `"sideEffects": false` is honored (module-level state is pure data tables + scratch reuse objects at file bottom).
