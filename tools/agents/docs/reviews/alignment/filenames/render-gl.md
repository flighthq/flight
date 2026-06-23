# Filename Alignment: @flighthq/render-gl

**Verdict:** Backend-variant package (`*-gl`) — every source file must be `gl`-prefixed (PREFIX-FIRST) and name a domain/object. The render/shader/target files are exemplary; the three weak spots are the generic `glShaderTypes.ts` / `glTestHelper.ts` suffixes and `internal.ts`, which is both generic AND missing the mandatory `gl` prefix.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `internal.ts` | Missing the mandatory `gl` backend prefix; `internal` is a generic dumping-ground name carrying no domain. It re-exports GL shader types (`GlBitmapShader`, `GlQuadBatchShader`, `GlParticleShader`, `GlScissorRect`, …) from `@flighthq/types`. Bare filename fails the test — nothing says "GL" or "shader types". | `glShaderTypes.ts` — but it overlaps the existing `glShaderTypes.ts` below; the two type re-export barrels should be consolidated into one `gl`-prefixed shader-types file. |
| `glShaderTypes.ts` | `Types` is a generic suffix, not a domain/object. The file is a 1-line type re-export (`GlBitmapShader`, `GlShaderLocations`) that duplicates part of `internal.ts`. Two near-identical type-barrel files is the real smell. | Consolidate with `internal.ts` into a single `glShader.ts`-adjacent type surface; if a dedicated type barrel is kept, name it for the object it carries, e.g. `glShaderLocations.ts`, rather than the generic `…Types`. |
| `glTestHelper.ts` | `Helper` is a generic catch-all that names no domain/object (it provides `makeGlState`/`makeGL`/`makeShaderLoc` test fixtures). The `gl` prefix is correct. | `glStateFixture.ts` (or `glTestFixture.ts`) — name the object the file builds (the GL render-state fixture), not "helper". |
| `glElement.ts` | Borderline: holds a single function `createGlCanvasElement` and is named for the generic DOM word "Element". The bare filename does not say "canvas". Reads as a one-function file named after a vague noun. | `glCanvas.ts` — names the object (the GL canvas element) the file constructs. |

## Clean

- `glBackground.ts` — GL background-clear domain.
- `glDraw.ts` — GL draw primitives (blend-mode apply + quad/attribute draw); a legitimate domain, `gl`-prefixed.
- `glFullscreenPass.ts` — GL fullscreen-pass primitive + render-target clear/draw.
- `glMaterialRegistry.ts` — GL material/shader registry.
- `glRenderState.ts` — GL render-state object.
- `glRenderTarget.ts` — GL render-target object.
- `glRenderTargetPool.ts` — GL render-target pool object.
- `glShader.ts` — GL shader compile/uniform domain.
- `glShaderBinding.ts` — GL shader-binding domain.
- `glShaderRegistry.ts` — GL material-shader registry domain.
- `index.ts` — package barrel; exempt from the descriptiveness rule.
