import {
  createGlSkinPaletteTexture,
  destroyGlRenderTarget,
  destroyGlSkinPaletteTexture,
} from '@flighthq/render-gl/contract';
import type {
  GlScene3DRuntime,
  GlMeshUpload,
  GlRenderState,
  GlRenderStateRuntime,
  GlSkinPaletteTexture,
  MeshGeometry,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { destroyGlEnvironmentIblBakePrograms } from './glEnvironmentIblBake';
// Frees every state-scoped GPU resource scene-gl created for `state`: all cached mesh-material and PBR
// programs, the IBL set (irradiance / prefiltered / BRDF textures + the bake framebuffer), the source
// environment cubemap, the IBL bake shader programs, and the directional shadow map (its depth texture
// is owned by shadowTarget, so destroying the target frees it — the shadow alias is cleared without a
// double delete). The runtime object itself is GC-managed and left cleared, safe to repopulate lazily.
//
// Per-geometry mesh and wireframe uploads are NOT reached here: their caches are keyed by geometry in
// WeakMaps that cannot be iterated. Free those with destroyGlMeshUpload / destroyGlWireframeUpload when
// a geometry is torn down, or let GL context loss reclaim them. A no-op when no scene runtime exists.
// Deleting an already-deleted GL object is a silent no-op, so this is safe to call more than once.
export function destroyGlScene3DRuntime(state: GlRenderState): void {
  const scene = sceneRuntimes.get(state);
  if (scene === undefined) return;
  const gl = state.gl;

  for (const program of scene.programCache.values()) gl.deleteProgram(program.program);
  scene.programCache.clear();
  scene.activeMeshProgram = null;

  if (scene.ibl !== null) {
    gl.deleteTexture(scene.ibl.brdfLut);
    gl.deleteTexture(scene.ibl.irradianceCube);
    gl.deleteTexture(scene.ibl.prefilteredCube);
    scene.ibl = null;
  }
  if (scene.iblBakeFramebuffer !== null) {
    gl.deleteFramebuffer(scene.iblBakeFramebuffer);
    scene.iblBakeFramebuffer = null;
  }
  if (scene.environmentSourceCube !== null) {
    gl.deleteTexture(scene.environmentSourceCube);
    scene.environmentSourceCube = null;
  }
  destroyGlEnvironmentIblBakePrograms(state);

  if (scene.shadowTarget !== null) {
    destroyGlRenderTarget(state, scene.shadowTarget);
    scene.shadowTarget = null;
  }
  scene.shadow = null;

  if (scene.instancePalette !== null) {
    destroyGlSkinPaletteTexture(gl, scene.instancePalette);
    scene.instancePalette = null;
  }
  if (scene.instanceColorPalette !== null) {
    destroyGlSkinPaletteTexture(gl, scene.instanceColorPalette);
    scene.instanceColorPalette = null;
  }
  if (scene.skinNormalPalette !== null) {
    destroyGlSkinPaletteTexture(gl, scene.skinNormalPalette);
    scene.skinNormalPalette = null;
  }
  if (scene.skinPalette !== null) {
    destroyGlSkinPaletteTexture(gl, scene.skinPalette);
    scene.skinPalette = null;
  }

  scene.blendedDrawList.length = 0;
  scene.opaqueDrawList.length = 0;
  scene.blendedPool.length = 0;
  scene.opaquePool.length = 0;
}

// Resolves the per-state GPU skin bone-palette data texture, creating it lazily on the first skinned
// draw. Every skinned mesh shares this one RGBA32F texture — the palette is re-uploaded per draw
// (uploadGlSkinPaletteTexture grows it to the largest skeleton seen), so no per-mesh texture is retained.
// The NORMAL palette's data texture, created on first skinned draw and grown by the shared upload.
// Separate from the pose palette so each uploads its own array directly; see GlScene3DRuntime.
export function ensureGlInstanceColorPalette(state: GlRenderState): GlSkinPaletteTexture {
  const scene = getGlScene3DRuntime(state);
  let palette = scene.instanceColorPalette;
  if (palette === null) {
    palette = createGlSkinPaletteTexture(state.gl);
    scene.instanceColorPalette = palette;
  }
  return palette;
}

export function ensureGlInstancePalette(state: GlRenderState): GlSkinPaletteTexture {
  const scene = getGlScene3DRuntime(state);
  let palette = scene.instancePalette;
  if (palette === null) {
    palette = createGlSkinPaletteTexture(state.gl);
    scene.instancePalette = palette;
  }
  return palette;
}

export function ensureGlSkinNormalPalette(state: GlRenderState): GlSkinPaletteTexture {
  const scene = getGlScene3DRuntime(state);
  let palette = scene.skinNormalPalette;
  if (palette === null) {
    palette = createGlSkinPaletteTexture(state.gl);
    scene.skinNormalPalette = palette;
  }
  return palette;
}

export function ensureGlSkinPalette(state: GlRenderState): GlSkinPaletteTexture {
  const scene = getGlScene3DRuntime(state);
  let palette = scene.skinPalette;
  if (palette === null) {
    palette = createGlSkinPaletteTexture(state.gl);
    scene.skinPalette = palette;
  }
  return palette;
}

// Resolves scene-gl's private runtime for a GlRenderState, allocating it and wiring its context-tier
// upload cache on first use. Mutable by design: the draw path writes the caches every frame. Material
// dispatch policy lives on the render state's persistent registry aggregate, not in this resource tier.
export function getGlScene3DRuntime(state: GlRenderState): GlScene3DRuntime {
  const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    // The runtime accessor routes this slot to the context tier. A derived state must retain the map
    // already installed by its primary instead of replacing it with a state-local upload identity.
    let uploadCache = stateRuntime.context.sceneMeshUploadCache as
      | WeakMap<MeshGeometry, GlMeshUpload>
      | null
      | undefined;
    if (uploadCache == null) {
      uploadCache = new WeakMap();
      stateRuntime.context.sceneMeshUploadCache = uploadCache as unknown as WeakMap<object, object>;
    }
    scene = {
      activeBlendedRun: false,
      activeColorAdjustmentRun: false,
      activeColorMatrixRun: false,
      activeInstancedRun: false,
      activeMeshProgram: null,
      activeSkinnedRun: false,
      blendedDrawList: [],
      blendedPool: [],
      environmentSourceCube: null,
      environmentSourceCubeColorSpace: 'linear',
      ibl: null,
      iblBakeFramebuffer: null,
      opaqueDrawList: [],
      opaquePool: [],
      pbrExtensionGuard: null,
      pbrTransmissionSceneColor: null,
      programCache: new Map(),
      shadow: null,
      shadowTarget: null,
      instanceColorPalette: null,
      instancePalette: null,
      skinNormalPalette: null,
      skinPalette: null,
      time: 0,
      uploadCache,
    };
    sceneRuntimes.set(state, scene);
  }
  return scene;
}

const sceneRuntimes = new WeakMap<GlRenderState, GlScene3DRuntime>();
