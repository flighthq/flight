import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Kind } from './Entity';
import type { GlMaterialRenderer } from './GlMaterialRenderer';
import type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer';
import type { GlBitmapShader, GlShaderLocations } from './GlShaderLocations';
import type { Material } from './Material';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState, RenderStateRuntime } from './RenderState';

export interface GlRenderState extends RenderState {
  applyBlendMode: ((state: GlRenderState, blendMode: BlendMode | null) => void) | null;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
}

// A WebGL fixed-function realization of a blend-mode intent, registered per render state against a
// BlendMode string. `src`/`dst` are the premultiplied-alpha blendFunc factors and `equation` is the
// blend equation (defaulting to additive FUNC_ADD when omitted). The factor/equation members are
// WebGL constant names resolved against the live context, keeping the descriptor plain data.
export interface GlBlendRealization {
  readonly src: GlBlendFactor;
  readonly dst: GlBlendFactor;
  readonly equation?: GlBlendEquation;
}

export type GlBlendFactor = 'DST_COLOR' | 'ONE' | 'ONE_MINUS_SRC_ALPHA' | 'ONE_MINUS_SRC_COLOR' | 'ZERO';

export type GlBlendEquation = 'FUNC_ADD' | 'FUNC_REVERSE_SUBTRACT' | 'MAX' | 'MIN';

// Package-private GPU state for a GlRenderState entity. Lives in the runtime tier (not on the
// entity) so the public GlRenderState surface stays minimal; the render path resolves it each
// frame via getGlRenderStateRuntime. Defined in @flighthq/types — the header layer — so
// out-of-package custom renderers can reach the same state.
export interface GlRenderStateRuntime extends RenderStateRuntime {
  // Active GPU bindings tracked to avoid redundant state changes. Internal — formerly public on the
  // GlRenderState entity.
  currentBlendMode: BlendMode | null;
  currentProgram: WebGLProgram | null;
  currentTexture: WebGLTexture | null;

  // Open per-state registry mapping a BlendMode to its fixed-function realization. Null until the
  // first registration (registerGlBlendMode / registerDefaultGlBlendModes), so a state that never
  // enables blend support carries no map. Last-write-wins, so a caller can override a built-in mode
  // or add a vendor-prefixed one.
  glBlendModeRegistry?: Map<BlendMode, GlBlendRealization> | null;

  defaultBitmapShader: GlBitmapShader;
  particleShader?: GlParticleShader;
  particleCornerBuffer?: WebGLBuffer;
  particleInstanceBuffer?: WebGLBuffer;
  particleInstanceData?: Float32Array;
  quadBatchShader?: GlQuadBatchShader;
  quadBatchCornerBuffer?: WebGLBuffer;
  colorTransformInstancedShader?: GlColorTransformInstancedShader;
  uniformColorTransformShader?: GlUniformColorTransformShader;
  materialRendererMap?: Map<Kind, GlMaterialRenderer>;
  // 3D scene mesh-material seam, owned by scene-gl (filled lazily by registerGlMeshMaterialRenderer).
  // The per-material-kind 3D draw behavior registry, kept separate from the 2D materialRendererMap
  // because a material kind is either 2D or 3D, never both. sceneMeshUploadCache is the per-state
  // cache of lazily uploaded MeshGeometry GPU data, keyed by the geometry entity (parallel to
  // MeshGeometryRuntime.webglData; scene-gl owns and casts the concrete value shape). Both stay null
  // until the first 3D registration / mesh draw on this render state.
  sceneMeshMaterialRegistry?: Map<Kind, GlMeshMaterialRenderer> | null;
  sceneMeshUploadCache?: WeakMap<object, object> | null;
  // Per-material-kind bitmap shader for the immediate (display-object) path. resolveGlShader
  // looks a node's shader up here by its material kind — the render path has no color-transform (or
  // any material-specific) knowledge; the material's shader and its registration own that.
  materialBitmapShaderMap?: Map<Kind, GlBitmapShader>;
  // Optional per-node shader-binding resolver. Installed by setGlShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webglShaderBindingResolver?: (renderProxy: RenderProxy2D) => GlBitmapShader | undefined;
  spriteBatchBlendMode: BlendMode | null;
  // The active sprite-batch material (flush key, compared by reference) and its resolved
  // renderer + per-instance float stride. spriteBatchMaterialData/Buffer hold the active
  // material's per-instance attributes, parallel to the base spriteBatchInstanceData.
  spriteBatchMaterial: Material | null;
  spriteBatchMaterialRenderer: GlMaterialRenderer | null;
  spriteBatchMaterialFloats: number;
  spriteBatchMaterialData: Float32Array;
  spriteBatchMaterialBuffer: WebGLBuffer | null;
  spriteBatchCount: number;
  spriteBatchInstanceBuffer: WebGLBuffer | null;
  spriteBatchInstanceData: Float32Array;
  spriteBatchTexture: CanvasImageSource | null;
  // Color-transform fold state for the active sprite batch. Orthogonal to the material and never a
  // flush key, so tinted and untinted nodes with the same texture+blend share one batch. Mode 0 =
  // no tint (lean base shader), 1 = one uniform tint for the whole batch (u_ctMult/u_ctOff), 2 =
  // per-instance tints (a_ctMult/a_ctOff). A batch starts at 0, rises to 1 on the first tint, and
  // promotes to 2 — back-filling already-written instances with the prior value/identity — when
  // tints diverge, so attaching a tint only ever promotes a batch, never splits it.
  // spriteBatchColorTransformData/Buffer hold the per-instance floats (8 per instance) for mode 2;
  // spriteBatchUniformColorTransform holds the shared value for mode 1.
  spriteBatchColorTransformMode: number;
  spriteBatchUniformColorTransform: ColorTransform | null;
  spriteBatchColorTransformData: Float32Array;
  spriteBatchColorTransformBuffer: WebGLBuffer | null;
  // Per-clip unwind stack: the form of each pushed clip (scissor vs stencil contour) so popClip
  // un-installs the right gate.
  clipForms: ('rect' | 'contour')[];
  // Active stencil nesting depth, now driven by contour clips (formerly by masks). The GPU draw path
  // reads this to know when a stencil test is live. Rect clips use the scissor and do not touch it.
  currentMaskDepth?: number;
  currentScissorRect?: GlScissorRect | null;
  /**
   * The framebuffer currently bound for rendering. Null means the default
   * (screen) framebuffer. Maintained internally so begin/end render target
   * can restore the previous binding without a gl.getParameter() call.
   */
  currentFramebuffer: WebGLFramebuffer | null;
  /**
   * When rendering into a GlRenderTarget, overrides the canvas dimensions
   * used for clip-space projection and scissor rect computation. Null means
   * use canvas.width / canvas.height (normal on-screen rendering).
   */
  renderTargetViewport: { width: number; height: number } | null;
  shaderLoc: GlShaderLocations;
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  quadVertexBuffer: WebGLBuffer;
  quadIndexBuffer: WebGLBuffer;
  quadVertexData: Float32Array;
  matrixArray: Float32Array;
  scissorStack?: GlScissorRect[];
}

export interface GlParticleShader {
  program: WebGLProgram;
  locCorner: number;
  locPos: number;
  locCosScale: number;
  locSinScale: number;
  locColor: number;
  locUvRect: number;
  locSize: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export interface GlQuadBatchShader {
  program: WebGLProgram;
  locCorner: number;
  locMatAB: number;
  locMatCD: number;
  locMatTXTY: number;
  locSize: number;
  locUvRect: number;
  locAlpha: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

// Per-instance color transform shader: the quad-batch base layout (locations 0-6) plus two
// vec4 instance attributes (a_ctMult at location 7, a_ctOff at location 8) applied per-vertex.
export interface GlColorTransformInstancedShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

// Per-batch color transform shader — the base quad-batch layout plus color-transform uniforms
// applied in the fragment shader. A distinct program from the lean base shader, selected only when a
// whole batch shares one tint, so the default pipeline carries no color-transform record.
export interface GlUniformColorTransformShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locColorMultiplier: WebGLUniformLocation;
  locColorOffset: WebGLUniformLocation;
}

export interface GlScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}
