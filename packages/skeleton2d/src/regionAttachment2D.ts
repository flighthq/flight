import { matrixTransformPointXY, multiplyMatrix, setTransformMatrix } from '@flighthq/geometry/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import type { MatrixLike, RegionAttachment2D, Skeleton2D } from '@flighthq/types/contract';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

// Writes a RegionAttachment2D's four world corner positions into `out` as flat interleaved pairs — order
// bottom-left, top-left, top-right, bottom-right (`[blx, bly, tlx, tly, trx, try, brx, bry]`, 8 floats).
// The region's local rect (centered at its `x`/`y` offset, sized `width`×`height`, rotated/scaled by its
// local transform) is transformed by the slot bone (`boneIndex`) world matrix. Requires
// `computeSkeleton2DWorldTransforms` to have run. Out-parameter, allocation-free (module scratch).
export function computeSkeleton2DRegionAttachmentVertices(
  out: Float32Array,
  attachment: Readonly<RegionAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
): void {
  const world = skeleton.worldMatrices;
  // A slot bound to no bone takes the sentinel rather than writing NaN corners — see
  // skinSkeleton2DAttachmentPoints, which carries the same guard for the attachments that skin.
  if (boneIndex < 0 || boneIndex * MATRIX_STRIDE >= world.length) return;
  // Region local matrix (offset + rotation° + scale; regions carry no shear).
  setTransformMatrix(
    _local,
    attachment.scaleX,
    attachment.scaleY,
    attachment.rotation * DEG_TO_RAD,
    attachment.x,
    attachment.y,
  );
  const b = boneIndex * MATRIX_STRIDE;
  _bone.a = world[b];
  _bone.b = world[b + 1];
  _bone.c = world[b + 2];
  _bone.d = world[b + 3];
  _bone.tx = world[b + 4];
  _bone.ty = world[b + 5];
  // Combined = boneWorld × regionLocal: maps a corner in the region's own space to world.
  multiplyMatrix(_combined, _bone, _local);
  const hw = attachment.width / 2;
  const hh = attachment.height / 2;
  matrixTransformPointXY(_corner, _combined, -hw, -hh);
  out[0] = _corner.x;
  out[1] = _corner.y;
  matrixTransformPointXY(_corner, _combined, -hw, hh);
  out[2] = _corner.x;
  out[3] = _corner.y;
  matrixTransformPointXY(_corner, _combined, hw, hh);
  out[4] = _corner.x;
  out[5] = _corner.y;
  matrixTransformPointXY(_corner, _combined, hw, -hh);
  out[6] = _corner.x;
  out[7] = _corner.y;
}

const _local: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const _bone: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const _combined: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const _corner = { x: 0, y: 0 };
