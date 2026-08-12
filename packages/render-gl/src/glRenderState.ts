import { createMatrix } from '@flighthq/geometry/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import {
  copyAllRenderersFromRenderState,
  copyRenderStateRegistrations,
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
  setRenderStateBackgroundColor,
} from '@flighthq/render/contract';
import type {
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
  GlRenderOptions,
  GlRenderState,
  GlRenderStateRuntime,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import { compileDefaultGlProgram, createDefaultGlBitmapShader } from './glShader';

// Explicit snapshot re-copy. Mutable legacy maps are cloned; persistent tables may share immutable
// snapshots through distinct aggregates. Either way, later replacements diverge between render states,
// and a cache/effect state may intentionally omit screen policy.
export function copyGlRenderStateRegistrations(target: GlRenderState, source: GlRenderState): void {
  const targetRuntime = getGlRenderStateRuntime(target);
  const sourceRuntime = getGlRenderStateRuntime(source);
  target.applyBlendMode = source.applyBlendMode;
  targetRuntime.defaultBitmapShader = sourceRuntime.defaultBitmapShader;
  targetRuntime.materialBitmapShaderMap =
    sourceRuntime.materialBitmapShaderMap === undefined ? undefined : new Map(sourceRuntime.materialBitmapShaderMap);
  targetRuntime.webglShaderBindingResolver = sourceRuntime.webglShaderBindingResolver;
  targetRuntime.registries = {
    blendRealizations: sourceRuntime.registries.blendRealizations,
    colorAdjustmentFeature: sourceRuntime.registries.colorAdjustmentFeature,
    colorAdjustmentFeatureGuard: sourceRuntime.registries.colorAdjustmentFeatureGuard,
    compressedTextureDecoder: sourceRuntime.registries.compressedTextureDecoder,
    compressedTextureUpload: sourceRuntime.registries.compressedTextureUpload,
    customEffectShaders: sourceRuntime.registries.customEffectShaders,
    customMaterialShaders: sourceRuntime.registries.customMaterialShaders,
    materialRenderers: sourceRuntime.registries.materialRenderers,
    meshMaterialRenderers: sourceRuntime.registries.meshMaterialRenderers,
    modifierSnippets: sourceRuntime.registries.modifierSnippets,
    modifierSnippetRevision: sourceRuntime.registries.modifierSnippetRevision,
    pbrExtensions: sourceRuntime.registries.pbrExtensions,
    pbrExtensionRevision: sourceRuntime.registries.pbrExtensionRevision,
    renderEffects: sourceRuntime.registries.renderEffects,
    renderers: targetRuntime.registries.renderers,
    shapeRasterizer: sourceRuntime.registries.shapeRasterizer,
    strokeTessellator: targetRuntime.registries.strokeTessellator,
    textureResolvers: sourceRuntime.registries.textureResolvers,
    velocityWriters: sourceRuntime.registries.velocityWriters,
  };
  targetRuntime.glRenderTextureGuard = sourceRuntime.glRenderTextureGuard;
  copyRenderStateRegistrations(target, source);
}

/**
 * Creates a second render pipeline over `screenState`'s WebGL context.
 *
 * GPU objects and upload caches are aliases of one context tier. Pipeline policy is a creation-time
 * snapshot: renderer/clip/material/effect/texture registrations start equal, then either state may
 * override or omit them independently. Per-node proxies, adapters, frame counters, batch writers,
 * render transforms, and renderer data are always fresh.
 */
export function createGlOffscreenRenderState(screenState: GlRenderState): GlRenderState {
  const state = _createRenderState({
    allowSmoothing: screenState.allowSmoothing,
    backgroundColor: screenState.backgroundColor,
    backgroundColorRgba: [...screenState.backgroundColorRgba],
    backgroundColorString: screenState.backgroundColorString,
    pixelRatio: screenState.pixelRatio,
    renderAlpha: screenState.renderAlpha,
    renderBlendMode: screenState.renderBlendMode,
    renderTransform2D: createMatrix(),
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  }) as GlRenderState;
  state.applyBlendMode = screenState.applyBlendMode;
  (state as { canvas: HTMLCanvasElement }).canvas = screenState.canvas;
  (state as { gl: WebGL2RenderingContext }).gl = screenState.gl;

  const screenRuntime = getGlRenderStateRuntime(screenState);
  const runtime = createGlRenderStateRuntime(screenRuntime);
  state[EntityRuntimeKey] = runtime;
  initializeOffscreenGlRuntime(runtime, screenRuntime);
  copyAllRenderersFromRenderState(state, screenState);
  copyGlRenderStateRegistrations(state, screenState);
  return state;
}

export function createGlRenderState(canvas: HTMLCanvasElement, options: GlRenderOptions = {}): GlRenderState {
  const contextAttribs: WebGLContextAttributes = {
    alpha: true,
    antialias: options.antialias ?? true,
    powerPreference: options.powerPreference ?? 'default',
    stencil: true,
    ...options.contextAttributes,
  };

  const gl = canvas.getContext('webgl2', contextAttribs) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('Failed to get WebGL2 context.');

  const shaderLoc = compileDefaultGlProgram(gl);
  const matrixArray = new Float32Array(9);
  const defaultBitmapShader = createDefaultGlBitmapShader(shaderLoc, matrixArray);

  // Static index buffer [0, 1, 2, 0, 2, 3]
  const quadIndexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  // Dynamic vertex buffer: 4 vertices × 4 floats (x, y, u, v) × 4 bytes = 64 bytes
  const quadVertexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 64, gl.DYNAMIC_DRAW);

  const state = _createRenderState({
    allowSmoothing: options.imageSmoothingEnabled ?? true,
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as GlRenderState;

  state.applyBlendMode = null;
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { gl: WebGL2RenderingContext }).gl = gl;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  const runtime = createGlRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.currentProgram = null;
  runtime.currentScissorRect = null;
  runtime.currentTexture = null;
  runtime.currentTextureStraightAlpha = false;
  runtime.flushPendingDraws = null;
  runtime.renderTargetViewport = null;
  runtime.defaultBitmapShader = defaultBitmapShader;
  runtime.shaderLoc = shaderLoc;
  runtime.quadBatchWriterBlendMode = null;
  runtime.quadBatchWriterMaterial = null;
  runtime.quadBatchWriterMaterialRenderer = null;
  runtime.quadBatchWriterMaterialFloats = 0;
  runtime.quadBatchWriterMaterialData = new Float32Array(8 * 256);
  runtime.quadBatchWriterMaterialBuffer = null;
  runtime.quadBatchWriterCount = 0;
  runtime.quadBatchWriterInstanceBuffer = null;
  runtime.quadBatchWriterInstanceData = new Float32Array(13 * 256);
  runtime.quadBatchWriterTexture = null;
  runtime.quadBatchWriterSampler = null;
  runtime.quadBatchWriterStraightAlpha = false;
  runtime.quadBatchWriterSmoothing = null;
  // Color-adjustment fold state (mode/data/buffer + the compiled programs) is not allocated here: it
  // is owned by the opt-in registerGlColorAdjustmentMaterialFeature, so a state that never tints carries none of it.
  runtime.textureCache = new WeakMap();
  runtime.textureSourcePremultipliedTextureCache = new WeakMap();
  runtime.textureSourcePremultipliedSrgbTextureCache = new WeakMap();
  runtime.textureSourceStraightTextureCache = new WeakMap();
  runtime.textureSourceStraightSrgbTextureCache = new WeakMap();
  runtime.quadVertexBuffer = quadVertexBuffer;
  runtime.quadIndexBuffer = quadIndexBuffer;
  runtime.quadVertexData = new Float32Array(16);
  runtime.matrixArray = matrixArray;
  runtime.scissorStack = [];
  runtime.clipForms = [];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}

// Allocates the package-private GPU runtime for a GlRenderState. createGlRenderState attaches
// one to each state under EntityRuntimeKey and populates its fields; getGlRenderStateRuntime reads
// it back. The render path writes the returned object every frame, so the return is intentionally
// mutable (not Readonly).
export function createGlRenderStateRuntime(sharedRuntime?: GlRenderStateRuntime): GlRenderStateRuntime {
  const runtime = createRenderStateRuntime() as GlRenderStateRuntime;
  const contextRuntime =
    sharedRuntime === undefined ? { fields: {}, references: 0 } : getGlContextRuntime(sharedRuntime);
  contextRuntime.references++;
  _contextRuntimeByStateRuntime.set(runtime, contextRuntime);
  for (const key of GL_CONTEXT_RUNTIME_KEYS) {
    Object.defineProperty(runtime, key, {
      configurable: true,
      enumerable: true,
      get: () => contextRuntime.fields[key],
      set: (value: unknown) => {
        (contextRuntime.fields as Partial<Record<GlContextRuntimeKey, unknown>>)[key] = value;
      },
    });
  }
  runtime.currentRenderTarget = null;
  runtime.registries = {
    blendRealizations: createKeyedTable('GlBlendRealization', 'Normal'),
    compressedTextureDecoder: createSlotTable('GlCompressedTextureDecoder', 'Unregistered'),
    compressedTextureUpload: createSlotTable('GlCompressedTextureUpload', 'Unregistered'),
    customEffectShaders: createKeyedTable('GlCustomEffectShader', 'Unregistered'),
    customMaterialShaders: createKeyedTable('GlCustomMaterialShader', 'Unregistered'),
    materialRenderers: createKeyedTable('GlMaterialRenderer', 'StandardMaterial'),
    meshMaterialRenderers: createKeyedTable('GlMeshMaterialRenderer', 'StandardMaterial'),
    modifierSnippets: createKeyedTable('GlModifierSnippet', 'Unregistered'),
    modifierSnippetRevision: 0,
    pbrExtensions: createKeyedTable('GlPbrExtension', 'Unregistered'),
    pbrExtensionRevision: 0,
    renderEffects: createKeyedTable('GlRenderEffect', 'Unregistered'),
    renderers: runtime.registries.renderers,
    shapeRasterizer: createSlotTable('GlShapeRasterizer', 'Unregistered'),
    strokeTessellator: runtime.registries.strokeTessellator,
    textureResolvers: createKeyedTable('GlTextureResolver', 'Unregistered'),
    velocityWriters: createKeyedTable('GlVelocityWriter', 'Unregistered'),
  };
  // Per-state, not shared on the context tier: guards are installed per render state.
  runtime.bindingCacheGuard = null;
  return runtime;
}

// Frees the GPU resources createGlRenderState and the lazy ensure* helpers allocated on the
// state's runtime: the compiled shader programs and the vertex/index/instance buffers. Call when the
// render state is no longer needed. Pass the state returned by createGlRenderState — render-cache
// states derived from it (createGlCacheState) alias these resources and become invalid too.
//
// Two things are intentionally NOT freed here:
//   - User-registered material shaders (materialBitmapShaderMap and setGlShader bindings): their
//     programs may be shared across states, so freeing them is the registrant's responsibility.
//   - textureCache textures: textureCache is a WeakMap and cannot be enumerated. Those textures are
//     freed per-node by the dispose* paths, or by the browser when the GL context is lost.
//
// Deleting an already-deleted Gl program or buffer is a silent no-op, so destroying a screen
// state whose resources a cache state still aliases is safe.
export function destroyGlRenderState(state: GlRenderState): void {
  if (_destroyedStates.has(state)) return;
  _destroyedStates.add(state);
  const runtime = getGlRenderStateRuntime(state);
  destroyRenderState(state);
  const contextRuntime = getGlContextRuntime(runtime);
  contextRuntime.references--;
  if (contextRuntime.references !== 0) return;
  const gl = state.gl;

  // Dedupe: several shader wrappers (e.g. defaultBitmapShader) share shaderLoc.program.
  const programs = new Set<WebGLProgram>();
  if (runtime.shaderLoc) programs.add(runtime.shaderLoc.program);
  if (runtime.defaultBitmapShader) programs.add(runtime.defaultBitmapShader.program);
  if (runtime.particleShader) programs.add(runtime.particleShader.program);
  if (runtime.quadBatchShader) programs.add(runtime.quadBatchShader.program);
  if (runtime.colorScaleBiasInstancedShader) programs.add(runtime.colorScaleBiasInstancedShader.program);
  if (runtime.colorMatrixInstancedShader) programs.add(runtime.colorMatrixInstancedShader.program);
  if (runtime.colorTintInstancedShader) programs.add(runtime.colorTintInstancedShader.program);
  if (runtime.uniformColorScaleBiasShader) programs.add(runtime.uniformColorScaleBiasShader.program);
  if (runtime.shapeMeshColorScaleBiasShader) programs.add(runtime.shapeMeshColorScaleBiasShader.program);
  if (runtime.shapeMeshColorMatrixShader) programs.add(runtime.shapeMeshColorMatrixShader.program);
  for (const program of programs) gl.deleteProgram(program);

  gl.deleteBuffer(runtime.quadVertexBuffer);
  gl.deleteBuffer(runtime.quadIndexBuffer);
  if (runtime.particleCornerBuffer) gl.deleteBuffer(runtime.particleCornerBuffer);
  if (runtime.particleInstanceBuffer) gl.deleteBuffer(runtime.particleInstanceBuffer);
  if (runtime.quadBatchCornerBuffer) gl.deleteBuffer(runtime.quadBatchCornerBuffer);
  if (runtime.quadBatchWriterInstanceBuffer) gl.deleteBuffer(runtime.quadBatchWriterInstanceBuffer);
  if (runtime.quadBatchWriterMaterialBuffer) gl.deleteBuffer(runtime.quadBatchWriterMaterialBuffer);
  if (runtime.quadBatchWriterColorScaleBiasBuffer) gl.deleteBuffer(runtime.quadBatchWriterColorScaleBiasBuffer);
}

export function getGlColorAdjustmentMaterialFeature(
  state: GlRenderState,
): Readonly<GlColorAdjustmentMaterialFeature> | null {
  const entry = getGlRenderStateRuntime(state).registries.colorAdjustmentFeature?.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function getGlColorAdjustmentMaterialFeatureGuard(
  state: GlRenderState,
): GlColorAdjustmentMaterialFeatureGuard | null {
  const entry = getGlRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard?.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

// Resolves the package-private GPU runtime attached to a GlRenderState. Mutable by design: the
// render path writes its fields every frame.
export function getGlRenderStateRuntime(state: GlRenderState): GlRenderStateRuntime {
  return state[EntityRuntimeKey] as GlRenderStateRuntime;
}

// Discards render-gl's cached GL binding state (bound program, texture, framebuffer, blend mode,
// scissor, viewport) so the next render-gl draw re-binds everything from scratch. render-gl's draw
// paths skip redundant `useProgram`/`bindTexture`/`bindFramebuffer` calls by trusting these cached
// slots, which is only sound while render-gl is the *sole* writer of GL state on the context.
//
// A sibling renderer that issues raw GL commands against the same context — scene-gl's mesh,
// skybox, shadow, and IBL passes all call `gl.useProgram`/`gl.blendFunc`/`gl.bindFramebuffer`
// directly — leaves those cached slots pointing at bindings that are no longer current. The next
// render-gl operation (a 2D draw or the effect-pipeline present pass) then skips a bind it needed,
// e.g. setting a uniform against a program that is not the one actually bound, which GL rejects with
// `INVALID_OPERATION: uniform...: location is not from the associated program`. Any such guest
// renderer must call this before returning control to render-gl.
export function invalidateGlRenderStateCache(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.currentBlendMode = null;
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.currentProgram = null;
  runtime.currentScissorRect = null;
  runtime.currentTexture = null;
  runtime.currentTextureStraightAlpha = false;
  runtime.renderTargetViewport = null;
}

function initializeOffscreenGlRuntime(runtime: GlRenderStateRuntime, screenRuntime: GlRenderStateRuntime): void {
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.currentScissorRect = null;
  runtime.currentRenderTarget = null;
  runtime.flushPendingDraws = null;
  runtime.renderTargetViewport = null;
  runtime.defaultBitmapShader = screenRuntime.defaultBitmapShader;
  runtime.quadBatchWriterBlendMode = null;
  runtime.quadBatchWriterMaterial = null;
  runtime.quadBatchWriterMaterialRenderer = null;
  runtime.quadBatchWriterMaterialFloats = 0;
  runtime.quadBatchWriterMaterialData = new Float32Array(8 * 256);
  runtime.quadBatchWriterCount = 0;
  runtime.quadBatchWriterInstanceData = new Float32Array(13 * 256);
  runtime.quadBatchWriterTexture = null;
  runtime.quadBatchWriterSampler = null;
  runtime.quadBatchWriterStraightAlpha = false;
  runtime.quadBatchWriterSmoothing = null;
  runtime.particleInstanceData = new Float32Array(0);
  runtime.quadVertexData = new Float32Array(16);
  runtime.matrixArray = new Float32Array(9);
  runtime.scissorStack = [];
  runtime.clipForms = [];
}

type GlContextRuntimeKey = (typeof GL_CONTEXT_RUNTIME_KEYS)[number];
type GlContextRuntime = {
  fields: Partial<Pick<GlRenderStateRuntime, GlContextRuntimeKey>>;
  references: number;
};

function getGlContextRuntime(runtime: GlRenderStateRuntime): GlContextRuntime {
  const contextRuntime = _contextRuntimeByStateRuntime.get(runtime);
  if (contextRuntime === undefined) throw new Error('GlRenderState runtime has no context tier');
  return contextRuntime;
}

// Storage in these slots is a pure function of (WebGL context, source data). Accessors on each state
// preserve the established runtime surface while routing the actual value to one shared context tier.
// Pass-local framebuffer/viewport/clip fields stay state-local because glRenderPass owns their exact
// dormant restore points on its per-context stack.
const GL_CONTEXT_RUNTIME_KEYS = [
  'currentBlendMode',
  'currentProgram',
  'currentTexture',
  'currentTextureStraightAlpha',
  'particleShader',
  'particleCornerBuffer',
  'particleInstanceBuffer',
  'quadBatchShader',
  'quadBatchCornerBuffer',
  'colorScaleBiasInstancedShader',
  'colorMatrixInstancedShader',
  'colorTintInstancedShader',
  'uniformColorScaleBiasShader',
  'shapeMeshColorScaleBiasShader',
  'shapeMeshColorMatrixShader',
  'sceneMeshUploadCache',
  'shaderLoc',
  'textureCache',
  'textureSourcePremultipliedTextureCache',
  'textureSourcePremultipliedSrgbTextureCache',
  'textureSourceStraightTextureCache',
  'textureSourceStraightSrgbTextureCache',
  'glExternalTextureCache',
  'glRenderTextureCache',
  'videoTextureCache',
  'videoSrgbTextureCache',
  'mipmappedTextures',
  'anisotropyExt',
  'maxAnisotropy',
  'quadVertexBuffer',
  'quadIndexBuffer',
  'quadBatchWriterInstanceBuffer',
  'quadBatchWriterMaterialBuffer',
  'quadBatchWriterColorScaleBiasBuffer',
] as const satisfies ReadonlyArray<keyof GlRenderStateRuntime>;

const _contextRuntimeByStateRuntime = new WeakMap<GlRenderStateRuntime, GlContextRuntime>();
const _destroyedStates = new WeakSet<GlRenderState>();
