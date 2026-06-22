import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import type {
  Camera,
  GlRenderState,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  SceneLights,
  SceneNode,
  SceneRenderProxy,
} from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { resolveGlMeshMaterialRenderer } from './glMeshMaterialRegistry';

// Draws a prepared 3D scene on the Gl backend. The app runs prepareSceneRender(state, scene, camera,
// lights) first (resolving world matrices, the camera view-projection, frustum culling, and the
// packed light block into the per-state SceneRenderList); drawGlScene retrieves that same cached list
// (prepareSceneRender is idempotent per-state scratch) and, for each visible Mesh, draws each of its
// geometry subsets with the subset's resolved material's registered mesh-material renderer.
//
// Subsets sharing the same resolved renderer + material are drawn under a single bind (the seam's
// "contiguous run" contract): bind uploads the shared camera + light + material state once, then draw
// issues the per-subset indexed draw. A subset whose material resolves to no renderer (and no
// DefaultMaterialKind fallback) is skipped — no built-in fallback. Depth/cull state is owned by the
// material renderer's bind; the surrounding rgba16f + MSAA + depth scene target is the effect
// pipeline's (beginGlRenderEffectPipeline), not drawGlScene's.
export function drawGlScene(
  state: GlRenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): void {
  const list = prepareSceneRender(state, scene, camera, lights);
  const lightBlock = list.lights;

  let boundMaterial: Readonly<Material> | null | undefined = undefined;
  let boundRenderer = null;

  for (let m = 0; m < list.meshCount; m++) {
    const mesh = list.visibleMeshes[m];
    const subsets = mesh.geometry.subsets;
    const worldMatrix = getNodeWorldTransformMatrix4(mesh) as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveGlMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      // Re-bind only when the resolved renderer or material changes; bind uploads the shared
      // camera + light + material state for the run that follows.
      if (renderer !== boundRenderer || material !== boundMaterial) {
        renderer.bind(state, material, lightBlock, camera);
        boundRenderer = renderer;
        boundMaterial = material;
      }

      proxy.material = material ?? DEFAULT_MATERIAL;
      proxy.normalMatrix = scratchNormalMatrix;
      proxy.subset = subsets[s];
      proxy.worldMatrix = worldMatrix;
      renderer.draw(state, proxy, mesh.geometry);
    }
  }
}

// Resolves the Material for a subset index: the positional materials[i] entry, or null when the
// slot is absent/null (the registry then falls back to DefaultMaterialKind, or skips the subset).
function resolveSubsetMaterial(mesh: Readonly<Mesh>, subsetIndex: number): Readonly<Material> | null {
  const materials = mesh.materials;
  return subsetIndex < materials.length ? materials[subsetIndex] : null;
}

// The reused per-draw proxy handed to a renderer's draw. Owned by drawGlScene, valid only for the
// duration of the draw call it is passed to; renderers must not retain it.
const proxy: SceneRenderProxy = {
  material: { kind: DefaultMaterialKind } as Material,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

// Placeholder material for proxy.material when a subset resolved to the default-kind fallback with
// no concrete material; the renderer treats a default/null material as its untextured defaults.
const DEFAULT_MATERIAL = { kind: DefaultMaterialKind } as Material;

const scratchNormalMatrix = createMatrix3() as Matrix3;
