# Filename Alignment: @flighthq/interaction

**Verdict:** Single-implementation domain package (not a backend-variant), so plain domain/object filenames are correct and no backend prefix applies. Filenames are domain/object-shaped and pass the bare-name test; the one issue is an abbreviated type word (`display` for `DisplayObject`) that diverges from the package's own unabbreviated function names and the codebase no-abbreviation rule.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `displayHitTests.ts` | Abbreviates the type word: the file groups `defaultDisplayObjectHitTestPoint`, `defaultBitmapHitTestPoint`, `defaultShapeHitTestPoint`, etc. (all display-object kinds), but the filename truncates `DisplayObject` to `display`. The codebase rule is to never abbreviate type names; sibling `displayobject` package and every function here spell it in full. | `displayObjectHitTests.ts` |

## Clean

- `hitTests.ts` — names the domain (graph hit-testing core: `findGraphHitTarget`, `hitTestGraphPoint`, `hitTestGraphLocalBounds`, `hitTestDisplayObjects`, `registerHitTestPoint`). Domain name grouping multiple functions; self-describing.
- `spriteHitTests.ts` — object/domain name (default hit tests for sprite-family kinds: sprite, quadBatch, tilemap). Self-describing.
- `interactionManager.ts` — names the entity it owns (`InteractionManager` create/connect/dispatch/capture). Self-describing.
- `index.ts` — barrel re-export only; not a dumping ground.
- Tests colocated and mirror sources: `displayHitTests.test.ts`, `hitTests.test.ts`, `interactionManager.test.ts`, `spriteHitTests.test.ts` (the test rename should follow the source rename to `displayObjectHitTests.test.ts`).
