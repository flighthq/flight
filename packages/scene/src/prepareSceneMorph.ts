import { updateMeshMorph } from '@flighthq/mesh';
import { getNodeRuntime } from '@flighthq/node';
import type { Mesh, NodeAny } from '@flighthq/types';

// Blends every enabled morphed mesh in the subtree rooted at `scene` for the current weights — the
// per-frame morph-prep pass. Call it BEFORE prepareSceneRender: the morph writes into geometry.vertices
// and bumps the version, so the render prepare pass then culls against the freshly-morphed bounds (via
// ensureMeshGeometryBounds) and the GL backend re-uploads the deformed buffer.
//
// For morph there is no separate GPU deform, so this render-prep pass IS the CPU blend — unlike skin,
// where the GPU poses in-shader and prepare only readies the palette + a posed-bounds slot. That is why
// a morphed mesh needs no deformedLocalBounds slot: the blend writes real vertices, so the geometry's
// own bounds already describe its current pose. updateMeshMorph is itself dirty-gated, so a settled
// morph over a whole scene costs one weight-vector compare per mesh and no reblend.
//
// This lives in @flighthq/scene, not @flighthq/skeleton3d, so a morph-only app (e.g. an MD2 model) never
// imports the skinning package to animate blend shapes — the skin pass (prepareSceneSkinning) is a
// separate call a skinned app makes, and the two deformers' consumers stay independent. The walk needs
// only @flighthq/node + @flighthq/mesh (both already scene dependencies). A scene with no morphed meshes
// may skip this call; it is a no-op for non-morphed meshes, and disabled subtrees are skipped whole.
export function prepareSceneMorph(scene: Readonly<NodeAny>): void {
  if (!scene.enabled) return;

  // Structural mesh test (carries geometry), so it holds for meshes created with a custom kind — the
  // same discrimination the render walk uses.
  const mesh = scene as unknown as Mesh;
  if (mesh.geometry != null) updateMeshMorph(mesh);

  const children = getNodeRuntime(scene).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      prepareSceneMorph(children[i]);
    }
  }
}
