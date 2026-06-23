# Dependency Alignment: @flighthq/displayobject-gl

**Verdict:** Mostly clean — no barrel import, no inline cross-package types, `import type` discipline intact, `sideEffects: false`; two issues stand out: one phantom runtime dep (`@flighthq/sprite`, test-only) and one architectural cross-backend edge (`@flighthq/displayobject-canvas`, a documented stopgap that breaks the "backends do not depend on each other" rule).

`npm run packages:check` passes (86 packages valid); everything below is judgment beyond that gate.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/displayobject-canvas` | Backend-depends-on-backend. `glShape.ts` / `glScale9Shape.ts` import `renderCanvasShapeCommands` / `mapCanvasScale9ShapeCommands` to rasterize shapes into an offscreen Canvas2D, then upload the canvas as a GPU texture; `index.ts` also re-exports the canvas shape-command registry under `Gl*` aliases. The CLAUDE map states "backends do not depend on each other," and this edge is unpredictable from the package's purpose (a WebGL2 renderer). It is a deliberate, comment-documented stopgap ("shapes deferred to canvas for now"), so it is correct as declared today, not a packaging error. | Track as a known divergence: the GL backend should rasterize shapes via its own path tessellation (`@flighthq/path` is already a dep and `tessellatePath` is already used) or a shared shape-raster crate, so it does not reach sideways into the Canvas2D backend. Until then, keep the dep but flag the edge in the conformance/divergence map. |
| Low | `@flighthq/sprite` | Declared in `dependencies` but never imported in non-test source. Used only in `glSprite.test.ts` and `glVelocity.test.ts` (`createSprite`, `createParticleEmitter`, `createQuadBatch`, …). Source code refers to the `Sprite` / `SpriteRenderer` _types_ via `@flighthq/types`, not via `@flighthq/sprite`. This is a phantom runtime dependency: it inflates the declared graph and misleads a reader into thinking the GL renderer consumes sprite runtime helpers, when it only needs them to build test fixtures. | Move `@flighthq/sprite` to `devDependencies` (still pinned `*`), since it is a test-only fixture source. If a sibling backend keeps it in `dependencies` for symmetry, note that convention; otherwise demote. |

## Declared vs used

**Unused (declared, not imported in non-test src):**

- `@flighthq/sprite` — test-only (fixtures in `glSprite.test.ts`, `glVelocity.test.ts`); not referenced by any source module.

**Phantom (used but undeclared):** none. Every non-test `@flighthq/*` import resolves to a declared dependency:

- `@flighthq/types` (43), `@flighthq/render-gl` (42), `@flighthq/render` (9), `@flighthq/node` (5), `@flighthq/materials` (3), `@flighthq/textlayout` (3), `@flighthq/displayobject-canvas` (3), `@flighthq/text` (2), `@flighthq/displayobject` (2), `@flighthq/velocity` (1), `@flighthq/textinput` (1), `@flighthq/shape` (1), `@flighthq/path` (1), `@flighthq/geometry` (1).

**Other checks (all clean):**

- No `@flighthq/sdk` (barrel) import.
- No inline cross-package type definitions. The two exported types (`GlRichTextOverlay`, `GlShapeMesh`) are package-local (referenced only within displayobject-gl), so they correctly stay out of `@flighthq/types`.
- All workspace deps pinned `"*"`; lone external dep is `typescript` (devDependency).
- `import type` used on its own lines; no `import { type X, y }` mixing.
- Layering is otherwise correct: depends down/up onto `render` (core) and `render-gl` (GL backend core), and onto value/header packages (`types`, `node`, `geometry`, `materials`, `path`, `shape`, `text`, `textlayout`, `textinput`, `velocity`, `displayobject`). The only sideways edge is `displayobject-canvas` (above).
