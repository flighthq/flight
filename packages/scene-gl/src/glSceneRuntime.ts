import { createGlSkinPaletteTexture, destroyGlRenderTarget, destroyGlSkinPaletteTexture } from '@flighthq/render-gl';
import type { GlSceneRuntime, GlRenderState, GlRenderStateRuntime, GlSkinPaletteTexture } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { destroyGlBakePrograms } from './glEnvironmentIblBake';
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
export function destroyGlSceneRuntime(state: GlRenderState): void {
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
  destroyGlBakePrograms(state);

  if (scene.shadowTarget !== null) {
    destroyGlRenderTarget(state, scene.shadowTarget);
    scene.shadowTarget = null;
  }
  scene.shadow = null;

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
export function ensureGlSkinPalette(state: GlRenderState): GlSkinPaletteTexture {
  const scene = getGlSceneRuntime(state);
  let palette = scene.skinPalette;
  if (palette === null) {
    palette = createGlSkinPaletteTexture(state.gl);
    scene.skinPalette = palette;
  }
  return palette;
}

// Resolves scene-gl's private runtime for a GlRenderState, allocating it (and wiring the header
// runtime slots to its registry and upload cache) on first use. Mutable by design: the draw path
// writes the caches every frame.
export function getGlSceneRuntime(state: GlRenderState): GlSceneRuntime {
  const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    scene = {
      activeMeshProgram: null,
      activeSkinnedRun: false,
      blendedDrawList: [],
      blendedPool: [],
      environmentSourceCube: null,
      ibl: null,
      iblBakeFramebuffer: null,
      materialRegistry: new Map(),
      modifierSnippetRegistry: null,
      opaqueDrawList: [],
      opaquePool: [],
      programCache: new Map(),
      shadow: null,
      shadowTarget: null,
      skinPalette: null,
      time: 0,
      uploadCache: new WeakMap(),
    };
    sceneRuntimes.set(state, scene);
    // Surface the registry + upload cache through the header's opaque runtime slots so other code
    // (and a future destroy path) can find them by name without importing scene-gl internals.
    stateRuntime.sceneMeshMaterialRegistry = scene.materialRegistry;
    stateRuntime.sceneMeshUploadCache = scene.uploadCache as unknown as WeakMap<object, object>;
  }
  return scene;
}

const sceneRuntimes = new WeakMap<GlRenderState, GlSceneRuntime>();
