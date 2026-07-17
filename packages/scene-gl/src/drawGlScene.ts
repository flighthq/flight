import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { invalidateGlRenderStateCache } from '@flighthq/render-gl';
import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshSubset,
  SceneLights,
  SceneNode,
  SceneRenderProxy,
  SurfaceMaterial,
} from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { resolveGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { drawGlSceneParticleEmitters } from './glParticleEmitter3D';
import type { GlSceneDrawEntry } from './glSceneRuntime';
import { getGlSceneRuntime } from './glSceneRuntime';

// Draws a prepared 3D scene on the Gl backend. The app runs prepareSceneRender(state, scene, camera,
// lights) first (resolving world matrices, the camera view-projection, frustum culling, and the
// packed light block into the per-state SceneRenderList); drawGlScene retrieves that same cached list
// (prepareSceneRender is idempotent per-state scratch) and, for each visible Mesh, draws each of its
// geometry subsets with the subset's resolved material's registered mesh-material renderer.
//
// The draw is two-phased for correct alpha compositing:
//   Pass 1 (opaque): every subset whose material alphaMode is 'opaque' or 'mask', in scene-graph
//     order. Depth writes are on. No blending.
//   Pass 2 (blended): every subset whose material alphaMode is 'blend', sorted back-to-front by the
//     mesh's world-space Z in view space (the mesh origin's projected depth). GL blending is enabled
//     with SRC_ALPHA / ONE_MINUS_SRC_ALPHA for this pass and disabled after.
//
// Subsets sharing the same resolved renderer + material are drawn under a single bind (the seam's
// "contiguous run" contract): bind uploads the shared camera + light + material state once, then draw
// issues the per-subset indexed draw. A subset whose material resolves to no renderer (and no
// DefaultMaterialKind fallback) is skipped — no built-in fallback. Depth/cull state is owned by the
// material renderer's bind; the surrounding rgba16f + MSAA + depth scene target is the effect
// pipeline's (beginGlRenderEffectPipeline), not drawGlScene's.
//
// Draw-entry pools and per-frame draw lists are held on the GlSceneRuntime so two independent render
// states never share allocation (module-level singletons would interleave if two states drew in the
// same tick, even though JS is single-threaded today).
export function drawGlScene(
  state: GlRenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): void {
  const list = prepareSceneRender(state, scene, camera, lights);
  const lightBlock = list.lights;
  const viewProjection = list.viewProjection;
  const runtime = getGlSceneRuntime(state);

  // Partition visible mesh subsets into opaque and blended draw lists. Each entry carries everything
  // needed for the draw step so the two passes can iterate independently.
  const opaqueDrawList = runtime.opaqueDrawList;
  const blendedDrawList = runtime.blendedDrawList;
  opaqueDrawList.length = 0;
  blendedDrawList.length = 0;

  for (let m = 0; m < list.meshCount; m++) {
    const mesh = list.visibleMeshes[m];
    const subsets = mesh.geometry.subsets;
    const worldMatrix = getNodeWorldTransformMatrix4(mesh) as Matrix4;

    // Compute the mesh origin's clip-space W (a proxy for view-depth). The world origin is
    // (worldMatrix.m[12], worldMatrix.m[13], worldMatrix.m[14]). We only need the W component of
    // clip = VP * worldOrigin, which is the dot of VP row-3 with the homogeneous world position:
    //   w_clip = vp[3]*wx + vp[7]*wy + vp[11]*wz + vp[15]
    // Larger W = farther from camera (in standard OpenGL NDC). Read world translation from column 3.
    const wx = worldMatrix.m[12];
    const wy = worldMatrix.m[13];
    const wz = worldMatrix.m[14];
    const vp = viewProjection.m;
    const clipW = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];

    for (let s = 0; s < subsets.length; s++) {
      const material = resolveSubsetMaterial(mesh, s);
      const renderer = resolveGlMeshMaterialRenderer(state, material);
      if (renderer === null) continue;

      const resolvedMaterial = material ?? DEFAULT_MATERIAL;
      const isBlended = isBlendedMaterial(resolvedMaterial);
      const entry = isBlended ? acquireBlendedEntry(runtime.blendedPool) : acquireOpaqueEntry(runtime.opaquePool);
      entry.clipW = clipW;
      entry.mesh = mesh;
      entry.material = resolvedMaterial;
      entry.normalMatrix = worldMatrix; // placeholder; filled per-draw from the mesh
      entry.renderer = renderer;
      entry.subset = subsets[s];
      entry.worldMatrix = worldMatrix;

      if (isBlended) {
        blendedDrawList.push(entry);
      } else {
        opaqueDrawList.push(entry);
      }
    }
  }

  // Pass 1: opaque + mask subsets in scene-graph order. No blending; depth-write on (set by bind).
  let boundMaterial: Readonly<Material> | null | undefined = undefined;
  let boundRenderer: GlMeshMaterialRenderer | null = null;

  for (let i = 0; i < opaqueDrawList.length; i++) {
    const entry = opaqueDrawList[i] as DrawEntry;
    const worldMatrix = entry.worldMatrix as Matrix4;
    setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

    if (entry.renderer !== boundRenderer || entry.material !== boundMaterial) {
      entry.renderer.bind(state, entry.material, lightBlock, camera);
      boundRenderer = entry.renderer;
      boundMaterial = entry.material;
    }

    proxy.material = entry.material;
    proxy.normalMatrix = scratchNormalMatrix;
    proxy.subset = entry.subset;
    proxy.worldMatrix = worldMatrix;
    entry.renderer.draw(state, proxy, entry.mesh.geometry);
  }

  // Pass 2: blended subsets sorted back-to-front (descending clipW = farthest drawn first so nearer
  // layers composite correctly). Enable alpha blending for this pass; disable after.
  if (blendedDrawList.length > 0) {
    blendedDrawList.sort(compareBlendedEntriesDescending);

    const gl = state.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    boundMaterial = undefined;
    boundRenderer = null;

    for (let i = 0; i < blendedDrawList.length; i++) {
      const entry = blendedDrawList[i] as DrawEntry;
      const worldMatrix = entry.worldMatrix as Matrix4;
      setMatrix3NormalFromMatrix4(scratchNormalMatrix, worldMatrix);

      if (entry.renderer !== boundRenderer || entry.material !== boundMaterial) {
        entry.renderer.bind(state, entry.material, lightBlock, camera);
        boundRenderer = entry.renderer;
        boundMaterial = entry.material;
      }

      proxy.material = entry.material;
      proxy.normalMatrix = scratchNormalMatrix;
      proxy.subset = entry.subset;
      proxy.worldMatrix = worldMatrix;
      entry.renderer.draw(state, proxy, entry.mesh.geometry);
    }

    gl.disable(gl.BLEND);
  }

  // ParticleEmitter3D nodes carry no geometry, so prepareSceneRender never lists them among the
  // visible meshes above. Draw them here as a final transparent instanced pass so the common
  // drawGlScene path renders a scene's emitters without the caller also invoking the emitter pass
  // by hand. drawGlSceneParticleEmitters stays exported for manual ordering; it early-returns (and
  // skips its own cache invalidation) when the scene has no emitters, so the mesh-only path is
  // unaffected and the invalidate below still covers it.
  drawGlSceneParticleEmitters(state, scene, camera, lights);

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

// Resolves the Material for a subset index: the positional materials[i] entry, or null when the
// slot is absent/null (the registry then falls back to DefaultMaterialKind, or skips the subset).
function resolveSubsetMaterial(mesh: Readonly<Mesh>, subsetIndex: number): Readonly<Material> | null {
  const materials = mesh.materials;
  return subsetIndex < materials.length ? materials[subsetIndex] : null;
}

// Sort comparator for blended entries: descending clipW so farthest (largest W) is drawn first.
function compareBlendedEntriesDescending(a: GlSceneDrawEntry, b: GlSceneDrawEntry): number {
  return b.clipW - a.clipW;
}

// Typed alias for cast-free access inside drawGlScene; GlSceneDrawEntry uses `object` fields for
// the header to remain free of scene-gl-internal types.
interface DrawEntry {
  clipW: number;
  material: Readonly<Material>;
  mesh: Mesh;
  normalMatrix: Readonly<Matrix4>;
  renderer: GlMeshMaterialRenderer;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}

// Pool helpers: take from the per-runtime pool or allocate a fresh entry.
function acquireOpaqueEntry(pool: GlSceneDrawEntry[]): GlSceneDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}

function acquireBlendedEntry(pool: GlSceneDrawEntry[]): GlSceneDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}

function createDrawEntry(): GlSceneDrawEntry {
  return {
    clipW: 0,
    material: DEFAULT_MATERIAL,
    mesh: null!,
    normalMatrix: createMatrix4(),
    renderer: null!,
    subset: { indexCount: 0, indexOffset: 0 },
    worldMatrix: createMatrix4(),
  };
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
