import type { Mesh } from '@flighthq/types';

import { getMeshGeometryMorphBindPose, setMeshGeometryMorphBindPose } from './meshGeometry';
import { refreshMeshGeometryBounds } from './meshGeometryCompute';
import { blendMeshGeometryMorph, captureMeshMorphBindPose } from './morphMeshGeometry';

// Blends a morphed mesh into its geometry for the current weights — the explicit per-frame morph call,
// sibling of updateMeshSkin. Run it after the weights are set (a Weights animation channel applied via
// applyAnimationClipToScene, or manual mesh.morph.weights writes) and before rendering: it captures the
// geometry's base pose once (lazily, onto the geometry runtime) and reuses it every frame, then blends
// base + Σ wᵢ·targetᵢ into geometry.vertices and bumps the version so the GL backend re-uploads (the
// CPU-blend-then-upload morph path). A mesh with no morph is a no-op, so calling it over a whole scene's
// meshes is safe. Steady-state morph allocates nothing.
//
// Lives here, not in @flighthq/scene, even though it takes a Mesh node: it reads only `mesh.geometry`
// and `mesh.morph` and touches the GEOMETRY runtime slot, never the scene graph — so it sits at the
// lowest layer that can host it. That placement is what lets the deform run below scene: skeleton3d's
// updateMeshDeformation composes it with updateMeshSkin as two same-layer primitives, and the render
// prepare pass drives it without @flighthq/render taking a @flighthq/scene dependency. @flighthq/scene
// keeps the half that genuinely needs the graph — routing a Weights animation channel into
// mesh.morph.weights. Unify at the channel target, split at the deformer.
//
// When a mesh carries both a skin and a morph (corrective shapes over skinning), call updateMeshMorph
// first, then updateMeshSkin: morph writes the base-pose-plus-deltas into geometry.vertices, and the
// skin's own bind pose is captured from that first call's result — so capture morph before the skin
// bind pose exists. In the common single-deformer case, order does not matter.
export function updateMeshMorph(mesh: Readonly<Mesh>): void {
  const morph = mesh.morph;
  if (morph == null) return;

  const geometry = mesh.geometry;
  let bindPose = getMeshGeometryMorphBindPose(geometry);
  if (bindPose === null) {
    bindPose = captureMeshMorphBindPose(geometry);
    setMeshGeometryMorphBindPose(geometry, bindPose);
  }

  blendMeshGeometryMorph(geometry, morph, bindPose);
  refreshMeshGeometryBounds(geometry);
}
