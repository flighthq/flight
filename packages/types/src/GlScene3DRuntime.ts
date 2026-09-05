import type { GlMeshProgram } from './GlMeshProgram';
import type { GlPbrTransmissionSceneColor } from './GlPbrTransmissionSceneColor';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget } from './GlRenderTarget';
import type { GlSkinPaletteTexture } from './GlSkinPaletteTexture';
import type { Matrix4 } from './Matrix4';
import type { Mesh } from './Mesh';
import type { MeshGeometry } from './MeshGeometry';
import type { PbrExtension } from './PbrExtension';
import type { Scene3DLightBlock } from './Scene3DLightBlock';
import type { Scene3DLightsLike } from './Scene3DLights';
import type { TextureColorSpace } from './Texture';

// The directional shadow resource for this state, set by drawGlScene3DShadowMap and read by the lit bind
// (bindGlMeshLightBlock) so every lit family samples the same shadow map. `enabled` is the per-frame gate;
// a disabled object may retain its texture for the next shadow pass. Null = no shadow resource yet.
export interface GlScene3DShadow {
  enabled: boolean;
  matrix: Matrix4; // light view-projection (world -> shadow clip)
  normalBiasWorld: number;
  pcfRadius: number;
  shadowBias: number;
  texture: WebGLTexture; // the sampleable depth shadow map
}

// The baked image-based-lighting set for this state, produced by bakeGlEnvironmentIbl and read by the
// PBR ambient bind so every PBR draw samples the same environment. Null = no IBL this frame (the PBR
// ambient falls back to the flat ambient term). The three GPU textures are the split-sum approximation:
// a diffuse irradiance cubemap, a roughness-mipped prefiltered specular cubemap, and the 2D BRDF
// integration LUT. `intensity` scales the environment's contribution (Environment.intensity).
export interface GlScene3DIbl {
  brdfLut: WebGLTexture;
  intensity: number;
  irradianceCube: WebGLTexture;
  prefilteredCube: WebGLTexture;
  prefilteredMipCount: number;
}

// A per-subset draw record held in the two-pass draw lists. Pooled on GlScene3DRuntime to avoid
// per-frame allocation. Fields are set at partition time and consumed during the opaque/blended
// passes; the pool is never exposed outside drawGlScene3D.
export interface GlScene3DDrawEntry {
  alpha: number;
  colorMatrix: object | null;
  colorScaleBias: object | null;
  depth: number;
  lightBlock: Scene3DLightBlock;
  material: object;
  mesh: object;
  renderer: object;
  sortKey: number;
  subset: object;
  worldMatrix: object;
}

// scene-gl's per-GlRenderState private state: the mesh-material program cache (keyed by family +
// define key) and a reference to the context-owned geometry GPU-upload cache. These
// are scene-gl-owned, distinct from the 2D renderer's material-renderer table/texture cache — a material
// kind is either 2D or 3D, never both. Dispatch policy lives in
// GlRenderStateRuntime.registries.meshMaterialRenderers; the upload cache is surfaced through the
// header's sceneMeshUploadCache slot, and the program cache lives only here.
// `activeMeshProgram` is the bind()→draw() handoff: bind selects a family's program and stores it
// here; draw reads it back. The draw-entry pools (`blendedPool`/`opaquePool`) and the per-frame
// draw lists (`blendedDrawList`/`opaqueDrawList`) live here so two independent render states never
// share allocation. ShadedMaterial modifier-snippet policy lives in
// GlRenderStateRuntime.registries.modifierSnippets; this runtime retains only compiled programs and
// per-frame/resource state.
// `time` is the per-frame `time` uniform value animated modifiers scroll by (set by setGlScene3DTime).
// One GlScene3DRuntime is created lazily per state by getGlScene3DRuntime.
export interface GlScene3DRuntime {
  // Whether the draw run currently being bound belongs to the blended pass. Every material-family
  // bind reads this through beginGlMeshDraw so depth writes stay disabled across run changes.
  activeBlendedRun: boolean;
  // Whether the draw run currently being bound carries resolved color-adjustment data and the
  // tree-shakable feature is registered. Material-family compilers fold this into their program key.
  activeColorAdjustmentRun: boolean;
  activeColorMatrixRun: boolean;
  activeInstancedRun: boolean;
  activeMeshProgram: GlMeshProgram | null;
  // Whether the draw run currently being bound is skinned. drawGlScene3D sets it before each bind()
  // so ensureGl*Program folds HAS_SKIN into the selected program variant without every material
  // renderer threading a skin flag — skinned-ness is a geometry property orthogonal to the material.
  activeSkinnedRun: boolean;
  blendedDrawList: GlScene3DDrawEntry[];
  blendedPool: GlScene3DDrawEntry[];
  // Opt-in color-space guard, null until enableGlScene3DColorSpaceGuards installs it. drawGlScene3D reaches
  // it only through this slot (so the base path references no message or @flighthq/log), calling it when
  // the scene is drawn straight to the canvas with no target to declare 'linear' on — the output would
  // then reach the canvas un-encoded (dark).
  colorSpaceGuard?: (() => void) | null;
  // Opt-in custom-shader guard, null until enableGlScene3DCustomShaderGuards installs it. The custom-shader
  // material renderer reaches it only through this slot when it binds a program (so the base path
  // references no message or @flighthq/log). It introspects the bound program's built-in uniform types
  // and warns once per shader when one mismatches what the renderer uploads — most importantly
  // u_normalMatrix, which the renderer uploads as mat3, so a shader declaring it mat4 draws nothing.
  customShaderGuard?: ((state: GlRenderState, program: WebGLProgram, shaderKey: string) => void) | null;
  // Opt-in deform guard, null until enableGlScene3DDeformGuards installs it. drawGlScene3D reaches it only
  // through this slot (so the base path references no message or @flighthq/log), calling it once per
  // visible mesh so it can warn when a morphed or GPU-skinned mesh reaches the draw without its deform
  // pass having run this frame (prepareScene3DMorph / prepareScene3DSkinning) — the mesh would draw at bind
  // pose or collapse to the origin, a silent-black footgun the missing call is the fix for.
  deformGuard?: ((mesh: Mesh) => void) | null;
  environmentSourceCube: WebGLTexture | null;
  environmentSourceCubeColorSpace: TextureColorSpace;
  ibl: GlScene3DIbl | null;
  iblBakeFramebuffer: WebGLFramebuffer | null;
  // Opt-in forward-light selection guard, null until enableGlScene3DForwardLightSelectionGuards installs
  // it. drawGlScene3D reaches it only when excess punctual lights would be silently input-truncated and
  // no prepared per-object selection list was supplied.
  forwardLightSelectionGuard?: ((lights: Readonly<Scene3DLightsLike>) => void) | null;
  opaqueDrawList: GlScene3DDrawEntry[];
  opaquePool: GlScene3DDrawEntry[];
  pbrExtensionGuard?: ((extensions: readonly PbrExtension[]) => void) | null;
  pbrTransmissionSceneColor: GlPbrTransmissionSceneColor | null;
  programCache: Map<string, GlMeshProgram>;
  shadow: GlScene3DShadow | null;
  shadowTarget: GlRenderTarget | null;
  // The per-state GPU skin bone-palette data texture (RGBA32F), created lazily by ensureGlSkinPalette on
  // the first skinned draw and grown to the largest skeleton seen. Every skinned mesh reuses this one
  // texture: the palette is re-uploaded per draw, so no per-mesh texture is retained. null until first use.
  instancePalette: GlSkinPaletteTexture | null;
  // The per-instance colour palette: one RGBA32F texel per instance, linear, uploaded beside the matrix
  // palette whenever an instanced run draws. Separate from instancePalette rather than widening it,
  // because that palette's four-texels-per-record stride is shared with the skin palette upload.
  instanceColorPalette: GlSkinPaletteTexture | null;
  skinPalette: GlSkinPaletteTexture | null;
  // The normal palette's own data texture, separate from the pose palette rather than interleaved with
  // it: a 3x3 padded to three vec4 columns uploads directly this way, with no per-frame repacking.
  skinNormalPalette: GlSkinPaletteTexture | null;
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
  // Effective WebGL primitive enum for MeshGeometry.topology. Stored with the upload so every
  // consumer (forward, shadow, future velocity passes) issues the same primitive assembly.
  primitiveMode: number;
  // Set when this upload holds the STATIC bind pose of a GPU-skinned mesh (position/normal restored from
  // the skin bind pose, not the per-frame CPU-posed geometry.vertices). While true the buffer is reused
  // across frames even as geometry.version bumps — the GPU deforms the fixed bind vertices via the joint
  // palette each frame, so re-uploading the CPU pose would double-skin. Absent/false = version-tracked.
  skinBindUploaded?: boolean;
  vao: WebGLVertexArrayObject;
  version: number;
  vertexBuffer: WebGLBuffer;
}
