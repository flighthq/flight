# Dependency Alignment: @flighthq/spritesheet

**Verdict:** Layering and types hygiene are clean, but the declared dependency set is wrong on three counts — a phantom (`entity` used-but-undeclared), an unused dep (`geometry`), and a test-only dep mislabeled as runtime (`resources`); `npm run packages:check` passes and catches none of these.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/entity` | Phantom dependency: `createEntity` is imported in production source (`spritesheet.ts`, `spritesheetAnimation.ts`) but `@flighthq/entity` is not in `dependencies`. It resolves today only via workspace hoisting; a clean install or stricter resolver would break the build. `createEntity` originates solely in `@flighthq/entity` and is not re-exported by `displayobject`/`node`, so there is no transitive cover. | Add `"@flighthq/entity": "*"` to `dependencies` (and `{ "path": "../entity" }` to `tsconfig.json` references). |
| Medium | `@flighthq/geometry` | Unused dependency: declared in `dependencies` and referenced in `tsconfig.json`, but imported by zero files (production or test). The package does no geometry math directly — rectangles/regions are carried on `Tileset`/`TextureAtlas` from `@flighthq/resources` and `@flighthq/types`. | Remove from `dependencies` and drop `{ "path": "../geometry" }` from `tsconfig.json`. |
| Medium | `@flighthq/resources` | Misplaced dependency: imported only in `.test.ts` files (`spritesheetFrom.test.ts`, `spritesheetTimelineSource.test.ts`) — `createTextureAtlas`, `createTileset`, `buildTilesetRegions`, etc. No production source imports it. As a runtime `dependency` it overstates the published package's coupling. | Move to `devDependencies`. (Confirm `spritesheetFrom.ts`/`spritesheetData.ts` truly need no resources types at runtime — they consume `Tileset`/`Spritesheet` from `@flighthq/types` only, which is correct.) |
| Info | `@flighthq/displayobject`, `@flighthq/node` | Surprising-but-justified upward-looking edges for an animation-data package: pulled in only by `spritesheetTimelineSource.ts` (`createBitmap`, `addNodeChild`, `invalidateNodeLocalTransform`) to materialize frames onto a display target. Edge is legitimate and the file documents the boundary well. Acceptable; noted because it is the one edge a reader would not predict from "spritesheet frame animation." | None — keep, but keep this seam isolated to the timeline-source file so the data core stays display-free. |

## Declared vs used

**Unused (declared, never imported):**

- `@flighthq/geometry` — remove.

**Misplaced (declared runtime, used only in tests):**

- `@flighthq/resources` — move to `devDependencies`.

**Phantom (used in production, not declared):**

- `@flighthq/entity` — add to `dependencies`.

**Correct (declared and used in production):**

- `@flighthq/displayobject`, `@flighthq/node`, `@flighthq/signals`, `@flighthq/types` — all imported in production source, pinned `"*"`.

**Clean elsewhere:**

- No `@flighthq/sdk` (barrel) import.
- No inline cross-package types: every cross-package type (`Spritesheet`, `SpritesheetAnimation`, `SpritesheetFrame`, `SpritesheetPlayer`, `Tileset`, `Bitmap`, `DisplayObject`, `TimelineSource`) is imported from `@flighthq/types`.
- All type-only imports use `import type`. `"sideEffects": false`; no top-level side effects. The `timeline` decoupling via the shared `TimelineSource` header contract is correct and documented.
