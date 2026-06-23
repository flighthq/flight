# Filename Alignment: @flighthq/displayobject-canvas

**Verdict:** Backend-variant package (`*-canvas`), so the prefix-first `canvas` token is required on every file — and every source file follows it. Strong overall; two files need attention: one whose name describes the wrong domain (`canvasMaterials.ts` is actually blend-mode code), and one with acronym-casing drift plus a generic `Binding` suffix (`canvasCSSFilterBinding.ts`).

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `canvasMaterials.ts` | Name says the **materials** domain, but the file contains only blend-mode logic — the `CANVAS_BLEND_MODE` map, `applyCanvasBlendMode`, `enableCanvasBlendModeSupport`. The real material domain lives in `canvasMaterialRegistry.ts`, so this name actively misleads (two files both reading as "materials" when one is blend mode). | `canvasBlendMode.ts` |
| `canvasCSSFilterBinding.ts` | Two issues: (1) acronym casing `CSS` is inconsistent with its own exports, which use `Css` (`getCanvasCssFilter`, `setCanvasCssFilter`) — the only uppercase-acronym filename in the package; (2) `Binding` is a generic, domain-free suffix. The domain is the CSS filter. | `canvasCssFilter.ts` |

## Clean

Every other file is prefix-first `canvas` and names a real domain or object — no single-function names, no generic dumping-ground names (no `data.ts` / `utils.ts` / `helpers.ts` / `format.ts`), no suffix-style backend tokens. Tests are colocated as `<source>.test.ts` mirroring each source file. The `index.ts` barrel is a re-export only.

- `canvasBackground.ts`
- `canvasBitmap.ts`
- `canvasCache.ts` — render-cache domain (create/enable/ensure/get/refresh/release cache state + default cache renderer)
- `canvasClip.ts` — clip-support enable seam; pairs with the rectangle/contour operations file below
- `canvasClipRectangle.ts` — push/pop clip rectangle + contour operations
- `canvasDisplayObject.ts`
- `canvasElement.ts` — `HTMLCanvasElement` creation; the object it operates over
- `canvasFillPattern.ts`
- `canvasMaterialRegistry.ts` — the genuine material renderer registry (apply/get/register/resolve)
- `canvasParticleEmitter.ts`
- `canvasQuadBatch.ts`
- `canvasRenderState.ts`
- `canvasRenderTarget.ts`
- `canvasRichText.ts`
- `canvasScale9Mapper.ts`
- `canvasScale9Shape.ts`
- `canvasShape.ts`
- `canvasShapeCommands.ts` — the default shape-command descriptor set (a real object domain, not one function)
- `canvasShapeRegistry.ts` — shape-command registry
- `canvasSprite.ts`
- `canvasTextInput.ts`
- `canvasTextLabel.ts`
- `canvasTextMeasure.ts`
- `canvasTilemap.ts`
- `canvasTransform.ts`
- `canvasVideo.ts`
- `index.ts`
