# Dependency Alignment: @flighthq/filters-canvas

**Verdict:** Clean — declared deps are minimal, correct, and pinned; every edge is predictable from the package's role, and `packages:check` passes with nothing to add.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/filters-css` (runtime) | Edge is non-obvious at first glance (one filter backend depending on another), but it is correct and intentional: the Canvas 2D path renders filters by assigning a CSS filter string to `ctx.filter`, so it legitimately reuses `compute*FilterCss` rather than reimplementing the math. This is layered reuse of the CSS-string layer, not backend-to-backend coupling (it does not reach into `filters-gl`/`filters-wgpu`/`filters-surface`). | None — keep. Worth a one-line note in the package description/map that the Canvas backend is built on the CSS-string layer, so the edge reads as deliberate. |
| None | `@flighthq/types` (runtime) | Used type-only (`BlurFilter`, `DropShadowFilter`, `OuterGlowFilter`), all via `import type`. Declaring it as a normal `dependency` (not `devDependency`) is the codebase convention for the header layer and is correct — `import type` erases at build so no runtime weight is pulled. | None. |

Layering, barrel, and side-effect checks all pass:

- No import of `@flighthq/sdk`.
- No cross-package types redefined inline — all filter types come from `@flighthq/types`.
- No reach "up" a layer and no sibling-backend coupling.
- `import type` used for every type import; the value import (`compute*FilterCss`) is the only runtime edge.
- `"sideEffects": false` declared; `index.ts` is a thin re-export barrel with no top-level side effects. Package stays tree-shakable.
- Workspace deps pinned `"*"`.

## Declared vs used

**Unused declared:** none. Both `@flighthq/filters-css` (value import of `compute*FilterCss`) and `@flighthq/types` (type imports) are used in `src/`.

**Phantom (used-but-undeclared):** none. The only non-relative imports in `src/*.ts` are `@flighthq/filters-css` and `@flighthq/types`, both declared. `vitest`/`typescript` are test/build tooling (provided by root + `devDependencies`), as expected.
