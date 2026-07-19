import {
  createAabb,
  isFrustumIntersectingAabb,
  setFrustumFromMatrix4,
  transformAabbByMatrix4,
} from '@flighthq/geometry';
import { computeMeshGeometryBounds } from '@flighthq/mesh';
import { ensureNodeWorldMatrix4, getNodeRuntime, getNodeWorldMatrix4 } from '@flighthq/node';
import type { FrustumLike, Matrix4Like, SceneNode } from '@flighthq/types';

import { isMesh } from './mesh';

// Convenience: derives a camera frustum from a view-projection matrix and calls
// `cullSceneNodeByFrustum`. `viewProjection` must be the combined view × projection matrix
// (as returned by getCameraViewProjectionMatrix4). Writes the derived frustum into `outFrustum`
// so the caller can cache it for the frame (pass createFrustum() or a scratch Frustum).
//
// `aspect` is intentionally absent here — the caller provides the pre-computed viewProjection.
// For camera-specific variants see buildSceneFrustumFromCamera in @flighthq/camera (or compute
// the viewProjection from getCameraViewProjectionMatrix4 before calling this).
export function buildSceneFrustum(out: FrustumLike, viewProjection: Readonly<Matrix4Like>): void {
  setFrustumFromMatrix4(out, viewProjection);
}

// Walks the subtree rooted at `root` depth-first and appends each Mesh leaf whose world-space
// AABB intersects `frustum` to `out`. Transform-only group nodes (no geometry) are never
// collected — only Mesh leaves that pass the AABB frustum test appear in the result. Disabled
// nodes (`enabled === false`) and their entire subtrees are skipped.
//
// `out` is not cleared before collection — the caller controls accumulation order across
// multiple roots. Returns `out` for convenience.
//
// Design note: the integration point with `prepareSceneRender` is caller-driven — the caller
// builds the cull list here, then passes it to the render walk. Scene does not call render; the
// render walk does not call scene. This keeps the dependency graph acyclic.
export function cullSceneNodeByFrustum(
  out: SceneNode[],
  root: Readonly<SceneNode>,
  frustum: Readonly<FrustumLike>,
): SceneNode[] {
  _cullNode(out, root, frustum);
  return out;
}

function _cullNode(out: SceneNode[], node: Readonly<SceneNode>, frustum: Readonly<FrustumLike>): void {
  if (!node.enabled) return;
  if (isMesh(node)) {
    const geom = node.geometry;
    let localBounds = geom.bounds;
    if (localBounds === null) {
      computeMeshGeometryBounds(_scratchLocalAabb, geom);
      localBounds = _scratchLocalAabb;
    }
    if (localBounds.min.x <= localBounds.max.x) {
      ensureNodeWorldMatrix4(node);
      const worldMatrix = getNodeWorldMatrix4(node);
      transformAabbByMatrix4(_scratchWorldAabb, localBounds, worldMatrix);
      if (isFrustumIntersectingAabb(frustum, _scratchWorldAabb)) {
        out.push(node as SceneNode);
      }
    }
    // Mesh with empty bounds contributes nothing.
  }
  // Transform-only group nodes have no geometry and are not collected — only Mesh leaves that
  // pass the frustum test are appended. Descend into children regardless of node type.
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      _cullNode(out, children[i] as SceneNode, frustum);
    }
  }
}

const _scratchLocalAabb = createAabb();
const _scratchWorldAabb = createAabb();
