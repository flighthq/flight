# Filename Alignment: @flighthq/sprite

**Verdict:** Clean. This is a single-implementation domain package (no backend variants — no canvas/dom/gl/wgpu split), so plain domain/object filenames are correct and no backend prefix applies. All four source files name their domain object, tests mirror them, and `index.ts` is a thin barrel.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `particleEmitter.ts` — names the ParticleEmitter object (createParticleEmitter, reserveParticleEmitter, computeParticleEmitterLocalBoundsRectangle, getParticleEmitterCapacity).
- `quadBatch.ts` — names the QuadBatch object (createQuadBatch, reserveQuadBatch, resizeQuadBatch, hitTestQuadBatchPoint, getQuadTransformStride). Multiple functions over one domain — not a single-function file.
- `sprite.ts` — names the Sprite object (createSprite, computeSpriteLocalBoundsRectangle, getSpriteRuntime).
- `tilemap.ts` — names the Tilemap object (createTilemap, getTilemapTile, setTilemapTile, fillTilemapTiles, resizeTilemap).
- `index.ts` — thin re-export barrel (`export *` over the four domain files); a legitimate barrel, not a dumping ground.
- `particleEmitter.test.ts`, `quadBatch.test.ts`, `sprite.test.ts`, `tilemap.test.ts` — colocated and mirror each source filename exactly.

No generic, function-named, or suffix-style names present. No backend-token requirement (single-implementation package).
