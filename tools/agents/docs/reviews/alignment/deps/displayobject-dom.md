# Dependency Alignment: @flighthq/displayobject-dom

**Verdict:** Healthy — no barrel imports, no inline cross-package types, layering is correct (the cross-backend edge to `displayobject-canvas` is an intentional, repo-wide shared-rasterizer pattern); the only smells are two test-only `@flighthq` dependencies, one mis-bucketed as a runtime `dependency` and one phantom (undeclared).

`npm run packages:check` passes (86 packages valid). The findings below are judgment beyond what the checker enforces.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Low | `@flighthq/shape` | Declared under `dependencies` but used **only in tests** (`domShape.test.ts`, `domScale9Shape.test.ts` build Shape fixtures via `createShape`/`appendShape*`). No non-test src import. It rides as a runtime dep because test files ship in the package `files` glob, but the renderer has no runtime need for it. | Move to `devDependencies` (the package emits no Shape data — it consumes already-flattened shape commands via `displayobject-canvas`). |
| Low | `@flighthq/resources` | Imported in `domBitmap.test.ts` (`createImageResource`, `createImageResourceFromCanvas`) but **not declared** at all (neither deps nor devDeps). Phantom edge resolved transitively through the workspace. | Add `@flighthq/resources: "*"` to `devDependencies`. |
| Info | `@flighthq/displayobject-canvas` → DOM backend | A render backend depending on another render backend looks like a sibling-coupling violation, but it is the established shared-rasterizer pattern: DOM cannot draw vector paths natively, so it rasterizes shapes/scale9 into an embedded `<canvas>` via `renderCanvasShapeCommands` / `mapCanvasScale9ShapeCommands` / `createCanvasRenderTarget`. `displayobject-gl` and `displayobject-wgpu` declare the same edge. Not a violation — flagged only so a reader does not mistake it for one. | None. |

## Declared vs used

**Declared, used in non-test src (correct, minimal, all pinned `"*"`):** `displayobject`, `displayobject-canvas`, `entity`, `geometry`, `materials`, `node`, `render`, `text`, `textinput`, `textlayout`, `types`.

**Unused at runtime (test-only, mis-bucketed):**

- `@flighthq/shape` — only in `*.test.ts`; belongs in `devDependencies`.

**Phantom (used-but-undeclared):**

- `@flighthq/resources` — imported in `domBitmap.test.ts`; not declared anywhere.

**Other hygiene checks (all clean):**

- No import of `@flighthq/sdk` (barrel).
- No inline cross-package types. The one local `export type DomTextInputOverlay` is a package-internal callback contract (the registration seam between `domRichText` and `domTextInput`), correctly kept local rather than pushed to `@flighthq/types`.
- `import type` discipline holds: type-only `@flighthq/types` symbols (`DomRenderStateRuntime`, `RenderProxy2D`, `DomRenderState`, `RendererData`, `RichText`, `TextSelectionRectangle`) are imported on dedicated `import type { }` lines; only the value `EntityRuntimeKey` comes through a value import.
- `"sideEffects": false`; package stays tree-shakable with a thin `index.ts` barrel and `register*`/`enable*` opt-in functions (no top-level registration).
- Layering reads cleanly: depends on `render` core (8 imports) not other backends, on `@flighthq/types` as the header (26 imports), and on feature packages (`node`, `text`, `textlayout`, `textinput`, `materials`) it genuinely renders. Every edge is predictable from "DOM renderer for display objects."
