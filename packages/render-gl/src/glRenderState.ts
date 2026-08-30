import { createEntity } from '@flighthq/entity/contract';
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
  GlContext,
  GlContextRuntime,
  GlContextState,
  GlRenderOptions,
  GlRenderState,
  GlRenderStateRuntime,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

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

export function createGlContextState(gl: GlContext): GlContextState {
  const quadIndexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  const quadVertexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 64, gl.DYNAMIC_DRAW);

  const contextRuntime: GlContextRuntime = {
    binding: null,
    colorAdjustmentResources: null,
    currentBlendSignature: null,
    currentShader: null,
    currentTextureRealization: null,
    gl,
    particleResources: null,
    quadBatchResources: null,
    quadIndexBuffer,
    quadVertexBuffer,
    references: 0,
    shapeMeshResources: null,
    teardowns: [],
    textureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
  };
  const state = createEntity({ gl }) as GlContextState;
  state[EntityRuntimeKey] = contextRuntime;
  return state;
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
  (state as { gl: GlContext }).gl = screenState.gl;

  const screenRuntime = getGlRenderStateRuntime(screenState);
  const runtime = createGlRenderStateRuntime(undefined, screenRuntime);
  state[EntityRuntimeKey] = runtime;
  initializeOffscreenGlRuntime(runtime, screenRuntime);
  copyAllRenderersFromRenderState(state, screenState);
  copyGlRenderStateRegistrations(state, screenState);
  return state;
}

export function createGlRenderState(gl: GlContext, options: GlRenderOptions = {}): GlRenderState {
  return createGlRenderStateFromContextState(createGlContextState(gl), options);
}

export function createGlRenderStateFromContextState(
  contextState: Readonly<GlContextState>,
  options: GlRenderOptions = {},
): GlRenderState {
  const gl = contextState.gl;

  const state = _createRenderState({
    allowSmoothing: options.imageSmoothingEnabled ?? options.allowSmoothing ?? true,
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as GlRenderState;

  state.applyBlendMode = null;
  (state as { gl: GlContext }).gl = gl;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  const runtime = createGlRenderStateRuntime(contextState);
  state[EntityRuntimeKey] = runtime;
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.currentScissorRect = null;
  runtime.flushPendingDraws = null;
  runtime.renderTargetViewport = null;
  runtime.defaultBitmapShader = null;
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
  runtime.quadVertexData = new Float32Array(16);
  runtime.matrixArray = new Float32Array(9);
  runtime.scissorStack = [];
  runtime.clipForms = [];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}

export function createGlRenderStateRuntime(
  contextState?: Readonly<GlContextState>,
  sharedRuntime?: GlRenderStateRuntime,
): GlRenderStateRuntime {
  const runtime = createRenderStateRuntime() as GlRenderStateRuntime;
  if (sharedRuntime !== undefined) {
    runtime.context = sharedRuntime.context;
  } else if (contextState !== undefined) {
    runtime.context = contextState[EntityRuntimeKey] as GlContextRuntime;
  } else {
    runtime.context = createMinimalContextRuntime(null as unknown as GlContext);
  }
  runtime.context.references++;
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
  const ctx = runtime.context;
  ctx.references--;
  if (ctx.references !== 0) return;
  const gl = ctx.gl;
  for (const teardown of ctx.teardowns) teardown(gl);
  ctx.teardowns.length = 0;

  const programs = new Set<WebGLProgram>();
  if (runtime.defaultBitmapShader) programs.add(runtime.defaultBitmapShader.program);
  if (ctx.particleResources) programs.add(ctx.particleResources.shader.program);
  if (ctx.quadBatchResources) programs.add(ctx.quadBatchResources.shader.program);
  if (ctx.colorAdjustmentResources) {
    programs.add(ctx.colorAdjustmentResources.scaleBiasInstancedShader.program);
    programs.add(ctx.colorAdjustmentResources.matrixInstancedShader.program);
    programs.add(ctx.colorAdjustmentResources.tintInstancedShader.program);
    programs.add(ctx.colorAdjustmentResources.uniformScaleBiasShader.program);
  }
  if (ctx.shapeMeshResources) {
    if (ctx.shapeMeshResources.colorScaleBiasShader) programs.add(ctx.shapeMeshResources.colorScaleBiasShader.program);
    if (ctx.shapeMeshResources.colorMatrixShader) programs.add(ctx.shapeMeshResources.colorMatrixShader.program);
  }
  for (const program of programs) gl.deleteProgram(program);

  gl.deleteBuffer(ctx.quadVertexBuffer);
  gl.deleteBuffer(ctx.quadIndexBuffer);
  if (ctx.particleResources) {
    gl.deleteBuffer(ctx.particleResources.cornerBuffer);
    gl.deleteBuffer(ctx.particleResources.instanceBuffer);
  }
  if (ctx.quadBatchResources) {
    gl.deleteBuffer(ctx.quadBatchResources.cornerBuffer);
    if (ctx.quadBatchResources.writerInstanceBuffer) gl.deleteBuffer(ctx.quadBatchResources.writerInstanceBuffer);
    if (ctx.quadBatchResources.writerMaterialBuffer) gl.deleteBuffer(ctx.quadBatchResources.writerMaterialBuffer);
    if (ctx.quadBatchResources.writerColorScaleBiasBuffer) {
      gl.deleteBuffer(ctx.quadBatchResources.writerColorScaleBiasBuffer);
    }
  }
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

export function getGlContextRuntime(contextState: Readonly<GlContextState>): GlContextRuntime {
  return contextState[EntityRuntimeKey] as GlContextRuntime;
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
  runtime.context.currentBlendSignature = null;
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.context.currentShader = null;
  runtime.currentScissorRect = null;
  runtime.context.currentTextureRealization = null;
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

export function registerGlContextTeardown(state: GlRenderState, teardown: (gl: GlContext) => void): void {
  getGlRenderStateRuntime(state).context.teardowns.push(teardown);
}

function createMinimalContextRuntime(gl: GlContext): GlContextRuntime {
  return {
    binding: null,
    colorAdjustmentResources: null,
    currentBlendSignature: null,
    currentShader: null,
    currentTextureRealization: null,
    gl,
    particleResources: null,
    quadBatchResources: null,
    quadIndexBuffer: null as unknown as WebGLBuffer,
    quadVertexBuffer: null as unknown as WebGLBuffer,
    references: 0,
    shapeMeshResources: null,
    teardowns: [],
    textureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
  };
}

const _destroyedStates = new WeakSet<GlRenderState>();
