import { createGlSkinPaletteTexture, destroyGlRenderTarget, destroyGlSkinPaletteTexture } from '@flighthq/render-gl';
import type { ModifierRegistry } from '@flighthq/shading';
import type {
  GlMeshMaterialRenderer,
  GlRenderState,
  GlRenderStateRuntime,
  GlRenderTarget,
  GlSkinPaletteTexture,
  Kind,
  Matrix4,
  MeshGeometry,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { destroyGlBakePrograms } from './glEnvironmentIblBake';
import type { GlMeshProgram } from './glMeshProgram';

// The active directional shadow for this state, set by drawGlSceneShadowMap and read by the lit bind
// (bindGlMeshLightBlock) so every lit family samples the same shadow map. Null = no shadow this frame.
export interface GlSceneShadow {
  matrix: Matrix4; // light view-projection (world -> shadow clip)
  texture: WebGLTexture; // the sampleable depth shadow map
}

// The baked image-based-lighting set for this state, produced by bakeEnvironmentIbl and read by the
// PBR ambient bind so every PBR draw samples the same environment. Null = no IBL this frame (the PBR
// ambient falls back to the flat ambient term). The three GPU textures are the split-sum approximation:
// a diffuse irradiance cubemap, a roughness-mipped prefiltered specular cubemap, and the 2D BRDF
// integration LUT. `intensity` scales the environment's contribution (Environment.intensity).
export interface GlSceneIbl {
  brdfLut: WebGLTexture;
  intensity: number;
  irradianceCube: WebGLTexture;
  prefilteredCube: WebGLTexture;
  prefilteredMipCount: number;
}

// A per-subset draw record held in the two-pass draw lists. Pooled on GlSceneRuntime to avoid
// per-frame allocation. Fields are set at partition time and consumed during the opaque/blended
// passes; the pool is never exposed outside drawGlScene.
export interface GlSceneDrawEntry {
  alpha: number;
  clipW: number;
  material: object;
  mesh: object;
  normalMatrix: object;
  renderer: object;
  subset: object;
  worldMatrix: object;
}

// scene-gl's per-GlRenderState private state: the 3D mesh-material registry, the shared mesh-material
// program cache (keyed by family + define key), and the per-state geometry GPU-upload cache. These
// are scene-gl-owned, distinct from the 2D renderer's materialRendererMap/textureCache — a material
// kind is either 2D or 3D, never both. The registry and upload cache are surfaced through the
// header's GlRenderStateRuntime.sceneMeshMaterialRegistry / sceneMeshUploadCache slots (kept opaque
// there), and the program cache lives only here (scene-gl never needs to name it in the header).
// `activeMeshProgram` is the bind()→draw() handoff: bind selects a family's program and stores it
// here; draw reads it back. The draw-entry pools (`blendedPool`/`opaquePool`) and the per-frame
// draw lists (`blendedDrawList`/`opaqueDrawList`) live here so two independent render states never
// share allocation. `modifierSnippetRegistry` is the ShadedMaterial GL modifier-snippet registry
// (backend-side GLSL emitters keyed by ModifierKind, opt-in via registerGlModifierSnippet); it stays
// `null` — allocating nothing and keeping @flighthq/shading's registry off a PBR/classic-only
// bundle's path — until the first snippet is registered.
// `time` is the per-frame `time` uniform value animated modifiers scroll by (set by setGlSceneTime).
// One GlSceneRuntime is created lazily per state by getGlSceneRuntime.
export interface GlSceneRuntime {
  activeMeshProgram: GlMeshProgram | null;
  // Whether the draw run currently being bound is skinned. drawGlScene sets it before each bind()
  // so ensureGl*Program folds HAS_SKIN into the selected program variant without every material
  // renderer threading a skin flag — skinned-ness is a geometry property orthogonal to the material.
  activeSkinnedRun: boolean;
  blendedDrawList: GlSceneDrawEntry[];
  blendedPool: GlSceneDrawEntry[];
  // Opt-in color-space guard, null until enableGlSceneColorSpaceGuards installs it. drawGlScene reaches
  // it only through this slot (so the base path references no message or @flighthq/log), calling it when
  // the scene is drawn straight to the canvas with no target to declare 'linear' on — the output would
  // then reach the canvas un-encoded (dark).
  colorSpaceGuard?: (() => void) | null;
  // Opt-in custom-shader guard, null until enableGlSceneCustomShaderGuards installs it. The custom-shader
  // material renderer reaches it only through this slot when it binds a program (so the base path
  // references no message or @flighthq/log). It introspects the bound program's built-in uniform types
  // and warns once per shader when one mismatches what the renderer uploads — most importantly
  // u_normalMatrix, which the renderer uploads as mat3, so a shader declaring it mat4 draws nothing.
  customShaderGuard?: ((state: GlRenderState, program: WebGLProgram, shaderKey: string) => void) | null;
  environmentSourceCube: WebGLTexture | null;
  ibl: GlSceneIbl | null;
  iblBakeFramebuffer: WebGLFramebuffer | null;
  materialRegistry: Map<Kind, GlMeshMaterialRenderer>;
  modifierSnippetRegistry: ModifierRegistry | null;
  opaqueDrawList: GlSceneDrawEntry[];
  opaquePool: GlSceneDrawEntry[];
  programCache: Map<string, GlMeshProgram>;
  shadow: GlSceneShadow | null;
  shadowTarget: GlRenderTarget | null;
  // The per-state GPU skin bone-palette data texture (RGBA32F), created lazily by ensureGlSkinPalette on
  // the first skinned draw and grown to the largest skeleton seen. Every skinned mesh reuses this one
  // texture: the palette is re-uploaded per draw, so no per-mesh texture is retained. null until first use.
  skinPalette: GlSkinPaletteTexture | null;
  time: number;
  uploadCache: WeakMap<MeshGeometry, GlMeshUpload>;
}

// The GPU upload of one MeshGeometry for one GlRenderState: a VAO binding the interleaved vertex
// buffer and index buffer, the element type/count for indexed draws, and the geometry `version`
// the buffers were uploaded at (so a bumped version forces a re-upload). Cached in the upload cache
// keyed by the geometry entity, the per-state parallel of MeshGeometryRuntime.webglData.
export interface GlMeshUpload {
  indexBuffer: WebGLBuffer | null;
  indexCount: number;
  indexType: number;
  // Set when this upload holds the STATIC bind pose of a GPU-skinned mesh (position/normal restored from
  // the skin bind pose, not the per-frame CPU-posed geometry.vertices). While true the buffer is reused
  // across frames even as geometry.version bumps — the GPU deforms the fixed bind vertices via the joint
  // palette each frame, so re-uploading the CPU pose would double-skin. Absent/false = version-tracked.
  skinBindUploaded?: boolean;
  vao: WebGLVertexArrayObject;
  version: number;
  vertexBuffer: WebGLBuffer;
}

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
