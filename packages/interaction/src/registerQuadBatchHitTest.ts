import { createMatrix, inverseMatrixTransformPointXY, setMatrixFromFloat32Array } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix } from '@flighthq/node/contract';
import type { Matrix, Node2D, NodeAny, QuadBatch, TextureAtlasRegion } from '@flighthq/types/contract';
import { QuadBatchKind, TextureAtlasRotation } from '@flighthq/types/contract';

import { registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for quad batches: the point resolves to the *instance* under it, so
 * `describeGraphHit`'s `subIndex` becomes the quad index — the basis for picking one sprite out of a
 * batch that is a single node to the scene graph.
 *
 * Instances are tested back-to-front (last drawn wins), matching the renderers' submission order, and a
 * gap between quads is a miss rather than a bounding-box hit. Each quad's extent comes from its atlas
 * region, with a packer quarter-turn swapping width and height exactly as the renderers do.
 *
 * Importing this module is the opt-in — it pulls no batch-specific package (the geometry is read from
 * the node's own data), but it is registered separately so the per-instance walk is never paid by a
 * scene that only needs the coarse batch bounds.
 */
export function registerQuadBatchHitTest(): void {
  registerHitTestPrecise(QuadBatchKind, resolveQuadBatchInstanceIndex);
}

// -1 when no instance covers the point; otherwise the index of the frontmost instance that does.
function resolveQuadBatchInstanceIndex(source: NodeAny, x: number, y: number): number {
  const { atlas, ids, instanceCount, transforms, transformType } = (source as QuadBatch).data;
  if (atlas === null || instanceCount === 0) return -1;

  inverseMatrixTransformPointXY(quadBatchHitLocalPoint, getNodeWorldMatrix(source as Node2D), x, y);
  const lx = quadBatchHitLocalPoint.x;
  const ly = quadBatchHitLocalPoint.y;
  const regions = atlas.regions;
  const stride = transformType === 'vector2' ? 2 : 6;

  // Back-to-front: the last instance submitted is drawn on top, so it owns a shared point.
  for (let index = instanceCount - 1; index >= 0; index--) {
    const region = regions[ids[index]] as TextureAtlasRegion | undefined;
    if (region === undefined || region.width <= 0 || region.height <= 0) continue;
    const rotated = region.rotation !== TextureAtlasRotation.None;
    const width = rotated ? region.height : region.width;
    const height = rotated ? region.width : region.height;

    const offset = index * stride;
    if (transformType === 'vector2') {
      const qx = lx - transforms[offset];
      const qy = ly - transforms[offset + 1];
      if (qx >= 0 && qy >= 0 && qx < width && qy < height) return index;
      continue;
    }

    // A per-instance matrix can rotate and skew the quad, so the point inverts through it rather than
    // being offset — the quad rect is only axis-aligned in the instance's own space.
    setMatrixFromFloat32Array(quadBatchHitMatrix, offset, transforms);
    inverseMatrixTransformPointXY(quadBatchHitQuadPoint, quadBatchHitMatrix, lx, ly);
    const qx = quadBatchHitQuadPoint.x;
    const qy = quadBatchHitQuadPoint.y;
    if (qx >= 0 && qy >= 0 && qx < width && qy < height) return index;
  }
  return -1;
}

const quadBatchHitLocalPoint = { x: 0, y: 0 };
const quadBatchHitQuadPoint = { x: 0, y: 0 };
const quadBatchHitMatrix: Matrix = createMatrix();
