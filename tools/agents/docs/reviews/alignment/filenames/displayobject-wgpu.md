# Filename Alignment: @flighthq/displayobject-wgpu

**Verdict:** Backend-variant package (`*-wgpu`), so the prefix-first `wgpu` token is required on every file — and it is, on all 24 source files. Filenames are strongly aligned; the only smells are two generic-leaning names (`wgpuCache`, `wgpuMaterials`) and one file/object mismatch where `wgpuSpriteBatch.ts` owns the `WgpuQuadBatch*` resources. Note: these names mirror the sibling `displayobject-gl` package 1:1 (`glCache.ts`, `glMaterials.ts`), so any rename should be applied across backends, not just here.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `wgpuMaterials.ts` | Generic plural "materials" that reads like a dumping ground, yet its contents are color-transform–specific (`drawWgpuColorTransformBitmap`, `registerWgpuColorTransformShader`). Sits beside the precisely-named `wgpuColorTransformMaterial.ts` and `wgpuDefaultMaterial.ts`, so the catch-all name hides what it actually covers and overlaps the color-transform domain. | `wgpuColorTransformBitmap.ts` (the bitmap-blit + shader it owns), or fold into `wgpuColorTransformMaterial.ts` |
| `wgpuCache.ts` | "cache" is a generic word; the domain is specifically the **render cache** (`enableWgpuRenderCache`, `ensureWgpuRenderCacheTarget`, `createWgpuCacheState`, `defaultWgpuRenderCacheRenderer`). Bare "cache" does not say which cache. | `wgpuRenderCache.ts` |
| `wgpuSpriteBatch.ts` | File/object mismatch: named for the sprite-batch domain but exports the `WgpuQuadBatchResources` type plus `ensureWgpuQuadBatchResources` / `getWgpuQuadBatchPipeline`, which `wgpuQuadBatch.ts` then re-exports. The quad-batch resources read as belonging to the quad-batch file; the split is a layering choice (low-level buffer/pipeline vs. renderer) but the basename does not advertise that it hosts quad-batch machinery. | Keep as the batch-machinery file but move the `WgpuQuadBatch*` resource/pipeline exports into `wgpuQuadBatch.ts`, or rename to reflect that it is the shared instance-buffer layer (e.g. `wgpuBatchInstances.ts`) |

## Clean

All remaining files are prefix-first and name a clear display-object domain/object — no bare-function names, no folder-dependent names:

- `wgpuBitmap.ts`, `wgpuShape.ts`, `wgpuShapeMesh.ts`, `wgpuSprite.ts`, `wgpuTilemap.ts`, `wgpuVideo.ts` — display-object kinds.
- `wgpuTextLabel.ts`, `wgpuRichText.ts`, `wgpuTextInput.ts` — text objects.
- `wgpuParticleEmitter.ts`, `wgpuVelocity.ts` — particle/velocity domain.
- `wgpuScale9Shape.ts`, `wgpuScale9Mapper.ts` — scale-9 objects (`Mapper` is a real object/type, `Scale9Mapper`, not a single function).
- `wgpuClip.ts`, `wgpuClipContours.ts`, `wgpuClipRectangle.ts` — clip domain split by clip kind; each names an object (contour stack, rectangle stack), not one function.
- `wgpuColorTransformMaterial.ts`, `wgpuDefaultMaterial.ts` — specific material objects.
- `wgpuQuadBatch.ts` — quad-batch renderer object.
- `wgpuDisplayObject.ts` — base display-object renderer.
- `wgpuSpriteRenderer.ts` — sprite renderer object (`defaultWgpuSpriteRenderer`).
- `index.ts` — barrel.

Tests are colocated as `<source>.test.ts` for every source file, mirroring the source basename exactly.
