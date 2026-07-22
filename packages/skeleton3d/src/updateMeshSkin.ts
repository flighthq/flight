import { getMeshGeometrySkinBindPose, setMeshGeometrySkinBindPose } from '@flighthq/mesh';
import type { Mesh } from '@flighthq/types';

import { computeSkeleton3DJointMatrices } from './skeleton3d';
import { captureMeshSkinBindPose, skinMeshGeometry, updateMeshSkinBindPoseDeformInput } from './skinMeshGeometry';

// Deforms a skinned mesh into its geometry for the current joint pose — the explicit per-frame
// skinning call. Run it after the pose is set (an animation clip applied to the joint nodes, or
// manual joint transforms) and before rendering: it recomputes the skeleton's palette from the
// joints' current world transforms, then linear-blend-skins the geometry's bind pose into
// geometry.vertices and bumps the version so the backends re-upload. A mesh with no skin is a
// no-op, so calling it over a whole scene's meshes is safe. The bind pose is captured once (lazily)
// onto the geometry runtime and reused every frame, so steady-state skinning allocates nothing. The
// version bump alone drives the backend re-upload — no per-frame destroy* of GPU data is needed.
//
// Lives here (with a mesh dep) rather than in @flighthq/scene: its only dependencies are the skinning
// primitives above and mesh's runtime-slot accessors — it never touches the scene graph or animation,
// so pairing it with the skinning it drives keeps skeleton3d below scene with no cycle.
export function updateMeshSkin(mesh: Readonly<Mesh>): void {
  const skin = mesh.skin;
  if (skin == null) return;

  computeSkeleton3DJointMatrices(skin.skeleton);

  const geometry = mesh.geometry;
  let bindPose = getMeshGeometrySkinBindPose(geometry);
  if (bindPose === null) {
    bindPose = captureMeshSkinBindPose(geometry);
    setMeshGeometrySkinBindPose(geometry, bindPose);
  } else if (mesh.morph != null) {
    // The composed update has just written the current morph result into geometry. Refresh only
    // skin's deform input so later morph-weight changes are not frozen into the first captured pose.
    updateMeshSkinBindPoseDeformInput(bindPose, geometry);
  }

  skinMeshGeometry(geometry, skin.skeleton, bindPose);
}
