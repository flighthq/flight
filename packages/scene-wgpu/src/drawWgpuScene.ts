import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry';
import { getNodeWorldMatrix4 } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { getSceneNodeWorldAlpha } from '@flighthq/scene';
import type {
  Camera3D,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshSubset,
  SceneLightBlock,
  SceneLightsLike,
  SceneNode,
  SceneRenderProxy,
  SurfaceMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuSceneDrawEntry,
} from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { resolveWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { drawWgpuSceneParticleEmitter3Ds } from './wgpuParticleEmitter3D';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Draws a prepared 3D scene on the Wgpu backend — the WGSL mirror of scene-gl's drawGlScene. The app
// runs prepareSceneRender(state, scene, camera, lights) first (resolving world matrices, the camera
// view-projection, frustum culling, and the packed light block into the per-state SceneRenderList);
// drawWgpuScene retrieves that same cached list (prepareSceneRender is idempotent per-state scratch) and,
// for each visible Mesh, draws each of its geometry subsets with the subset's resolved material's
// registered mesh-material renderer.
//
// The draw is two-phased for correct alpha compositing: opaque/masked subsets first in scene order,
// then blended-material or faded-object subsets back-to-front. The second pass selects immutable
// blended pipeline variants (src-alpha / one-minus-src-alpha, depth test on, depth writes off).
//
// Subsets sharing the same resolved renderer + material are drawn under a single bind (the seam's
// "contiguous run" contract): bind uploads the shared camera + light + material state once, then draw
// issues the per-subset indexed draw. A subset whose material resolves to no renderer (and no
// DefaultMaterialKind fallback) is skipped — no built-in fallback. Depth/cull state is owned by the
// material renderer's pipeline; the surrounding rgba16float scene render pass + depth attachment is
// the effect pipeline's, not drawWgpuScene's. Must run inside an open render pass.
export function drawWgpuScene(
  state: WgpuRenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
  const list = prepareSceneRender(state, scene, camera, lights);
  const lightBlock = list.lights;
  const viewProjection = list.viewProjection;
  const runtime = getWgpuSceneRuntime(state);
  const opaqueDrawList = runtime.opaqueDrawList;
  const blendedDrawList = runtime.blendedDrawList;
  recycleDrawEntries(opaqueDrawList, runtime.opaquePool);
  recycleDrawEntries(blendedDrawList, runtime.blendedPool);

  for (let m = 0; m < list.meshCount; m++) {
    const mesh = list.visibleMeshes[m];
    const subsets = mesh.geometry.subsets;
    const worldMatrix = getNodeWorldMatrix4(mesh) as Matrix4;
    const wx = worldMatrix.m[12];
    const wy = worldMatrix.m[13];
    const wz = worldMatrix.m[14];
    const vp = viewProjection.m;
    const clipW = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    const objectAlpha = getSceneNodeWorldAlpha(mesh);

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveWgpuMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      const blended = isBlendedMaterial(resolvedMaterial) || objectAlpha < 1;
      const entry = acquireDrawEntry(blended ? runtime.blendedPool : runtime.opaquePool);
      entry.alpha = objectAlpha;
      entry.clipW = clipW;
      entry.lightBlock = lightBlock;
      entry.material = resolvedMaterial;
      entry.mesh = mesh;
      entry.renderer = renderer;
      entry.subset = subsets[s];
      entry.worldMatrix = worldMatrix;
      (blended ? blendedDrawList : opaqueDrawList).push(entry);
    }
  }

  drawEntries(state, opaqueDrawList, camera, false);
  if (blendedDrawList.length > 0) {
    blendedDrawList.sort(compareBlendedEntriesDescending);
    drawEntries(state, blendedDrawList, camera, true);
  }

  // ParticleEmitter3D nodes carry no geometry, so prepareSceneRender never lists them among the
  // visible meshes above. Draw them here as a final transparent instanced pass so the common
  // drawWgpuScene path renders a scene's emitters without the caller also invoking the emitter pass
  // by hand — mirroring drawGlScene. drawWgpuSceneParticleEmitter3Ds stays exported for manual ordering;
  // it early-returns when the scene has no emitters, so the mesh-only path is unaffected. Runs inside
  // this still-open render pass (it reads the pass off the render-state runtime).
  drawWgpuSceneParticleEmitter3Ds(state, scene, camera, lights);
}

function drawEntries(
  state: WgpuRenderState,
  entries: Readonly<WgpuSceneDrawEntry[]>,
  camera: Readonly<Camera3D>,
  blended: boolean,
): void {
  const runtime = getWgpuSceneRuntime(state);
  runtime.activeBlendedRun = blended;
  let boundMaterial: Readonly<Material> | undefined;
  let boundLightBlock: Readonly<SceneLightBlock> | null = null;
  let boundRenderer: WgpuMeshMaterialRenderer | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as DrawEntry;
    const worldMatrix = entry.worldMatrix as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

    if (entry.renderer !== boundRenderer || entry.material !== boundMaterial || entry.lightBlock !== boundLightBlock) {
      entry.renderer.bind(state, entry.material, entry.lightBlock, camera);
      boundRenderer = entry.renderer;
      boundMaterial = entry.material;
      boundLightBlock = entry.lightBlock;
    }

    proxy.alpha = entry.alpha;
    proxy.material = entry.material;
    proxy.normalMatrix = scratchNormalMatrix;
    proxy.subset = entry.subset;
    proxy.worldMatrix = worldMatrix;
    entry.renderer.draw(state, proxy, entry.mesh.geometry);
  }
}

function isBlendedMaterial(material: Readonly<Material>): boolean {
  return (material as Readonly<SurfaceMaterial>).alphaMode === 'blend';
}

// Resolves the Material for a subset index: the positional materials[i] entry, or null when the
// slot is absent/null (the registry then falls back to DefaultMaterialKind, or skips the subset).
function resolveSubsetMaterial(mesh: Readonly<Mesh>, subsetIndex: number): Readonly<Material> | null {
  const materials = mesh.materials;
  return subsetIndex < materials.length ? materials[subsetIndex] : null;
}

function compareBlendedEntriesDescending(a: WgpuSceneDrawEntry, b: WgpuSceneDrawEntry): number {
  return b.clipW - a.clipW;
}

interface DrawEntry {
  alpha: number;
  clipW: number;
  lightBlock: Readonly<SceneLightBlock>;
  material: Readonly<Material>;
  mesh: Mesh;
  renderer: WgpuMeshMaterialRenderer;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}

function acquireDrawEntry(pool: WgpuSceneDrawEntry[]): WgpuSceneDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}

function recycleDrawEntries(entries: WgpuSceneDrawEntry[], pool: WgpuSceneDrawEntry[]): void {
  while (entries.length > 0) pool.push(entries.pop()!);
}

function createDrawEntry(): WgpuSceneDrawEntry {
  return {
    alpha: 1,
    clipW: 0,
    lightBlock: null!,
    material: DEFAULT_MATERIAL,
    mesh: null!,
    renderer: null!,
    subset: { indexCount: 0, indexOffset: 0 },
    worldMatrix: createMatrix4(),
  };
}

// The reused per-draw proxy handed to a renderer's draw. Owned by drawWgpuScene, valid only for the
// duration of the draw call it is passed to; renderers must not retain it.
const proxy: SceneRenderProxy = {
  alpha: 1,
  material: { kind: DefaultMaterialKind } as Material,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

// Placeholder material for proxy.material when a subset resolved to the default-kind fallback with
// no concrete material; the renderer treats a default/null material as its untextured defaults.
const DEFAULT_MATERIAL = { kind: DefaultMaterialKind } as Material;

const scratchNormalMatrix = createMatrix3() as Matrix3;
