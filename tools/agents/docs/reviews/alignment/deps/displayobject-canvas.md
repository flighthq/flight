# Dependency Alignment: @flighthq/displayobject-canvas

**Verdict:** Clean layering and no barrel/inline-type/`import type` problems; the only issues are test-fixture dependency bookkeeping — `@flighthq/sprite` is used in tests but undeclared, and `@flighthq/shape` + `@flighthq/resources` are declared but used only by tests.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/sprite` | Phantom dependency: imported in `canvasQuadBatch.test.ts`, `canvasSprite.test.ts`, `canvasTilemap.test.ts` (`createQuadBatch`, `reserveQuadBatch`, `createSprite`, `createTilemap`, `setTilemapTile`) but not declared anywhere in `package.json`. Resolves only by workspace hoisting; not a self-contained manifest. | Add `"@flighthq/sprite": "*"` (decide deps vs devDependencies per the project's test-fixture policy — see note below). |
| Low | `@flighthq/shape` | Declared in `dependencies` but no source file imports it; used only as a test fixture (`createShape`, `appendShapeRectangle`, etc. in 4 `*.test.ts`). Listing a test-only crate under runtime `dependencies` overstates the runtime graph. | Keep but move to `devDependencies`, or formalize that test-fixture crates stay in `dependencies` and apply that rule consistently across the renderer packages. |
| Low | `@flighthq/resources` | Same as `shape`: declared in `dependencies`, used only in tests (`createImageResource`, `createTextureAtlas`, `addTextureAtlasRegion` in 4 `*.test.ts`). | Same fix as `shape`. Note `displayobject-dom` does _not_ declare `resources` despite the same test-only use — the renderer packages disagree, which is the signal this is unmanaged rather than intentional. |
| Info | layering | Edges read cleanly for a Canvas leaf renderer: `render` (core, depends "up" correctly), `types` (header), value crates `geometry`/`materials`, and the subject packages it draws (`displayobject`, `node`, `text`, `textinput`, `textlayout`). No edge to a sibling backend (`displayobject-dom/gl/wgpu`), no `@flighthq/sdk` import. Nothing surprising. | None. |

Note on policy: these crates are workspace `*` deps and the importing files are tests, so a test genuinely needs them installed. Declaring them is defensible; the inconsistency (sprite undeclared, resources declared here but not in `displayobject-dom`) is the actual defect. `npm run packages:check` passes and does not police test-fixture deps, so this is judgment beyond the tool. Whatever rule is chosen (devDependencies vs dependencies for test fixtures) should be applied uniformly across `displayobject-{canvas,dom,gl,wgpu}`.

Verified clean (no finding):

- No import of `@flighthq/sdk`.
- No inline cross-package types. The only exported `type` in source, `CanvasTextInputOverlay` (`canvasRichText.ts`), is package-local (built from local `CanvasRenderState`), not a redefinition of a `@flighthq/types` contract.
- `"sideEffects": false` is set; all source imports are real value imports of runtime functions (no type-only import miscategorized as value, and conversely no value import that should be `import type`). No `import { type X, y }` mixed-inline violations.
- All declared runtime deps actually used in source: `types`, `render`, `geometry`, `materials`, `displayobject`, `node`, `text`, `textinput`, `textlayout`.
- Workspace deps are all pinned `"*"`.

## Declared vs used

**Declared in `dependencies` but unused by source (test-only):**

- `@flighthq/shape` — test fixtures only.
- `@flighthq/resources` — test fixtures only.

**Used but undeclared (phantom):**

- `@flighthq/sprite` — imported in three `*.test.ts` files, absent from `package.json`.

**Declared and used in source (correct):**

- `@flighthq/types`, `@flighthq/render`, `@flighthq/geometry`, `@flighthq/materials`, `@flighthq/displayobject`, `@flighthq/node`, `@flighthq/text`, `@flighthq/textinput`, `@flighthq/textlayout`.
