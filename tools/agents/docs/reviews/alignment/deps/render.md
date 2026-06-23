# Dependency Alignment: @flighthq/render

**Verdict:** Mostly clean and well-layered, but one phantom runtime dependency (`@flighthq/signals`, used in `src/renderCache.ts` but undeclared) and two test-only deps (`displayobject`, `sprite`) misclassified as runtime `dependencies` — `packages:check` cannot catch any of these because it only validates `"*"` pinning, not imports-vs-deps.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/signals` | Phantom dependency. `src/renderCache.ts` value-imports `createSignal` at runtime (`enableRenderCacheAdapterSignals`), but `signals` is declared in neither `dependencies` nor `devDependencies`. It resolves today only via workspace hoisting; it is an undeclared runtime edge. `packages:check` does not detect it (it only checks `"*"` pinning on _declared_ `@flighthq/*` deps). | Add `"@flighthq/signals": "*"` to `dependencies`. |
| Medium | `@flighthq/displayobject` | Declared as a runtime `dependency` but used **only** in test files (`renderAppearance.test.ts`, `renderProxyAdapter.test.ts`, `renderCache.test.ts`, `renderTransform2d.test.ts`, `renderProxy.test.ts`, `renderTarget.test.ts` — all `createDisplayObject` fixtures). No non-test src file imports it. render core operates on the `Node`/`DisplayObject` _types_ from `@flighthq/types`, not the implementation. | Move to `devDependencies`. |
| Medium | `@flighthq/sprite` | Declared as a runtime `dependency` but used **only** in `renderProxy.test.ts` (`createSprite` fixture). No non-test src import. Same pattern as `displayobject`. | Move to `devDependencies`. |
| Low | `@flighthq/materials` edge | Surprising-but-justified edge: render _core_ depends on `materials` for `unpackColorToLinear` + `LinearColor` in `sceneRender.ts` (3D scene linear-color packing). Reads cleanly given render now owns the 3D scene render list, but worth noting the core→materials coupling exists for one file. No action; flagging for the dependency-mapping reader. | None (correct). |

## Declared vs used

**Phantom (used in src, not declared):**

- `@flighthq/signals` — runtime value import in `src/renderCache.ts`; not in `dependencies` or `devDependencies`.

**Misclassified (declared as runtime `dependencies`, used only in tests → should be `devDependencies`):**

- `@flighthq/displayobject`
- `@flighthq/sprite`

**Declared `dependencies` correctly used in src (non-test):**

- `@flighthq/entity` (`createEntity`, `createEntityRuntime`)
- `@flighthq/geometry` (matrix/aabb/frustum helpers)
- `@flighthq/materials` (`unpackColorToLinear`, `LinearColor`)
- `@flighthq/node` (transform/appearance accessors)
- `@flighthq/types` (header types + `BlendMode`, `RenderCacheKind`, `EntityRuntimeKey`)

**Declared `devDependencies` correctly used (test-only):**

- `@flighthq/camera`, `@flighthq/lighting`, `@flighthq/mesh`, `@flighthq/scene` — all used only in `sceneRender.test.ts`. Correct placement.

**Other checks:**

- No import of `@flighthq/sdk`. ✓
- No inline cross-package types redefined; all cross-package shapes come from `@flighthq/types`. ✓
- All `@flighthq/*` deps pinned `"*"`. ✓ (`packages:check` green)
- `"sideEffects": false`; type imports correctly use `import type` on their own lines; no top-level registration/side effects. ✓
- Single root `.` export, thin barrel. ✓
- Layering respected: render core depends on the header (`types`) + lower-layer value packages (`entity`, `geometry`, `node`, `materials`); it does not depend on any concrete renderer backend, and nothing reaches "up". ✓
