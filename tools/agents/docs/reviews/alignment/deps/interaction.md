# Dependency Alignment: @flighthq/interaction

**Verdict:** Mostly clean — types and layering are correct — but two declared `dependencies` are wrong: `@flighthq/scene` is unused, and `@flighthq/displayobject` is test-only and belongs in `devDependencies`.

`npm run packages:check` reports the whole monorepo valid (86 packages), so it does not catch either issue below — both are runtime-vs-dev / used-vs-declared mismatches that the structural check does not police. Everything below is judgment beyond that gate.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/scene` (dependency) | Declared as a runtime dependency but imported nowhere in `src/` — not in source, tests, or comments. Pure phantom edge. It also reads as a surprising edge: a hit-testing/pointer-dispatch package has no business pulling in the 3D world graph. | Remove from `dependencies`. |
| Medium | `@flighthq/displayobject` (dependency) | Used **only** in test files (`hitTests.test.ts`, `displayHitTests.test.ts`, `interactionManager.test.ts`) to construct fixtures via `createDisplayObject`. No non-test source imports it. Declaring it as a runtime `dependency` overstates the package's runtime surface and adds it to consumers' install graph unnecessarily. The display-object **type** that source does use (`DisplayObject` in `hitTests.ts`) correctly comes from `@flighthq/types`, so source needs nothing from the runtime package. | Move from `dependencies` to `devDependencies`, mirroring how `@flighthq/sprite` (also test-only) is already placed. |
| Info | `@flighthq/sprite` (devDependency) | Correctly classified: referenced only by `spriteHitTests.test.ts`. No action — noted as the right pattern the displayobject fix should match. | — |

Confirmed-correct edges (no action): `@flighthq/types` (header types only, `import type`), `@flighthq/node` (graph traversal: `getNodeRuntime`, `getNodeParent`, world transform/bounds), `@flighthq/geometry` (point-in-rect, matrix inverse-transform), `@flighthq/signals` (interaction manager dispatch). All four are used in non-test source, pinned `"*"`, and read predictably from the package's purpose. No import of `@flighthq/sdk`. No cross-package types redefined inline (the `DisplayObject`/`NodeAny`/`InteractionManager` types are all sourced from `@flighthq/types`). All cross-package type imports use `import type`; `"sideEffects": false` is set and the source has no top-level side effects, so tree-shaking is preserved.

## Declared vs used

**Unused (declared, never imported):**

- `@flighthq/scene` — remove.

**Misclassified (declared as runtime `dependency`, used test-only):**

- `@flighthq/displayobject` — move to `devDependencies`.

**Phantom (used but undeclared):** none. Every imported `@flighthq/*` package is declared somewhere; `@flighthq/sprite` (test-only) is correctly in `devDependencies`.

**Pinning:** all workspace deps pinned `"*"` — correct.
