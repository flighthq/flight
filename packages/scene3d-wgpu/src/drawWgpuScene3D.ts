import { unpackColorToLinear } from '@flighthq/color/contract';
import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix4 } from '@flighthq/node/contract';
import {
  declareWgpuRenderTargetColorSpace,
  getWgpuColorAdjustmentMaterialFeature,
} from '@flighthq/render-wgpu/contract';
import { prepareScene3DRender } from '@flighthq/render/contract';
import { getNode3DRuntime, getNode3DWorldAlpha } from '@flighthq/scene3d/contract';
import type {
  Camera3D,
  ColorScaleBias,
  Material,
  InstancedMesh,
  LinearColor,
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
} from '@flighthq/types/contract';
import { BlendMode, StandardMaterialKind, MAX_FORWARD_LIGHTS } from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { resolveWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { INSTANCE_RECORD_FLOATS } from './wgpuMeshPipeline';
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
// blend-mode pipeline variants (material equation, depth test on, depth writes off); a faded opaque
// material uses the ordinary Normal equation.
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
  sortKeyCounter = 0;
  sortKeyMap.clear();

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
    const nodeRuntime = getNode3DRuntime(mesh);
    const colorScaleBias = nodeRuntime.resolvedColorScaleBias;
    const colorMatrix = nodeRuntime.resolvedColorMatrix;

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveWgpuMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      const blended = isBlendedMaterial(resolvedMaterial) || objectAlpha < 1;
      const entry = acquireDrawEntry(blended ? runtime.blendedPool : runtime.opaquePool);
      entry.alpha = objectAlpha;
      entry.depth = clipZ / clipW;
      entry.colorMatrix = colorMatrix;
      entry.colorScaleBias = colorScaleBias;
      entry.lightBlock = hasPreparedForwardLights ? forwardLights.meshLightBlocks[m] : lightBlock;
      entry.material = resolvedMaterial;
      entry.mesh = mesh;
      entry.renderer = renderer;
      entry.sortKey = acquireSortKey(renderer, resolvedMaterial);
      entry.subset = subsets[s];
      entry.worldMatrix = worldMatrix;
      (blended ? blendedDrawList : opaqueDrawList).push(entry);
    }
  }

  if (opaqueDrawList.length > 1) opaqueDrawList.sort(compareOpaqueEntriesBySortKey);
  drawEntries(state, opaqueDrawList, camera, false);
  if (blendedDrawList.length > 0) {
    blendedDrawList.sort(compareBlendedEntriesDescending);
    drawEntries(state, blendedDrawList, camera, true);
  }

  // Instanced meshes use a rigid, indexed path with one instance-step vertex buffer. They are drawn
  // after ordinary opaque/blended entries because per-instance depth sorting is not representable by a
  // single instanced draw; skinning, morphing, and per-instance culling are intentionally unsupported.
  runtime.activeBlendedRun = false;
  runtime.activeSkinnedRun = false;
  const colorAdjustmentFeatureEnabled = getWgpuColorAdjustmentMaterialFeature(state) !== null;
  for (let m = 0; m < list.instancedMeshCount; m++) {
    const mesh = list.visibleInstancedMeshes[m];
    const worldMatrix = getNodeWorldMatrix4(mesh) as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);
    const nodeRuntime = getNode3DRuntime(mesh);
    const colorScaleBias = nodeRuntime.resolvedColorScaleBias;
    const colorMatrix = nodeRuntime.resolvedColorMatrix;
    const colorAdjusted = colorAdjustmentFeatureEnabled && (colorMatrix !== null || colorScaleBias !== null);
    const flatMatrices = flattenInstancedMeshMatrices(mesh);
    for (let s = 0; s < mesh.geometry.subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh as unknown as Mesh, s);
      const renderer = resolveWgpuMeshMaterialRenderer(state, material);
      if (renderer === null) continue;
      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      runtime.activeColorAdjustmentRun = colorAdjusted;
      runtime.activeColorMatrixRun = colorAdjusted && colorMatrix !== null;
      renderer.bind(state, resolvedMaterial, lightBlock, camera);
      proxy.alpha = getNode3DWorldAlpha(mesh);
      proxy.colorScaleBias = colorAdjusted ? colorScaleBias : null;
      proxy.colorMatrix = colorAdjusted ? colorMatrix : null;
      proxy.instanceCount = mesh.instanceCount;
      proxy.instanceMatrices = flatMatrices;
      proxy.jointMatrices = null;
      proxy.normalMatrices = null;
      proxy.material = resolvedMaterial;
      proxy.normalMatrix = scratchNormalMatrix;
      proxy.subset = mesh.geometry.subsets[s];
      proxy.worldMatrix = worldMatrix;
      renderer.draw(state, proxy, mesh.geometry);
    }
  }
  proxy.instanceCount = 0;
  proxy.instanceMatrices = null;

  // ParticleEmitter3D nodes carry no geometry, so prepareScene3DRender never lists them among the
  // visible meshes above. Draw them here as a final transparent instanced pass so the common
  // drawWgpuScene3D path renders a scene's emitters without the caller also invoking the emitter pass
  // by hand — mirroring drawGlScene3D. drawWgpuScene3DParticleEmitter3Ds stays exported for manual ordering;
  // it early-returns when the scene has no emitters, so the mesh-only path is unaffected. Runs inside
  // this still-open render pass (it reads the pass off the render-state runtime).
  drawWgpuScene3DParticleEmitter3Ds(state, scene, camera, lights);
  runtime.activeBlendMode = null;
  runtime.activeBlendedRun = false;
  runtime.activeColorAdjustmentRun = false;
  runtime.activeColorMatrixRun = false;
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
  let boundColorMatrix: boolean | undefined;
  const colorAdjustmentFeatureEnabled = getWgpuColorAdjustmentMaterialFeature(state) !== null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as DrawEntry;
    runtime.activeBlendMode = blended ? getMaterialBlendMode(entry.material) : null;
    const worldMatrix = entry.worldMatrix as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);
    const skinned = isWgpuMeshGpuSkinned(state, entry.mesh);
    const colorAdjusted =
      colorAdjustmentFeatureEnabled && (entry.colorMatrix !== null || entry.colorScaleBias !== null);
    const colorMatrix = colorAdjusted && entry.colorMatrix !== null;

    if (
      entry.renderer !== boundRenderer ||
      entry.material !== boundMaterial ||
      entry.lightBlock !== boundLightBlock ||
      skinned !== boundSkinned ||
      colorAdjusted !== boundColorAdjustment ||
      colorMatrix !== boundColorMatrix
    ) {
      runtime.activeColorAdjustmentRun = colorAdjusted;
      runtime.activeColorMatrixRun = colorMatrix;
      runtime.activeSkinnedRun = skinned;
      entry.renderer.bind(state, entry.material, entry.lightBlock, camera);
      boundRenderer = entry.renderer;
      boundMaterial = entry.material;
      boundLightBlock = entry.lightBlock;
      boundSkinned = skinned;
      boundColorAdjustment = colorAdjusted;
      boundColorMatrix = colorMatrix;
    }

    proxy.alpha = entry.alpha;
    proxy.colorScaleBias = colorAdjusted ? entry.colorScaleBias : null;
    proxy.colorMatrix = colorAdjusted ? entry.colorMatrix : null;
    proxy.jointMatrices = skinned ? entry.mesh.skin!.skeleton.jointMatrices : null;
    proxy.normalMatrices = skinned ? entry.mesh.skin!.skeleton.normalMatrices : null;
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

// A material-authored blend equation applies only when alphaMode itself requests blending. A node fade
// still enters the transparent pass for an opaque/masked material, but retains ordinary Normal over.
// Unknown material kinds routed through a registered renderer also degrade to Normal rather than
// leaking an undefined string into WebGPU's immutable pipeline cache.
function getMaterialBlendMode(material: Readonly<Material>): BlendMode {
  const surface = material as Readonly<SurfaceMaterial>;
  return surface.alphaMode === 'blend' && typeof surface.blendMode === 'string' ? surface.blendMode : BlendMode.Normal;
}

function hasExcessForwardLights(lights: Readonly<Scene3DLightsLike>): boolean {
  return (lights.point?.length ?? 0) > MAX_FORWARD_LIGHTS || (lights.spot?.length ?? 0) > MAX_FORWARD_LIGHTS;
}

// Resolves the Material for a subset index: the positional materials[i] entry, or null when the
// slot is absent/null (the registry then falls back to StandardMaterialKind, or skips the subset).
function resolveSubsetMaterial(
  mesh: Readonly<Pick<Mesh, 'materials'>>,
  subsetIndex: number,
): Readonly<Material> | null {
  const materials = mesh.materials;
  return subsetIndex < materials.length ? materials[subsetIndex] : null;
}

function compareBlendedEntriesDescending(a: WgpuScene3DDrawEntry, b: WgpuScene3DDrawEntry): number {
  return b.depth - a.depth;
}

interface DrawEntry {
  alpha: number;
  colorMatrix: readonly number[] | null;
  colorScaleBias: Readonly<ColorScaleBias> | null;
  depth: number;
  lightBlock: Readonly<Scene3DLightBlock>;
  material: Readonly<Material>;
  mesh: Mesh;
  renderer: WgpuMeshMaterialRenderer;
  sortKey: number;
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
    colorMatrix: null,
    colorScaleBias: null,
    depth: 0,
    lightBlock: null!,
    material: DEFAULT_MATERIAL,
    mesh: null!,
    renderer: null!,
    sortKey: 0,
    subset: { indexCount: 0, indexOffset: 0 },
    worldMatrix: createMatrix4(),
  };
}

let scratchInstanceData = new Float32Array(64 * 20);
const scratchInstanceColor: LinearColor = [0, 0, 0, 0];
// Packs each instance as its model matrix followed by its linear RGBA tint — the 20-float record
// INSTANCE_BUFFER_LAYOUT describes. A batch with no per-instance colours packs opaque white, so the
// shader multiply is an identity there rather than a second pipeline variant.
function flattenInstancedMeshMatrices(mesh: Readonly<InstancedMesh>): Float32Array {
  const count = mesh.instanceCount;
  const needed = count * INSTANCE_RECORD_FLOATS;
  if (scratchInstanceData.length < needed) scratchInstanceData = new Float32Array(needed);
  const colors = mesh.instanceColors;
  for (let i = 0; i < count; i++) {
    const offset = i * INSTANCE_RECORD_FLOATS;
    scratchInstanceData.set(mesh.instanceMatrices[i].m, offset);
    if (colors === null) {
      scratchInstanceData.fill(1, offset + 16, offset + 20);
    } else {
      unpackColorToLinear(scratchInstanceColor, colors[i]);
      scratchInstanceData.set(scratchInstanceColor, offset + 16);
    }
  }
  return scratchInstanceData;
}

// The reused per-draw proxy handed to a renderer's draw. Owned by drawWgpuScene3D, valid only for the
// duration of the draw call it is passed to; renderers must not retain it.
const proxy: Scene3DRenderProxy = {
  alpha: 1,
  colorMatrix: null,
  colorScaleBias: null,
  jointMatrices: null,
  normalMatrices: null,
  material: { kind: StandardMaterialKind } as Material,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

// Placeholder material for proxy.material when a subset resolved to the default-kind fallback with
// no concrete material; the renderer treats a default/null material as its untextured defaults.
const DEFAULT_MATERIAL = { kind: StandardMaterialKind } as Material;

let sortKeyCounter = 0;
const sortKeyMap = new Map<object, number>();

function acquireSortKey(renderer: object, material: object): number {
  let rk = sortKeyMap.get(renderer);
  if (rk === undefined) {
    rk = sortKeyCounter++;
    sortKeyMap.set(renderer, rk);
  }
  let mk = sortKeyMap.get(material);
  if (mk === undefined) {
    mk = sortKeyCounter++;
    sortKeyMap.set(material, mk);
  }
  return rk * 65536 + mk;
}

function compareOpaqueEntriesBySortKey(a: WgpuScene3DDrawEntry, b: WgpuScene3DDrawEntry): number {
  return a.sortKey - b.sortKey;
}

const scratchNormalMatrix = createMatrix3() as Matrix3;
