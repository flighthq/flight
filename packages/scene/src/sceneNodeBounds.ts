import { createAabb, setAabb, transformAabbByMatrix4, unionAabb } from '@flighthq/geometry';
import { computeMeshGeometryBounds } from '@flighthq/mesh';
import { ensureNodeWorldTransformMatrix4, getNodeRuntime, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type { AabbLike, SceneNode } from '@flighthq/types';

import { isMesh } from './mesh';

// Accumulates the world-space AABB of `node` and all of its descendants into `out`. Each Mesh
// leaf contributes its local-space geometry bounds transformed by its world matrix. Transform-only
// group nodes with no Mesh geometry contribute nothing. Disabled nodes (`enabled === false`) are
// still included — filter them in the visitor if you need to exclude them.
//
// If neither `node` nor any descendant is a Mesh, `out` is set to an empty box
// (min = +Infinity, max = -Infinity). The result is in world space.
//
// Alias-safe: reads all geometry bounds and world transforms before accumulating into `out`.
export function getSceneNodeWorldBounds(out: AabbLike, node: Readonly<SceneNode>): void {
  // Reset to empty before accumulation.
  setAabb(
    out,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  _accumulateWorldBounds(out, node);
}

function _accumulateWorldBounds(out: AabbLike, node: Readonly<SceneNode>): void {
  if (isMesh(node)) {
    const geom = node.geometry;
    // Prefer the cached geometry bounds; compute into a scratch if not yet computed.
    let localBounds = geom.bounds;
    if (localBounds === null) {
      computeMeshGeometryBounds(_scratchLocalAabb, geom);
      localBounds = _scratchLocalAabb;
    }
    // Only add a non-empty local bounds to the world accumulator.
    if (localBounds.min.x <= localBounds.max.x) {
      ensureNodeWorldTransformMatrix4(node);
      const worldMatrix = getNodeWorldTransformMatrix4(node);
      transformAabbByMatrix4(_scratchWorldAabb, localBounds, worldMatrix);
      unionAabb(out, out, _scratchWorldAabb);
    }
  }
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      _accumulateWorldBounds(out, children[i] as SceneNode);
    }
  }
}

const _scratchLocalAabb = createAabb();
const _scratchWorldAabb = createAabb();
