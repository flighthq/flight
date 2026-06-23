# Dependency Alignment: @flighthq/entity

**Verdict:** Clean — a single-dependency foundational leaf: the sole edge is `@flighthq/types` (pinned `"*"`), every cross-package symbol comes from the header, and the one value import (`EntityRuntimeKey`, a runtime `unique symbol`) is correctly imported as a value while pure types use `import type`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole runtime dependency, pinned `"*"`. Used in every non-test source file: `Entity`, `EntityRuntime` via `import type`, and `EntityRuntimeKey` via a value `import`. All four symbols are defined in `@flighthq/types/src/Entity.ts`, so the edge is correct. | None. |
| None | `EntityRuntimeKey` value import | Imported as a value (not `import type`) in `entity.ts`, `runtime.ts`, `binding.ts`. This is correct, not a tree-shaking smell: `EntityRuntimeKey` is `export const EntityRuntimeKey: unique symbol = Symbol.for('EntityRuntime')` — a runtime symbol used as an object key, so it must survive to runtime. The pure types (`Entity`, `EntityRuntime`) are correctly `import type` and erase. | None. |
| None | `@flighthq/sdk` | Not imported. No barrel edge. | None. |
| None | inline cross-package types | None. The package defines no types of its own; `Entity`/`EntityRuntime` are consumed from the header layer, never redefined locally. As the entity/runtime primitive that higher packages build on, this is exactly the right shape. | None. |
| None | layering / surprising edges | No edges beyond the header. The map reads precisely as predicted for the foundational entity/runtime data model: it sits at the bottom of the package graph (`node`, `displayobject`, etc. depend on it) and reaches "up" to nothing. `sideEffects: false` declared; single `.` export; `index.ts` is a thin re-export of `./binding`, `./entity`, `./runtime`. | None. |

## Declared vs used

- **Declared:** `@flighthq/types` (`dependencies`); `typescript` (`devDependencies`).
- **Used in src:** `@flighthq/types` (all non-test files) — matches declaration. Remaining imports are relative (`./runtime`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. Tests import only `@flighthq/types` and local relatives; `vitest`/`tsx` are root-level dev tooling, not package deps.
- **Pinning:** workspace dep pinned `"*"` per convention. OK.

Note: `npm run packages:check` passes (86 packages valid). This audit adds the cross-check that every declared dep is imported and every import is declared (both hold), and confirms the lone non-`import type` import (`EntityRuntimeKey`) is a deliberate runtime symbol rather than a tree-shaking leak.
