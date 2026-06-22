import type { Camera } from './Camera';
import type { Material } from './Material';
import type { MeshGeometry } from './MeshGeometry';
import type { SceneLightBlock } from './SceneLightBlock';
import type { SceneRenderProxy } from './SceneRenderProxy';
import type { WgpuRenderState } from './WgpuRenderState';

// Per-backend 3D draw behavior for a material kind on Wgpu, registered against the kind via
// registerWgpuMeshMaterialRenderer. This is the scene (3D) analog of WgpuMaterialRenderer (the 2D
// quad-batch material seam): a separate registry — scene-wgpu owns its own
// WeakMap<WgpuRenderState, …> (sceneMeshMaterialRegistry) keyed by MaterialKind, distinct from the
// 2D materialRendererMap, because a material kind is either 2D or 3D, never both.
//
// The renderer owns its pipeline (the StandardPbr uber-shader variant for its define key) and is
// driven per draw in two steps. drawScene binds shared per-frame state once per material run, then
// draws each Mesh subset:
//
//   bind(state, material, lights, camera)   // pipeline + camera matrices + light block + material
//   draw(state, proxy, geometry)            // upload geometry lazily, set world/normal matrices,
//                                           // draw the proxy's subset index range
//
// This slice implements only the StandardPbr forward path with one directional + one ambient light;
// shadows, IBL, and transmission are later passes that extend the shader behind feature defines, not
// new interface methods.
export interface WgpuMeshMaterialRenderer {
  // Bind the pipeline and upload the per-run shared uniforms: the camera's view/projection matrices
  // and the packed light block. `material` carries this run's material uniforms and textures and is
  // null only for the default material renderer (a mesh subset whose material kind has no registered
  // 3D renderer falls back to DefaultMaterialKind). Called once per contiguous run of subsets sharing
  // this material.
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void;

  // Draw one Mesh subset. Lazily uploads the geometry's GPU buffers (keyed by geometry.version,
  // cached in MeshGeometryRuntime.webgpuData, freed by destroyMeshGeometryWgpuData), sets the
  // per-draw world and normal matrices from `proxy`, and issues the indexed draw over proxy.subset's
  // range with the material's cull/blend state. Called once per subset within a bind run.
  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void;
}
