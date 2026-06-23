# Dependency Alignment: @flighthq/geometry

**Verdict:** Clean — dependencies are minimal, correct, and predictable from the package's role; `npm run packages:check` passes and judgment surfaces no additional issues.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | All imports are `import type` (incl. the two multiline `import type { … }` blocks in `matrix.ts`/`matrix4.ts`); pulls no runtime weight; `"sideEffects": false` holds. | — |
| None | `@flighthq/entity` | Runtime value import (`createEntity`) in every entity-backed primitive file (matrix, vector\*, quaternion, aabb, etc.). Correctly a `dependency`, not a `devDependency`. Matches the entity/runtime split mandate. | — |
| None | `@flighthq/geometry` (self) | Self-import appears only in `*.test.ts` files — the standard convention for exercising the public barrel. Not a source-layer cycle. | — |
| Info | dependency mapping | Edge set (`types` + `entity`) reads exactly as a reader would predict for a math-primitives package: types is the header layer, entity supplies the runtime identity that backs `Matrix`/`Vector`/etc. No surprising or cross-boundary edges; no renderer/node/sdk reach. | — |

Cross-checked against the checklist:

- No `@flighthq/sdk` import anywhere in `src/` (confirmed `NONE`).
- No inline cross-package type or interface definitions in `src/` — every cross-package type (`Matrix`, `Vector3`, `*Like`, etc.) is imported from `@flighthq/types`.
- Workspace deps pinned `"*"` (`@flighthq/entity`, `@flighthq/types`).
- No layer-up reach and no backend-to-backend edge (none applicable to this leaf math crate).
- `typedarray.ts` has zero imports (pure leaf), consistent with its capacity-helper role.

## Declared vs used

- **Unused declared dependencies:** none. Both `@flighthq/entity` (value) and `@flighthq/types` (type) are imported in non-test `src/`.
- **Phantom (used-but-undeclared) dependencies:** none. The only `@flighthq/*` specifiers imported are `entity`, `types`, and the self-import; the self-import is test-only and needs no manifest entry.
- **Verification:** `createEntity` is confirmed exported by `@flighthq/entity` (`packages/entity/src/entity.ts`).
