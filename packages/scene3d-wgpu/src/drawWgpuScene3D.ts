import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry';
import { getNodeWorldMatrix4 } from '@flighthq/node';
import { prepareScene3DRender } from '@flighthq/render';
import { declareWgpuRenderTargetColorSpace, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { getNode3DRuntime, getNode3DWorldAlpha } from '@flighthq/scene3d';
import type {
  Camera3D,
  ColorTransform,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshSubset,
  Scene3DLightBlock,
  Scene3DLightsLike,
  Node3D,
  Scene3DRenderProxy,
  SurfaceMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuScene3DDrawEntry,
  WgpuScene3DForwardLightList,
} from '@flighthq/types';
import { StandardMaterialKind, MAX_FORWARD_LIGHTS } from '@flighthq/types';
import type { WgpuSkinningAdapter } from '@flighthq/types';

import { resolveWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { drawWgpuScene3DParticleEmitter3Ds } from './wgpuParticleEmitter3D';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

// Draws a prepared 3D scene on the Wgpu backend — the WGSL mirror of scene-gl's drawGlScene3D. The app
// runs prepareScene3DRender(state, scene, camera, lights) first (resolving world matrices, the camera
// view-projection, frustum culling, and the packed light block into the per-state Scene3DRenderList);
// drawWgpuScene3D retrieves that same cached list (prepareScene3DRender is idempotent per-state scratch) and,
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
// StandardMaterialKind fallback) is skipped — no built-in fallback. Depth/cull state is owned by the
// material renderer's pipeline; the surrounding rgba16float scene render pass + depth attachment is
// the effect pipeline's, not drawWgpuScene3D's. Must run inside an open render pass.
export function drawWgpuScene3D(
  state: WgpuRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  forwardLights?: Readonly<WgpuScene3DForwardLightList>,
): void {
  const list = prepareScene3DRender(state, scene, camera, lights);
  const lightBlock = list.lights;
  const viewProjection = list.viewProjection;
  const runtime = getWgpuScene3DRuntime(state);
  declareWgpuRenderTargetColorSpace(state, 'linear');
  const hasPreparedForwardLights = forwardLights !== undefined && forwardLights.meshCount === list.meshCount;
  if (!hasPreparedForwardLights && hasExcessForwardLights(lights)) runtime.forwardLightSelectionGuard?.(lights);
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
    const clipZ = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
    const objectAlpha = getNode3DWorldAlpha(mesh);
    const colorTransform = getNode3DRuntime(mesh).resolvedColorTransform;

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveWgpuMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      const blended = isBlendedMaterial(resolvedMaterial) || objectAlpha < 1;
      const entry = acquireDrawEntry(blended ? runtime.blendedPool : runtime.opaquePool);
      entry.alpha = objectAlpha;
      entry.depth = clipZ / clipW;
      entry.colorTransform = colorTransform;
      entry.lightBlock = hasPreparedForwardLights ? forwardLights.meshLightBlocks[m] : lightBlock;
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

  // ParticleEmitter3D nodes carry no geometry, so prepareScene3DRender never lists them among the
  // visible meshes above. Draw them here as a final transparent instanced pass so the common
  // drawWgpuScene3D path renders a scene's emitters without the caller also invoking the emitter pass
  // by hand — mirroring drawGlScene3D. drawWgpuScene3DParticleEmitter3Ds stays exported for manual ordering;
  // it early-returns when the scene has no emitters, so the mesh-only path is unaffected. Runs inside
  // this still-open render pass (it reads the pass off the render-state runtime).
  drawWgpuScene3DParticleEmitter3Ds(state, scene, camera, lights);
  runtime.activeBlendedRun = false;
  runtime.activeColorAdjustmentRun = false;
  runtime.activeSkinnedRun = false;
}

export function isWgpuMeshGpuSkinned(state: WgpuRenderState, mesh: Readonly<Mesh>): boolean {
  const skinning = getWgpuScene3DRuntime(state).skinningAdapter as WgpuSkinningAdapter | null;
  return skinning !== null && skinning.isGpuSkinned(mesh);
}

function drawEntries(
  state: WgpuRenderState,
  entries: Readonly<WgpuScene3DDrawEntry[]>,
  camera: Readonly<Camera3D>,
  blended: boolean,
): void {
  const runtime = getWgpuScene3DRuntime(state);
  runtime.activeBlendedRun = blended;
  let boundMaterial: Readonly<Material> | undefined;
  let boundLightBlock: Readonly<Scene3DLightBlock> | null = null;
  let boundRenderer: WgpuMeshMaterialRenderer | null = null;
  let boundSkinned: boolean | undefined;
  let boundColorAdjustment: boolean | undefined;
  const colorAdjustmentFeatureEnabled = getWgpuRenderStateRuntime(state).wgpuColorAdjustmentMaterialFeature != null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as DrawEntry;
    const worldMatrix = entry.worldMatrix as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);
    const skinned = isWgpuMeshGpuSkinned(state, entry.mesh);
    const colorAdjusted = colorAdjustmentFeatureEnabled && entry.colorTransform !== null;

    if (
      entry.renderer !== boundRenderer ||
      entry.material !== boundMaterial ||
      entry.lightBlock !== boundLightBlock ||
      skinned !== boundSkinned ||
      colorAdjusted !== boundColorAdjustment
    ) {
      runtime.activeColorAdjustmentRun = colorAdjusted;
      runtime.activeSkinnedRun = skinned;
      entry.renderer.bind(state, entry.material, entry.lightBlock, camera);
      boundRenderer = entry.renderer;
      boundMaterial = entry.material;
      boundLightBlock = entry.lightBlock;
      boundSkinned = skinned;
      boundColorAdjustment = colorAdjusted;
    }

    proxy.alpha = entry.alpha;
    proxy.colorTransform = colorAdjusted ? entry.colorTransform : null;
    proxy.jointMatrices = skinned ? entry.mesh.skin!.skeleton.jointMatrices : null;
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

function hasExcessForwardLights(lights: Readonly<Scene3DLightsLike>): boolean {
  return (lights.point?.length ?? 0) > MAX_FORWARD_LIGHTS || (lights.spot?.length ?? 0) > MAX_FORWARD_LIGHTS;
}

// Resolves the Material for a subset index: the positional materials[i] entry, or null when the
// slot is absent/null (the registry then falls back to StandardMaterialKind, or skips the subset).
function resolveSubsetMaterial(mesh: Readonly<Mesh>, subsetIndex: number): Readonly<Material> | null {
  const materials = mesh.materials;
  return subsetIndex < materials.length ? materials[subsetIndex] : null;
}

function compareBlendedEntriesDescending(a: WgpuScene3DDrawEntry, b: WgpuScene3DDrawEntry): number {
  return b.depth - a.depth;
}

interface DrawEntry {
  alpha: number;
  colorTransform: Readonly<ColorTransform> | null;
  depth: number;
  lightBlock: Readonly<Scene3DLightBlock>;
  material: Readonly<Material>;
  mesh: Mesh;
  renderer: WgpuMeshMaterialRenderer;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}

function acquireDrawEntry(pool: WgpuScene3DDrawEntry[]): WgpuScene3DDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}

function recycleDrawEntries(entries: WgpuScene3DDrawEntry[], pool: WgpuScene3DDrawEntry[]): void {
  while (entries.length > 0) pool.push(entries.pop()!);
}

function createDrawEntry(): WgpuScene3DDrawEntry {
  return {
    alpha: 1,
    colorTransform: null,
    depth: 0,
    lightBlock: null!,
    material: DEFAULT_MATERIAL,
    mesh: null!,
    renderer: null!,
    subset: { indexCount: 0, indexOffset: 0 },
    worldMatrix: createMatrix4(),
  };
}

// The reused per-draw proxy handed to a renderer's draw. Owned by drawWgpuScene3D, valid only for the
// duration of the draw call it is passed to; renderers must not retain it.
const proxy: Scene3DRenderProxy = {
  alpha: 1,
  colorTransform: null,
  jointMatrices: null,
  material: { kind: StandardMaterialKind } as Material,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

// Placeholder material for proxy.material when a subset resolved to the default-kind fallback with
// no concrete material; the renderer treats a default/null material as its untextured defaults.
const DEFAULT_MATERIAL = { kind: StandardMaterialKind } as Material;

const scratchNormalMatrix = createMatrix3() as Matrix3;
