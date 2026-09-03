import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry/contract';
import { hasMeshGeometrySkin } from '@flighthq/mesh/contract';
import { getNodeWorldMatrix4 } from '@flighthq/node/contract';
import {
  declareGlRenderTargetColorSpace,
  enableGlBlendModeSupport,
  getGlColorAdjustmentMaterialFeature,
  invalidateGlRenderStateCache,
} from '@flighthq/render-gl/contract';
import { prepareScene3DRender } from '@flighthq/render/contract';
import { getNode3DRuntime, getNode3DWorldAlpha } from '@flighthq/scene3d/contract';
import type {
  Camera3D,
  ColorScaleBias,
  GlScene3DForwardLightList,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshSubset,
  Scene3DLightsLike,
  Scene3DLightBlock,
  Node3D,
  Scene3DRenderProxy,
  SurfaceMaterial,
  GlScene3DDrawEntry,
} from '@flighthq/types/contract';
import { BlendMode, StandardMaterialKind, MAX_FORWARD_LIGHTS } from '@flighthq/types/contract';

import { resolveGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { drawGlScene3DParticleEmitter3Ds } from './glParticleEmitter3D';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { getGlScene3DViewportAspect } from './glViewportAspect';

// True when a mesh should be GPU-skinned this draw: it carries a skin and its geometry has the joints0/
// weights0 channels. The bone palette is an RGBA32F data texture read via texelFetch, so the joint count
// is bounded by MAX_TEXTURE_SIZE (thousands of joints) rather than the vertex-uniform budget — there is
// no per-context capacity cap and no CPU fallback for large skeletons. The CPU skinning kernel in
// @flighthq/skeleton3d is retained only for bounds/picking, not as a draw fallback.
function isGpuSkinnedDraw(mesh: Readonly<Mesh>): boolean {
  return mesh.skin != null && hasMeshGeometrySkin(mesh.geometry);
}

// Draws a prepared 3D scene on the Gl backend. The app runs prepareScene3DRender(state, scene, camera,
// lights) first (resolving world matrices, the camera view-projection, frustum culling, and the
// packed light block into the per-state Scene3DRenderList); drawGlScene3D retrieves that same cached list
// (prepareScene3DRender is idempotent per-state scratch) and, for each visible Mesh, draws each of its
// geometry subsets with the subset's resolved material's registered mesh-material renderer.
//
// The draw is two-phased for correct alpha compositing:
//   Pass 1 (opaque): every subset whose material alphaMode is 'opaque' or 'mask', in scene-graph
//     order. Depth writes are on. No blending.
//   Pass 2 (blended): every subset whose material alphaMode is 'blend', sorted back-to-front by the
//     mesh's world-space Z in view space (the mesh origin's projected depth). GL blending is enabled,
//     depth writes are disabled across every material rebind, each material's blendMode selects its
//     fixed-function equation, and both states are restored after.
//
// Subsets sharing the same resolved renderer + material are drawn under a single bind (the seam's
// "contiguous run" contract): bind uploads the shared camera + light + material state once, then draw
// issues the per-subset indexed draw. A subset whose material resolves to no renderer (and no
// StandardMaterialKind fallback) is skipped — no built-in fallback. Depth/cull state is owned by the
// material renderer's bind; the surrounding rgba16f + MSAA + depth scene target is the effect
// pipeline's (beginGlRenderEffectPipeline), not drawGlScene3D's.
//
// Draw-entry pools and per-frame draw lists are held on the GlScene3DRuntime so two independent render
// states never share allocation (module-level singletons would interleave if two states drew in the
// same tick, even though JS is single-threaded today).
export function drawGlScene3D(
  state: GlRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  forwardLights?: Readonly<GlScene3DForwardLightList>,
): void {
  const list = prepareScene3DRender(state, scene, camera, lights, getGlScene3DViewportAspect(state));
  const lightBlock = list.lights;
  const viewProjection = list.viewProjection;
  const runtime = getGlScene3DRuntime(state);
  runtime.activeBlendedRun = false;
  const hasPreparedForwardLights = forwardLights !== undefined && forwardLights.meshCount === list.meshCount;
  if (!hasPreparedForwardLights && hasExcessForwardLights(lights)) runtime.forwardLightSelectionGuard?.(lights);

  // Scene3D materials output linear HDR radiance, so declare the target being rendered into as 'linear':
  // the present (presentGlScene3D, or the effect pipeline's adapting present) reads that back and applies
  // the single sRGB encode. Drawing straight to the canvas (no bound target) has no present pass to
  // encode — the output reaches the canvas un-encoded (dark); the opt-in color-space guard flags it.
  if (!declareGlRenderTargetColorSpace(state, 'linear')) runtime.colorSpaceGuard?.();

  // Partition visible mesh subsets into opaque and blended draw lists. Each entry carries everything
  // needed for the draw step so the two passes can iterate independently.
  const opaqueDrawList = runtime.opaqueDrawList;
  const blendedDrawList = runtime.blendedDrawList;
  recycleDrawEntries(opaqueDrawList, runtime.opaquePool);
  recycleDrawEntries(blendedDrawList, runtime.blendedPool);
  sortKeyCounter = 0;
  sortKeyMap.clear();

  // Morph is NOT blended here, and skin palettes are NOT computed here. The app readies both before
  // prepareScene3DRender (prepareScene3DMorph in @flighthq/scene3d, prepareScene3DSkinning in @flighthq/skeleton3d)
  // so the cull sees the posed bounds instead of lagging a frame and the uploaded buffer already reflects
  // this frame's pose. A mesh that reaches this draw undeformed is a missing-prepare-call bug the opt-in
  // deform guard reports (enableGlScene3DDeformGuards); the draw does not silently self-heal it, which would
  // mask both the cull lag and the guard.
  const deformGuard = runtime.deformGuard;
  for (let m = 0; m < list.meshCount; m++) {
    const mesh = list.visibleMeshes[m];
    if (deformGuard != null) deformGuard(mesh);
    const subsets = mesh.geometry.subsets;
    const worldMatrix = getNodeWorldMatrix4(mesh) as Matrix4;

    // Compute the mesh origin's projected depth. The world origin is
    // (worldMatrix.m[12], worldMatrix.m[13], worldMatrix.m[14]). We need the Z and W components of
    // clip = VP * worldOrigin to project clip-space Z into normalized device coordinates:
    //   w_clip = vp[3]*wx + vp[7]*wy + vp[11]*wz + vp[15]
    //   z_clip = vp[2]*wx + vp[6]*wy + vp[10]*wz + vp[14]
    // Larger Z/W = farther from camera in OpenGL NDC. Read world translation from column 3.
    const wx = worldMatrix.m[12];
    const wy = worldMatrix.m[13];
    const wz = worldMatrix.m[14];
    const vp = viewProjection.m;
    const clipW = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    const clipZ = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];

    // Resolved per-object opacity (parent×self), constant across a mesh's subsets. A fading object
    // (alpha < 1) must route through the blended pass so it composites over what is behind it.
    const objectAlpha = getNode3DWorldAlpha(mesh);
    const nodeRuntime = getNode3DRuntime(mesh);
    const colorScaleBias = nodeRuntime.resolvedColorScaleBias;
    const colorMatrix = nodeRuntime.resolvedColorMatrix;

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveGlMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      const isBlended = isBlendedMaterial(resolvedMaterial) || objectAlpha < 1;
      const entry = acquireDrawEntry(isBlended ? runtime.blendedPool : runtime.opaquePool);
      entry.alpha = objectAlpha;
      entry.colorMatrix = colorMatrix;
      entry.colorScaleBias = colorScaleBias;
      entry.depth = clipZ / clipW;
      entry.lightBlock = hasPreparedForwardLights ? forwardLights.meshLightBlocks[m] : lightBlock;
      entry.mesh = mesh;
      entry.material = resolvedMaterial;
      entry.renderer = renderer;
      entry.sortKey = acquireSortKey(renderer, resolvedMaterial);
      entry.subset = subsets[s];
      entry.worldMatrix = worldMatrix;

      if (isBlended) {
        blendedDrawList.push(entry);
      } else {
        opaqueDrawList.push(entry);
      }
    }
  }

  // Sort the opaque list by material so the bind-elision below fires maximally: all subsets sharing
  // the same renderer + material become contiguous regardless of their scene-graph position.
  if (opaqueDrawList.length > 1) opaqueDrawList.sort(compareOpaqueEntriesBySortKey);

  // Pass 1: opaque + mask subsets sorted by material. No blending; depth-write on (set by bind).
  let boundMaterial: Readonly<Material> | null | undefined = undefined;
  let boundLightBlock: Readonly<Scene3DLightBlock> | null = null;
  let boundRenderer: GlMeshMaterialRenderer | null = null;
  let boundSkinned: boolean | undefined = undefined;
  let boundColorAdjustment: boolean | undefined = undefined;
  let boundColorMatrix: boolean | undefined = undefined;
  const colorAdjustmentFeatureEnabled = getGlColorAdjustmentMaterialFeature(state) !== null;

  for (let i = 0; i < opaqueDrawList.length; i++) {
    const entry = opaqueDrawList[i] as DrawEntry;
    const worldMatrix = entry.worldMatrix as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

    // A skinned run selects the HAS_SKIN program variant; split runs on it (a rigid and a skinned mesh
    // sharing a material need different programs). Set the flag before bind so ensureGl*Program folds it in.
    const skinned = isGpuSkinnedDraw(entry.mesh);
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

  // Pass 2: blended subsets sorted back-to-front (descending projected depth = farthest drawn first so nearer
  // layers composite correctly). Enable alpha blending for this pass; disable after.
  if (blendedDrawList.length > 0) {
    blendedDrawList.sort(compareBlendedEntriesDescending);

    const gl = state.gl;
    runtime.activeBlendedRun = true;
    gl.enable(gl.BLEND);

    boundMaterial = undefined;
    boundLightBlock = null;
    boundRenderer = null;
    boundSkinned = undefined;
    boundColorAdjustment = undefined;
    boundColorMatrix = undefined;

    for (let i = 0; i < blendedDrawList.length; i++) {
      const entry = blendedDrawList[i] as DrawEntry;
      const worldMatrix = entry.worldMatrix as Matrix4;
      setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

      const skinned = isGpuSkinnedDraw(entry.mesh);
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
        applyGlSurfaceBlendMode(state, entry.material);
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

    gl.disable(gl.BLEND);
  }

  // Restore both the run flag consumed by future material binds and the actual GL state. This is
  // unconditional so an empty/opaque-only scene also repairs a depth mask left by an earlier pass.
  runtime.activeBlendedRun = false;
  state.gl.depthMask(true);

  // ParticleEmitter3D nodes carry no geometry, so prepareScene3DRender never lists them among the
  // visible meshes above. Draw them here as a final transparent instanced pass so the common
  // drawGlScene3D path renders a scene's emitters without the caller also invoking the emitter pass
  // by hand. drawGlScene3DParticleEmitter3Ds stays exported for manual ordering; it early-returns (and
  // skips its own cache invalidation) when the scene has no emitters, so the mesh-only path is
  // unaffected and the invalidate below still covers it.
  drawGlScene3DParticleEmitter3Ds(state, scene, camera, lights);

  // Mesh/skybox/shadow binds above issued raw gl.useProgram/blendFunc/bindFramebuffer calls that
  // render-gl's own binding cache did not observe. Invalidate it so the next render-gl operation —
  // typically the effect-pipeline present pass or a 2D display-list draw — re-binds from scratch
  // instead of setting uniforms against a program that is no longer bound.
  invalidateGlRenderStateCache(state);
}

// Returns true when a material's alphaMode is 'blend'. All other modes (opaque, mask, and unknown
// kinds that do not carry a SurfaceMaterial trailer) go through the opaque pass. Reads alphaMode
// via structural duck-typing so any SurfaceMaterial subtype triggers the blended pass without
// requiring an import of SurfaceMaterial here.
function isBlendedMaterial(material: Readonly<Material>): boolean {
  return (material as Readonly<SurfaceMaterial>).alphaMode === 'blend';
}

// Applies a material's fixed-function blend equation at the same run boundary as its renderer bind.
// EVERY mode, Normal included, resolves through render-gl's canonical, overridable registry shared with
// the 2D renderer; enable it lazily for a state that has not opted in elsewhere. There is no per-mode
// fork: the registry's equations are premultiplied throughout and every mesh fragment tail emits
// premultiplied color (GL_MESH_FRAGMENT_TAIL), so one table composites every material correctly. A faded
// opaque/masked material uses Normal because blendMode is only meaningful when the material itself
// declares alphaMode 'blend'.
function applyGlSurfaceBlendMode(state: GlRenderState, material: Readonly<Material>): void {
  const surface = material as Readonly<SurfaceMaterial>;
  const blendMode =
    surface.alphaMode === 'blend' && typeof surface.blendMode === 'string' ? surface.blendMode : BlendMode.Normal;
  if (state.applyBlendMode === null) enableGlBlendModeSupport(state);
  state.applyBlendMode!(state, blendMode);
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

// Sort comparator for blended entries: descending projected depth so the farthest subset is drawn first.
function compareBlendedEntriesDescending(a: GlScene3DDrawEntry, b: GlScene3DDrawEntry): number {
  return b.depth - a.depth;
}

// Typed alias for cast-free access inside drawGlScene3D; GlScene3DDrawEntry uses `object` fields for
// the header to remain free of scene-gl-internal types.
interface DrawEntry {
  alpha: number;
  colorMatrix: readonly number[] | null;
  colorScaleBias: Readonly<ColorScaleBias> | null;
  depth: number;
  lightBlock: Readonly<Scene3DLightBlock>;
  material: Readonly<Material>;
  mesh: Mesh;
  renderer: GlMeshMaterialRenderer;
  sortKey: number;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}

// Takes from the per-runtime pool or allocates a fresh entry.
function acquireDrawEntry(pool: GlScene3DDrawEntry[]): GlScene3DDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}

// Returns last frame's entries to their per-state pool before the lists are rebuilt. A reverse move is
// sufficient because partitioning overwrites every semantic field; stable transparency order comes
// from the current frame's sort, not retained record position.
function recycleDrawEntries(entries: GlScene3DDrawEntry[], pool: GlScene3DDrawEntry[]): void {
  while (entries.length > 0) pool.push(entries.pop()!);
}

function createDrawEntry(): GlScene3DDrawEntry {
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

// The reused per-draw proxy handed to a renderer's draw. Owned by drawGlScene3D, valid only for the
// duration of the draw call it is passed to; renderers must not retain it.
const proxy: Scene3DRenderProxy = {
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

// Assigns a stable integer to each unique (renderer, material) pair within one frame. Entries with
// the same key sort together, so the opaque pass minimizes bind() calls regardless of scene-graph
// order. Cleared at the start of each drawGlScene3D.
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

function compareOpaqueEntriesBySortKey(a: GlScene3DDrawEntry, b: GlScene3DDrawEntry): number {
  return a.sortKey - b.sortKey;
}

const scratchNormalMatrix = createMatrix3() as Matrix3;
