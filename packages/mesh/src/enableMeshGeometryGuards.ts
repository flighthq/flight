import { logOnce } from '@flighthq/log/contract';
import type { MeshGeometry } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { explainMeshGeometryUvWrap } from './explainMeshGeometryUvWrap';
import { setMeshGeometryUvWrapGuard } from './meshGeometryGuards';

export function areMeshGeometryGuardsEnabled(): boolean {
  return _enabled;
}

// Uninstalls the guard installed by enableMeshGeometryGuards.
export function disableMeshGeometryGuards(): void {
  setMeshGeometryUvWrapGuard(null);
  _enabled = false;
}

/**
 * Installs the caller-facing mesh geometry guards (opt-in, dev-only). Idempotent.
 *
 * `wrapMeshGeometryUvs` does exactly what it says and can still be the wrong call. Folding each coordinate
 * into [0, 1) is faithful while a primitive's corners share a tile, and tears the primitive when they do
 * not: 0.95 beside 1.02 becomes 0.95 beside 0.02, and that face interpolates backwards across the whole
 * texture. The sphere-mapped builders emit exactly that straddle on their seam faces, deliberately, because
 * no assignment confined to 0..1 can carry a face through the seam continuously. Nothing throws — the fold
 * is per vertex, and a vertex cannot see the primitive it belongs to — so the symptom is a band down the
 * back of a globe, discovered in a render long after the call that caused it.
 *
 * The guard is what a documented warning cannot be: present at the moment of the mistake. It is also the
 * only honest place for the walk, since deciding whether a wrap tears costs a pass over every primitive
 * and core must not pay that to hold a warning nobody asked for.
 */
export function enableMeshGeometryGuards(): void {
  setMeshGeometryUvWrapGuard(warnOnTearingUvWrap);
  _enabled = true;
}

function warnOnTearingUvWrap(geometry: Readonly<MeshGeometry>): void {
  const wrap = explainMeshGeometryUvWrap(geometry);
  if (wrap.tornPrimitiveCount === 0) return;
  logOnce(
    'mesh:uv-wrap-tear',
    LogLevel.Warn,
    {
      firstTornPrimitive: wrap.firstTornPrimitive,
      primitiveCount: wrap.primitiveCount,
      tearsU: wrap.tearsU,
      tearsV: wrap.tearsV,
      tornPrimitiveCount: wrap.tornPrimitiveCount,
      message: `wrapMeshGeometryUvs: ${wrap.tornPrimitiveCount} of ${wrap.primitiveCount} primitives have corners in more than one unit tile, so folding into [0, 1) tears them — a corner at 1.0 lands on 0.0 beside a face-mate at 0.95, and the primitive interpolates backwards across the texture instead of forwards through the boundary. This is most of what a builder emits: any face whose coordinate reaches exactly 1.0 straddles, so a 0..1 quad folds to 0 at all four corners and loses its mapping entirely. If the coordinates are a wrapped parameterisation (a sphere map crossing its longitude seam) they are already correct and want a repeating sampler instead — call createTilingSampler() from @flighthq/texture and do not fold them. Call explainMeshGeometryUvWrap(geometry) for which primitives and which axis.`,
    },
    'mesh',
  );
}

let _enabled = false;
