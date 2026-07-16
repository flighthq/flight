import { getNodeRuntime, getNodeWorldBoundsRectangle } from '@flighthq/node';
import { clearSpatialIndex, insertSpatialObject, querySpatialPoint } from '@flighthq/spatial';
import type { DisplayObject, InteractionManager, NodeAny, SpatialAabb, SpatialObjectId } from '@flighthq/types';

import { hitTestNodeRegion } from './hitTests';
import { getNodeInteractionState } from './nodeInteractionState';

/**
 * Picks the topmost hit among the broadphase candidates at world-space (x, y), matching the tree walk's
 * front-to-back priority (smallest candidate rank wins). Requires `manager.spatialIndex` populated by
 * `refreshInteractionSpatialIndex`; returns null when no candidate's precise region contains the point.
 * The manager's dispatch uses this automatically when a `spatialIndex` is set — callers rarely invoke it.
 */
export function findSpatialInteractionTarget<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  precise: boolean = false,
): N | null {
  const index = manager.spatialIndex;
  if (index === null) return null;
  const nodes = managerCandidates.get(manager);
  if (nodes === undefined || nodes.length === 0) return null;

  querySpatialPoint(index, x, y, spatialQueryOut);
  let best: N | null = null;
  let bestRank = Infinity;
  for (let i = 0; i < spatialQueryOut.length; i++) {
    const rank = spatialQueryOut[i]!;
    if (rank >= bestRank) continue;
    const node = nodes[rank] as N | undefined;
    if (node !== undefined && hitTestNodeRegion(node, x, y, precise)) {
      best = node;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Rebuilds `manager.spatialIndex` from the current scene. Walks the eligible, atomic candidates in
 * front-to-back order — mirroring `findGraphHitTarget` (reverse child order; an atomic `hitArea` unit is
 * indexed and not descended) — and inserts each by its world-bounds AABB. The world bounds are a
 * conservative superset; `hitTestNodeRegion` confirms each candidate precisely on query. Call after the
 * scene graph or transforms change; a no-op without a `spatialIndex`.
 */
export function refreshInteractionSpatialIndex<N extends NodeAny>(manager: InteractionManager<N>): void {
  const index = manager.spatialIndex;
  if (index === null) return;

  const nodes: NodeAny[] = [];
  collectSpatialCandidates(manager.root, nodes);
  managerCandidates.set(manager, nodes);

  clearSpatialIndex(index);
  for (let rank = 0; rank < nodes.length; rank++) {
    const bounds = getNodeWorldBoundsRectangle(nodes[rank] as DisplayObject);
    spatialInsertAabb.minX = bounds.x;
    spatialInsertAabb.minY = bounds.y;
    spatialInsertAabb.maxX = bounds.x + bounds.width;
    spatialInsertAabb.maxY = bounds.y + bounds.height;
    insertSpatialObject(index, rank as SpatialObjectId, spatialInsertAabb);
  }
}

function collectSpatialCandidates(node: NodeAny, out: NodeAny[]): void {
  if (!node.enabled) return;
  const state = getNodeInteractionState(node);
  const enabled = state?.hitTestEnabled === true;

  if (enabled && state?.hitArea != null) {
    out.push(node);
    return;
  }

  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) collectSpatialCandidates(children[i], out);
  }

  if (enabled) out.push(node);
}

const managerCandidates = new WeakMap<object, NodeAny[]>();
const spatialInsertAabb: SpatialAabb = { maxX: 0, maxY: 0, minX: 0, minY: 0 };
const spatialQueryOut: SpatialObjectId[] = [];
