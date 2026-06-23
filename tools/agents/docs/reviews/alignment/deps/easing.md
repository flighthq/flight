# Dependency Alignment: @flighthq/easing

**Verdict:** Clean — a textbook value-typed leaf: the sole dependency is `@flighthq/types` (pinned `*`), imported as `import type` only, with no phantom, unused, or boundary-crossing edges.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole runtime dependency, pinned `"*"`, used only via `import type { EasingFunction }` / `{ StepPosition }` in every source file. Both types are defined in `@flighthq/types` (`EasingFunction.ts`, `StepPosition.ts`), so the type-only edge is correct and erases at build — no runtime weight. | None. |
| None | `@flighthq/sdk` | Not imported. | None. |
| None | inline cross-package types | None defined; `EasingFunction` and `StepPosition` are consumed from the header layer, never redefined locally. | None. |
| None | layering / surprising edges | No edges beyond the header. The dependency map reads exactly as a reader would predict for an easing-math leaf: pure functions over `number`, typed against the shared `EasingFunction` contract. `sideEffects: false` is declared; barrel `index.ts` is a thin re-export, single `.` export. | None. |

## Declared vs used

- **Declared:** `@flighthq/types` (`dependencies`); `typescript` (`devDependencies`).
- **Used in src:** `@flighthq/types` (type-only, all files) — matches declaration.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. All non-`@flighthq` imports are relative (`./ease*`) or the `Math` global.
- **Pinning:** workspace dep pinned `"*"` per convention. OK.

Note: `npm run packages:check` passes (86 packages valid); this audit adds the cross-check that every declared dep is actually imported and every import is declared — both hold.
