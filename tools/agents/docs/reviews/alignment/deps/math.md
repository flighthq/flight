# Dependency Alignment: @flighthq/math

**Verdict:** Clean — the single declared dependency (`@flighthq/types`, pinned `"*"`) is used and correct; no phantom, unused, or boundary-crossing edges. `npm run packages:check` passes (86 packages valid).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/types` → `RandomSource` | `random.ts` does `export type { RandomSource }` after importing it. This is a deliberate convenience re-export of a header type from a leaf package, not an inline redefinition — the canonical type lives in `packages/types/src/RandomSource.ts`. The pattern is used in several other packages (`filters`, `application`). No action needed; flagging only so a future reader does not mistake the re-export for a second source of truth. | None — keep `RandomSource` authoritative in `@flighthq/types`. |
| Info | (mapping) | Dependency mapping reads exactly as a reader would predict: a general-math leaf that needs one cross-package type alias (`RandomSource`) and nothing else. No surprising edges, no reach across renderer/graph boundaries, no "up-the-layer" imports. | None. |

No errors or warnings. `import type` is used for the one cross-package type (no runtime weight pulled), `"sideEffects": false` is declared, and `tsconfig.json` references only `../types`, matching the declared deps.

## Declared vs used

- **Declared:** `@flighthq/types` (`"*"`, runtime-section but type-only in practice) — **used** (`import type { RandomSource }` in `random.ts`).
- **Dev:** `typescript ^5.3.0` — standard build tooling.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. The only other module-graph imports in `src/` are local relatives (`./random`, `./nextPowerOfTwo`) and the global `Math` builtin in `nextPowerOfTwo.ts` / `random.ts`.
- **Pinning:** workspace dep correctly pinned `"*"`.

Note: `@flighthq/types` is declared under `dependencies` but every import from it is type-only (`import type`). This is consistent with the rest of the monorepo (types is treated as the shared header layer rather than a `devDependency`), so it is not flagged as a defect.
