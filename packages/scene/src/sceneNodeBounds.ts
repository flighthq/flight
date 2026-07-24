import { createAabb, setAabb, transformAabbByMatrix4, unionAabb } from '@flighthq/geometry';
import { ensureMeshGeometryBounds } from '@flighthq/mesh';
import { ensureNodeWorldMatrix4, getNodeRuntime, getNodeWorldMatrix4 } from '@flighthq/node';
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
// SKINNED MESHES CONTRIBUTE THEIR BIND-POSE BOX, NOT THEIR POSED ONE. A GPU-skinned mesh deforms in
// the shader, so its geometry keeps bind-pose vertices and that is what this unions. The posed bound
// needs the joint palette, which lives in @flighthq/skeleton3d — a layer this package sits below and
// must not reach up into. A caller that needs posed-accurate aggregation composes the two itself at a
// layer that sees both (this walk for rigid/morphed nodes, getMeshDeformedLocalBounds per skinned
// node); a caller fitting a volume around the result absorbs pose excursions with padding instead.
//
// Alias-safe: reads all geometry bounds and world transforms before accumulating into `out`.
// Skinned meshes contribute their bind-pose geometry extents. Posed-accurate aggregate bounds are
// caller composition above the scene layer; shadow fits can use padding to absorb pose excursions.
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
    // Read through the ensure, never `geometry.bounds` directly: bounds are a dirty-gated cache that a
    // deform invalidates by bumping the version, so a raw field read can return a pre-deform box.
    const localBounds = ensureMeshGeometryBounds(node.geometry);
    // Only add a non-empty local bounds to the world accumulator.
    if (localBounds !== null && localBounds.min.x <= localBounds.max.x) {
      ensureNodeWorldMatrix4(node);
      const worldMatrix = getNodeWorldMatrix4(node);
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

const _scratchWorldAabb = createAabb();
