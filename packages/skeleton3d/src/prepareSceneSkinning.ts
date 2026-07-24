import { createAabb } from '@flighthq/geometry';
import { getMeshGeometrySkinBindPose, setMeshGeometrySkinBindPose } from '@flighthq/mesh';
import { getNodeRuntime } from '@flighthq/node';
import type { Mesh, MeshRuntime, NodeAny } from '@flighthq/types';

import { getMeshSkinConservativeBounds } from './getMeshSkinBounds';
import { computeSkeleton3DJointMatrices } from './skeleton3d';
import { captureMeshSkinBindPose } from './skinMeshGeometry';

// Readies one skinned mesh for a GPU-skinned frame WITHOUT CPU-posing its vertices. It recomputes the
// skeleton's joint palette from the joints' current world transforms (what the HAS_SKIN shader variant
// deforms from) and writes the mesh's POSED local-space bounds into the node runtime's
// deformedLocalBounds slot, so cull and picking test the posed silhouette instead of the static
// bind-pose box a GPU-skinned mesh's geometry still holds. A non-skinned mesh is a no-op.
//
// It deliberately does NOT call skinMeshGeometry — a GPU-skinned mesh must keep bind-pose vertices in
// geometry.vertices, the buffer the shader deforms, so CPU-posing them here would double-skin the draw
// or clobber the upload. The bind pose the bounds sweep needs is obtained by CAPTURE, which only reads:
// captureMeshSkinBindPose de-interleaves the current vertices into its own arrays and writes nothing
// back. That read-only capture is what lets a pure-GPU skin path have posed bounds at all. (If the app
// also drives CPU skinning through updateMeshSkin, the bind pose was already captured from pristine
// vertices by that path and this capture is a no-op.)
//
// The sweep is joint-driven, not per-vertex: getMeshSkinConservativeBounds unions the rest box
// transformed by each referenced joint's palette matrix, costing one box-transform per joint rather
// than an O(vertices) pass — cheap enough to run before the cull, which is the only ordering that culls
// a posed mesh correctly. This is the per-mesh primitive; prepareSceneSkinning drives a whole scene.
export function prepareMeshSkinning(mesh: Readonly<Mesh>): void {
  const skin = mesh.skin;
  if (skin == null) return;

  computeSkeleton3DJointMatrices(skin.skeleton);

  const geometry = mesh.geometry;
  let bindPose = getMeshGeometrySkinBindPose(geometry);
  if (bindPose === null) {
    bindPose = captureMeshSkinBindPose(geometry);
    setMeshGeometrySkinBindPose(geometry, bindPose);
  }

  const runtime = getNodeRuntime(mesh as NodeAny) as MeshRuntime;
  let bounds = runtime.deformedLocalBounds;
  if (bounds == null) {
    bounds = createAabb();
    runtime.deformedLocalBounds = bounds;
  }
  getMeshSkinConservativeBounds(bounds, bindPose, skin.skeleton);
}

// Runs prepareMeshSkinning over every enabled mesh in the subtree rooted at `scene` — the per-frame
// skinning-prep pass. Call it BEFORE prepareSceneRender: the render prepare pass culls against the
// posed bounds this writes, so driving it afterwards would cull one frame stale. A skinned+morphed app
// also calls the morph pass (prepareSceneMorph in @flighthq/scene); the two are independent so each
// deformer's consumers pay only for the pass they use — a morph-only app never imports this package.
//
// This is a separate caller-invoked pass rather than something prepareSceneRender does itself so that
// @flighthq/render never depends on @flighthq/skeleton3d: cull consumes the posed bounds as plain data
// off the node runtime, and a rigid or 2D bundle pays nothing for skinning it does not use. The walk
// itself needs only @flighthq/node + @flighthq/mesh (both already skeleton3d dependencies), so it
// carries no @flighthq/scene dependency at all. A scene with no skinned meshes may skip this call; it
// is a no-op for rigid meshes, and disabled subtrees are skipped whole (matching the render walk).
export function prepareSceneSkinning(scene: Readonly<NodeAny>): void {
  if (!scene.enabled) return;

  // Structural mesh test (carries geometry), so it holds for meshes created with a custom kind — the
  // same discrimination collectVisibleMeshes uses.
  const mesh = scene as unknown as Mesh;
  if (mesh.geometry != null) prepareMeshSkinning(mesh);

  const children = getNodeRuntime(scene).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      prepareSceneSkinning(children[i]);
    }
  }
}
