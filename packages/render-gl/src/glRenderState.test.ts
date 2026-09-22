import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { withKindMapEntry } from '@flighthq/registry/contract';
import {
  enableColorAdjustmentGuards,
  enableColorAdjustments,
  getColorAdjustmentUnsupportedGuard,
  getRenderStateRuntime,
  prepareScene2DRender,
  registerNodeRenderer,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  GlBitmapShader,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
  GlRenderStateOptions,
  EffectPaddingResolver,
  RenderState,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { areGlRenderStateGuardsEnabled, enableGlRenderStateGuards } from './enableGlRenderStateGuards';
import { registerGlCompressedTextureDecoder, registerGlCompressedTextureUpload } from './glCompressedTexture';
import { isBlendModeSupported, registerGlBlendMode, useGlProgram } from './glDraw';
import { registerGlQuadMaterialRenderer } from './glQuadMaterialRegistry';
import {
  buildGlRenderRegistries,
  createGlContextState,
  createGlRenderState,
  createGlRenderStateRuntime,
  destroyGlRenderState,
  getGlColorAdjustmentMaterialFeature,
  getGlColorAdjustmentMaterialFeatureGuard,
  getGlContextRuntime,
  getGlRenderStateRuntime,
  initializeGlContextState,
  invalidateGlRenderStateCache,
  registerGlContextTeardown,
  registerGlRenderStateTeardown,
} from './glRenderState';
import { ensureDefaultGlBitmapShader } from './glShader';
import { makeGL } from './glTestHelper';
import { registerGlTextureResolver } from './glTextureResolver';

function makeContext() {
  return { gl: makeGL() };
}

function expectEntitySlot(slot: object & { readonly [EntityRuntimeKey]?: unknown }, fields: object): void {
  const { [EntityRuntimeKey]: entityRuntime, ...slotFields } = slot;
  expect(slotFields).toEqual(fields);
  expect(Object.hasOwn(slot, EntityRuntimeKey)).toBe(true);
  expect(entityRuntime).toBeUndefined();
}

function createTestGlRenderState(gl: WebGL2RenderingContext, options: Readonly<GlRenderStateOptions> = {}) {
  return createGlRenderState(gl, options);
}

function getPaddingResolver(state: RenderState, kind: string): EffectPaddingResolver | null {
  const table = getRenderStateRuntime(state).registries.effectPaddingResolvers;
  return table === undefined ? null : (table.get(kind) ?? null);
}

function registerPaddingResolver(state: RenderState, kind: string, resolver: EffectPaddingResolver): void {
  const runtime = getRenderStateRuntime(state);
  runtime.registries.effectPaddingResolvers = withKindMapEntry(
    runtime.registries.effectPaddingResolvers ?? new Map(),
    kind,
    resolver,
  );
}

describe('buildGlRenderRegistries', () => {
  it('returns all required fields with default values', () => {
    const registries = buildGlRenderRegistries({});
    expect(registries.nodeRenderers).toBeInstanceOf(Map);
    expect(registries.nodeRenderers.size).toBe(0);
    expect(registries.blendRealizations).toBeInstanceOf(Map);
    expect(registries.materialRenderers).toBeInstanceOf(Map);
    expect(registries.modifierSnippets).toBeInstanceOf(Map);
    expect(registries.pbrExtensions).toBeInstanceOf(Map);
    expect(registries.textureResolvers).toBeInstanceOf(Map);
    expect(registries.strokeTessellator).toBeNull();
  });

  it('clones provided registry maps and pass arrays into an isolated live aggregate', () => {
    const nodeRenderers = new Map();
    const passes: never[] = [];
    const registries = buildGlRenderRegistries({ nodeRenderers, passes });
    expect(registries.nodeRenderers).not.toBe(nodeRenderers);
    expect(registries.passes).not.toBe(passes);

    nodeRenderers.set('acme.Late', {});
    expect(registries.nodeRenderers.has('acme.Late')).toBe(false);
  });
});

describe('createGlContextState', () => {
  it('allocates a distinct owner for each call with the same raw context', () => {
    const { gl } = makeContext();
    expect(createGlContextState(gl)).not.toBe(createGlContextState(gl));
  });

  it('returns a state that shares the context tier across derived render states', () => {
    const { gl } = makeContext();
    const stateA = createGlRenderState(gl);
    const stateB = createGlRenderState(gl);
    const runtimeA = getGlRenderStateRuntime(stateA);
    const runtimeB = getGlRenderStateRuntime(stateB);

    runtimeA.context.currentShader = { locations: null, program: {} as WebGLProgram };
    expect(runtimeB.context.currentShader).toBe(runtimeA.context.currentShader);
  });
});

describe('createGlContextState (Entity backing)', () => {
  it('rejects a plain literal at the Entity boundary: EntityRuntimeKey is absent without allocateEntity', () => {
    const gl = makeGL();
    const literal = { gl };
    expect(EntityRuntimeKey in literal).toBe(false);

    const entity = createGlContextState(gl);
    expect(EntityRuntimeKey in entity).toBe(true);
  });

  it('yields distinct nonsharing states from two calls over the same raw context', () => {
    const gl = makeGL();
    const stateA = createGlContextState(gl);
    const stateB = createGlContextState(gl);

    expect(stateA).not.toBe(stateB);
    expect(stateA[EntityRuntimeKey]).not.toBe(stateB[EntityRuntimeKey]);

    const runtimeA = getGlContextRuntime(stateA);
    const runtimeB = getGlContextRuntime(stateB);
    expect(runtimeA).not.toBe(runtimeB);
    expect(runtimeA.teardowns).not.toBe(runtimeB.teardowns);
    expect(runtimeA.textureCache).not.toBe(runtimeB.textureCache);
  });

  it('shares the context tier between two render states built from the same GL handle', () => {
    const gl = makeGL();
    const renderA = createGlRenderState(gl);
    const renderB = createGlRenderState(gl);

    const runtimeA = getGlRenderStateRuntime(renderA);
    const runtimeB = getGlRenderStateRuntime(renderB);

    expect(runtimeA).not.toBe(runtimeB);
    expect(runtimeA.context).toBe(runtimeB.context);
    expect(runtimeA.context.gl).toBe(gl);
    expect(runtimeA.context.teardowns).toBe(runtimeB.context.teardowns);
  });
});

describe('createGlRenderState', () => {
  it('stores the GL context on the returned state', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(state.gl).toBe(gl);
  });

  it('initializes runtime currentBlendSignature to null', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(getGlRenderStateRuntime(state).context.currentBlendSignature).toBeNull();
  });

  it('initializes runtime currentShader to null', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(getGlRenderStateRuntime(state).context.currentShader).toBeNull();
  });

  it('initializes runtime currentTextureRealization to null', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization).toBeNull();
  });

  it('enables blending during initialization', () => {
    const { gl } = makeContext();
    createTestGlRenderState(gl);
    expect(gl.enable).toHaveBeenCalledWith((gl as unknown as { BLEND: number }).BLEND);
  });

  it('disables depth testing during initialization', () => {
    const { gl } = makeContext();
    createTestGlRenderState(gl);
    expect(gl.disable).toHaveBeenCalledWith((gl as unknown as { DEPTH_TEST: number }).DEPTH_TEST);
  });

  it('sets the default premultiplied-alpha blend function', () => {
    const { gl } = makeContext();
    createTestGlRenderState(gl);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('uses the provided pixelRatio option', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl, { pixelRatio: 2 });
    expect(state.pixelRatio).toBe(2);
  });

  it('uses imageSmoothingEnabled before the legacy allowSmoothing alias', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl, { allowSmoothing: false, imageSmoothingEnabled: true });
    expect(state.allowSmoothing).toBe(true);
  });

  it('defaults roundPixels to false', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(state.roundPixels).toBe(false);
  });

  it('applies the roundPixels option', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl, { roundPixels: true });
    expect(state.roundPixels).toBe(true);
  });
  it('does not mutate a frozen preset when used as options input', () => {
    const { gl } = makeContext();
    const preset = Object.freeze({
      ...buildGlRenderRegistries({}),
      nodeRenderers: new Map(),
    });
    const state = createTestGlRenderState(gl, { ...preset, pixelRatio: 1 });
    registerNodeRenderer(state, 'acme.Test', { createData: () => null, submit: () => {} });
    expect(preset.nodeRenderers.size).toBe(0);
    expect(getGlRenderStateRuntime(state).registries.nodeRenderers.size).toBe(1);
  });

  it('keeps revision counters on the runtime, not in options', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.modifierSnippetRevision).toBe(0);
    expect(runtime.pbrExtensionRevision).toBe(0);
    expect('modifierSnippetRevision' in runtime.registries).toBe(false);
    expect('pbrExtensionRevision' in runtime.registries).toBe(false);
  });

  it('shares the context tier when two states are built from the same GL handle', () => {
    const { gl } = makeContext();
    const stateA = createGlRenderState(gl);
    const stateB = createGlRenderState(gl);
    const runtimeA = getGlRenderStateRuntime(stateA);
    const runtimeB = getGlRenderStateRuntime(stateB);

    runtimeA.context.currentBlendSignature = { dst: 1, equation: 2, src: 3 };
    expect(runtimeB.context.currentBlendSignature).toEqual({ dst: 1, equation: 2, src: 3 });

    runtimeB.context.currentBlendSignature = { dst: 4, equation: 5, src: 6 };
    expect(runtimeA.context.currentBlendSignature).toEqual({ dst: 4, equation: 5, src: 6 });
  });
});

describe('createGlRenderState (context sharing)', () => {
  it('shares context resources and persistent registration snapshots through independent aggregates', () => {
    const { gl } = makeContext();
    const screen = createTestGlRenderState(gl);
    const renderer = { createData: () => null, submit: vi.fn() };
    const materialRenderer = { getBatchData: vi.fn(), getBatchFloats: vi.fn() } as never;
    const paddingResolver = vi.fn(() => ({ bottom: 1, left: 1, right: 1, top: 1 }));
    const textureResolver = vi.fn(() => null);
    const effectRunner = vi.fn();
    const colorAdjustmentFeature: GlColorAdjustmentMaterialFeature = {
      drawShapeMeshes: vi.fn(),
      flush: vi.fn(() => false),
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record: vi.fn(),
    };
    const colorAdjustmentFeatureGuard: GlColorAdjustmentMaterialFeatureGuard = vi.fn();
    registerNodeRenderer(screen, 'acme.Node', renderer);
    registerGlQuadMaterialRenderer(screen, 'acme.Material', materialRenderer);
    registerGlTextureResolver(screen, 'acme.Texture', textureResolver);
    enableColorAdjustments(screen);
    enableColorAdjustmentGuards(screen);
    enableGlRenderStateGuards(screen);
    getGlRenderStateRuntime(screen).registries.effects = withKindMapEntry(
      getGlRenderStateRuntime(screen).registries.effects,
      'acme.Effect',
      { runner: effectRunner as never },
    );
    registerPaddingResolver(screen, 'acme.Effect', paddingResolver);
    getGlRenderStateRuntime(screen).registries.colorAdjustmentFeature = colorAdjustmentFeature;
    getGlRenderStateRuntime(screen).registries.colorAdjustmentFeatureGuard = colorAdjustmentFeatureGuard;
    getGlRenderStateRuntime(screen).context.glRenderTextureCache = new WeakMap();

    const screenRuntime = getGlRenderStateRuntime(screen);
    const offscreenRegistry = { ...screenRuntime.registries };
    const offscreen = createGlRenderState(screen.gl, offscreenRegistry);
    const offscreenRuntime = getGlRenderStateRuntime(offscreen);

    expect(offscreen.gl).toBe(screen.gl);
    expect(offscreen.contextState).toBe(screen.contextState);
    expect(offscreen.registries).toStrictEqual(offscreenRegistry);
    expect(offscreenRuntime.context.textureCache).toBe(screenRuntime.context.textureCache);
    expect(offscreenRuntime.context.textureSourcePremultipliedTextureCache).toBe(
      screenRuntime.context.textureSourcePremultipliedTextureCache,
    );
    expect(offscreenRuntime.context.glRenderTextureCache).toBe(screenRuntime.context.glRenderTextureCache);
    expect(offscreenRuntime.context.quadIndexBuffer).toBe(screenRuntime.context.quadIndexBuffer);
    expect(offscreenRuntime.registries.nodeRenderers).not.toBe(screenRuntime.registries.nodeRenderers);
    expect(offscreenRuntime.registries).not.toBe(screenRuntime.registries);
    expect(offscreenRuntime.registries.blendRealizations).not.toBe(screenRuntime.registries.blendRealizations);
    expect(offscreenRuntime.registries.colorAdjustmentFeature).toBe(screenRuntime.registries.colorAdjustmentFeature);
    expect(getGlColorAdjustmentMaterialFeature(offscreen)).toBe(colorAdjustmentFeature);
    expect(offscreenRuntime.registries.colorAdjustmentFeatureGuard).toBe(
      screenRuntime.registries.colorAdjustmentFeatureGuard,
    );
    expect(getGlColorAdjustmentMaterialFeatureGuard(offscreen)).toBe(colorAdjustmentFeatureGuard);
    const sharedColorFeatureGuard = offscreenRuntime.registries.colorAdjustmentFeatureGuard;
    screenRuntime.registries.colorAdjustmentFeatureGuard = undefined;
    expect(getGlColorAdjustmentMaterialFeatureGuard(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentFeatureGuard).toBe(sharedColorFeatureGuard);
    expect(getGlColorAdjustmentMaterialFeatureGuard(offscreen)).toBe(colorAdjustmentFeatureGuard);
    const sharedColorFeature = offscreenRuntime.registries.colorAdjustmentFeature;
    screenRuntime.registries.colorAdjustmentFeature = undefined;
    expect(getGlColorAdjustmentMaterialFeature(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentFeature).toBe(sharedColorFeature);
    expect(getGlColorAdjustmentMaterialFeature(offscreen)).toBe(colorAdjustmentFeature);
    expect(offscreenRuntime.registries.colorAdjustments).toBe(screenRuntime.registries.colorAdjustments);
    expect(offscreenRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(
      screenRuntime.registries.colorAdjustmentUnsupportedGuard,
    );
    expect(getColorAdjustmentUnsupportedGuard(offscreen)).not.toBeNull();
    const sharedUnsupportedGuard = offscreenRuntime.registries.colorAdjustmentUnsupportedGuard;
    screenRuntime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(getColorAdjustmentUnsupportedGuard(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(sharedUnsupportedGuard);
    expect(getColorAdjustmentUnsupportedGuard(offscreen)).not.toBeNull();
    expect(offscreenRuntime.registries.renderRootGuard).toBe(screenRuntime.registries.renderRootGuard);
    expect(areGlRenderStateGuardsEnabled(offscreen)).toBe(true);
    const sharedRenderRootGuard = offscreenRuntime.registries.renderRootGuard;
    screenRuntime.registries.renderRootGuard = undefined;
    expect(screenRuntime.registries.renderRootGuard).toBeUndefined();
    expect(offscreenRuntime.registries.renderRootGuard).toBe(sharedRenderRootGuard);
    expect(areGlRenderStateGuardsEnabled(offscreen)).toBe(true);
    expect(offscreenRuntime.registries.compressedTextureDecoder).toBe(
      screenRuntime.registries.compressedTextureDecoder,
    );
    expect(offscreenRuntime.registries.compressedTextureUpload).toBe(screenRuntime.registries.compressedTextureUpload);
    expect(offscreenRuntime.registries.customEffectShaders).not.toBe(screenRuntime.registries.customEffectShaders);
    expect(offscreenRuntime.registries.customMaterialShaders).not.toBe(screenRuntime.registries.customMaterialShaders);
    expect(offscreenRuntime.registries.materialRenderers).not.toBe(screenRuntime.registries.materialRenderers);
    expect(offscreenRuntime.registries.modifierSnippets).not.toBe(screenRuntime.registries.modifierSnippets);
    expect(offscreenRuntime.modifierSnippetRevision).toBe(screenRuntime.modifierSnippetRevision);
    expect(offscreenRuntime.registries.pbrExtensions).not.toBe(screenRuntime.registries.pbrExtensions);
    expect(offscreenRuntime.pbrExtensionRevision).toBe(screenRuntime.pbrExtensionRevision);
    expect(offscreenRuntime.registries.effects).not.toBe(screenRuntime.registries.effects);
    expect(offscreenRuntime.registries.shapeRasterizer).toBe(screenRuntime.registries.shapeRasterizer);
    expect(offscreenRuntime.registries.strokeTessellator).toBe(screenRuntime.registries.strokeTessellator);
    expect(offscreenRuntime.registries.textureResolvers).not.toBe(screenRuntime.registries.textureResolvers);
    expect(offscreenRuntime.registries.velocityWriters).not.toBe(screenRuntime.registries.velocityWriters);
    expect(offscreenRuntime.registries.effectPaddingResolvers).not.toBe(
      screenRuntime.registries.effectPaddingResolvers,
    );
    expect(offscreenRuntime.registries.nodeRenderers.get('acme.Node') ?? null).toBe(renderer);
    expect(offscreenRuntime.registries.materialRenderers.get('acme.Material') ?? null).toBe(materialRenderer);
    expect(offscreenRuntime.registries.textureResolvers.get('acme.Texture') ?? null).toBe(textureResolver);
    expect(offscreenRuntime.registries.effects.get('acme.Effect')?.runner).toBe(effectRunner);
    expect(getPaddingResolver(offscreen, 'acme.Effect')).toBe(paddingResolver);

    screenRuntime.context.currentShader = { locations: null, program: {} as WebGLProgram };
    expect(offscreenRuntime.context.currentShader).toBe(screenRuntime.context.currentShader);
  });

  it('does not observe registrations added after pipeline construction', () => {
    const { gl } = makeContext();
    const screen = createTestGlRenderState(gl);
    let offscreen = createGlRenderState(screen.gl, screen.registries);
    const renderer = { createData: () => null, submit: vi.fn() };
    const paddingResolver = vi.fn(() => ({ bottom: 2, left: 2, right: 2, top: 2 }));
    const resolver = vi.fn(() => null);
    registerNodeRenderer(screen, 'acme.LateNode', renderer);
    registerGlTextureResolver(screen, 'acme.LateTexture', resolver);
    registerPaddingResolver(screen, 'acme.LateEffect', paddingResolver);

    expect(getRenderStateRuntime(offscreen).registries.nodeRenderers.has('acme.LateNode')).toBe(false);
    expect(getGlRenderStateRuntime(offscreen).registries.textureResolvers.has('acme.LateTexture')).toBe(false);
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBeNull();

    destroyGlRenderState(offscreen);
    offscreen = createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries });
    expect(getRenderStateRuntime(offscreen).registries.nodeRenderers.get('acme.LateNode') ?? null).toBe(renderer);
    expect(getGlRenderStateRuntime(offscreen).registries.textureResolvers.get('acme.LateTexture') ?? null).toBe(
      resolver,
    );
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBe(paddingResolver);
  });

  it('keeps proxy trees independent and destroys derived renderer data without freeing shared context resources', () => {
    const { gl } = makeContext();
    const screen = createTestGlRenderState(gl);
    const destroyData = vi.fn();
    const root = createDisplayObject();
    registerNodeRenderer(screen, root.kind, {
      createData: () => finishEntity(allocateEntity()),
      destroyData,
      submit: vi.fn(),
    });
    const offscreen = createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries });
    prepareScene2DRender(offscreen, root);

    expect(getRenderStateRuntime(offscreen).renderProxyMap).not.toBe(getRenderStateRuntime(screen).renderProxyMap);
    destroyGlRenderState(offscreen);
    expect(destroyData).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).not.toHaveBeenCalled();

    destroyGlRenderState(screen);
    expect(gl.deleteBuffer).toHaveBeenCalled();
  });
});

describe('createGlRenderStateRuntime', () => {
  it('returns a runtime with the base binding slot and empty named registration tables', () => {
    const contextState = createGlContextState(makeGL());
    const runtime = createGlRenderStateRuntime(contextState, {});
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.blendRealizations).toBeInstanceOf(Map);
    expect(runtime.registries.blendRealizations.size).toBe(0);
    expect(runtime.registries.customEffectShaders).toBeInstanceOf(Map);
    expect(runtime.registries.customEffectShaders.size).toBe(0);
    expect(runtime.registries.customMaterialShaders).toBeInstanceOf(Map);
    expect(runtime.registries.customMaterialShaders.size).toBe(0);
    expect(runtime.registries.materialRenderers).toBeInstanceOf(Map);
    expect(runtime.registries.materialRenderers.size).toBe(0);
    expect(runtime.registries.modifierSnippets).toBeInstanceOf(Map);
    expect(runtime.registries.modifierSnippets.size).toBe(0);
    expect(runtime.modifierSnippetRevision).toBe(0);
    expect(runtime.registries.pbrExtensions).toBeInstanceOf(Map);
    expect(runtime.registries.pbrExtensions.size).toBe(0);
    expect(runtime.pbrExtensionRevision).toBe(0);
    expect(runtime.registries.effects).toBeInstanceOf(Map);
    expect(runtime.registries.effects.size).toBe(0);
    expect(runtime.registries.compressedTextureDecoder).toBeNull();
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.compressedTextureUpload).toBeNull();
    expect(runtime.registries.shapeRasterizer).toBeNull();
    expect(runtime.registries.strokeTessellator).toBeNull();
    expect(runtime.registries.velocityWriters).toBeInstanceOf(Map);
    expect(runtime.registries.velocityWriters.size).toBe(0);
  });
});

describe('destroyGlRenderState', () => {
  it('runs registered context teardown once after the final shared owner is destroyed', () => {
    const { gl } = makeContext();
    const first = createGlRenderState(gl);
    const second = createGlRenderState(gl);
    const teardown = vi.fn();
    const runtime = getGlRenderStateRuntime(first);
    runtime.context.teardowns.push(teardown);

    destroyGlRenderState(first);
    expect(teardown).not.toHaveBeenCalled();

    destroyGlRenderState(second);
    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(gl);
    expect(runtime.context.teardowns).toHaveLength(0);
  });

  it('does not delete the caller-owned bitmap shader that was bound last', () => {
    const { gl } = makeContext();
    const owner = createTestGlRenderState(gl);
    const owned = ensureDefaultGlBitmapShader(owner);
    const callerProgram = { callerOwned: true } as unknown as WebGLProgram;
    const out = allocateEntity<GlBitmapShader>();
    out.bind = vi.fn();
    out.locations = { ...owned.locations, program: callerProgram };
    out.program = callerProgram;
    const shader = finishEntity(out);
    const deleteProgram = vi.spyOn(gl, 'deleteProgram');
    useGlProgram(owner, shader);

    destroyGlRenderState(owner);
    const nextOwner = createTestGlRenderState(gl);
    useGlProgram(nextOwner, shader);

    expect(deleteProgram).toHaveBeenCalledWith(owned.program);
    expect(deleteProgram).not.toHaveBeenCalledWith(callerProgram);
    expect(gl.useProgram).toHaveBeenLastCalledWith(shader.program);
  });

  it('deletes buffers on destroy even when no shader was compiled', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const deleteProgram = vi.spyOn(gl, 'deleteProgram');
    const deleteBuffer = vi.spyOn(gl, 'deleteBuffer');

    destroyGlRenderState(state);

    expect(deleteProgram).not.toHaveBeenCalled();
    expect(deleteBuffer).toHaveBeenCalled();
  });

  it('is safe to call twice (Gl deletes are no-ops on already-deleted resources)', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    destroyGlRenderState(state);
    expect(() => destroyGlRenderState(state)).not.toThrow();
  });

  it('invokes registered teardown callbacks when the last reference is destroyed', () => {
    const { gl } = makeContext();
    const stateA = createGlRenderState(gl);
    const stateB = createGlRenderState(gl);
    const teardown = vi.fn();
    registerGlContextTeardown(stateA.contextState, teardown);

    destroyGlRenderState(stateA);
    expect(teardown).not.toHaveBeenCalled();

    destroyGlRenderState(stateB);
    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(gl);
  });

  it('does not invoke teardowns when references remain', () => {
    const { gl } = makeContext();
    const stateA = createGlRenderState(gl);
    createGlRenderState(gl);
    const teardown = vi.fn();
    registerGlContextTeardown(stateA.contextState, teardown);

    destroyGlRenderState(stateA);
    expect(teardown).not.toHaveBeenCalled();
  });
});

describe('enableGlRenderStateGuards', () => {
  it('warns when one GL pipeline prepares two different roots', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableGlRenderStateGuards(state);
    try {
      prepareScene2DRender(state, createDisplayObject());
      prepareScene2DRender(state, createDisplayObject());
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect((entries[0].data as { message: string }).message).toContain('createGlRenderState');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

describe('getGlColorAdjustmentMaterialFeature', () => {
  it('resolves only a bound feature entry', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const feature: GlColorAdjustmentMaterialFeature = {
      drawShapeMeshes: vi.fn(),
      flush: vi.fn(() => false),
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record: vi.fn(),
    };
    const runtime = getGlRenderStateRuntime(state);

    expect(getGlColorAdjustmentMaterialFeature(state)).toBeNull();
    runtime.registries.colorAdjustmentFeature = feature;
    expect(getGlColorAdjustmentMaterialFeature(state)).toBe(feature);
    runtime.registries.colorAdjustmentFeature = undefined;
    expect(getGlColorAdjustmentMaterialFeature(state)).toBeNull();
  });
});

describe('getGlColorAdjustmentMaterialFeatureGuard', () => {
  it('resolves only a bound guard entry', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const guard: GlColorAdjustmentMaterialFeatureGuard = vi.fn();
    const runtime = getGlRenderStateRuntime(state);

    expect(getGlColorAdjustmentMaterialFeatureGuard(state)).toBeNull();
    runtime.registries.colorAdjustmentFeatureGuard = guard;
    expect(getGlColorAdjustmentMaterialFeatureGuard(state)).toBe(guard);
    runtime.registries.colorAdjustmentFeatureGuard = undefined;
    expect(getGlColorAdjustmentMaterialFeatureGuard(state)).toBeNull();
  });
});

describe('getGlContextRuntime', () => {
  it('returns the context runtime attached by createGlContextState', () => {
    const { gl } = makeContext();
    const contextState = createGlContextState(gl);
    const runtime = getGlContextRuntime(contextState);
    expect(runtime).toBeDefined();
    expect(runtime.gl).toBe(gl);
    expect(runtime.teardowns).toEqual([]);
  });

  it('resolves the same runtime object on repeated calls', () => {
    const { gl } = makeContext();
    const contextState = createGlContextState(gl);
    expect(getGlContextRuntime(contextState)).toBe(getGlContextRuntime(contextState));
  });
});

describe('getGlRenderStateRuntime', () => {
  it('returns the runtime attached by createGlRenderState', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime).toBeDefined();
    expect(runtime.defaultBitmapShader).toBeNull();
  });

  it('resolves the same runtime object on repeated calls', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    expect(getGlRenderStateRuntime(state)).toBe(getGlRenderStateRuntime(state));
  });
});

describe('initializeGlContextState', () => {
  it('is the construction initializer of createGlContextState', () => {
    expect(typeof initializeGlContextState).toBe('function');
  });
});

describe('invalidateGlRenderStateCache', () => {
  it('nulls the cached GL binding slots so the next draw re-binds from scratch', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const runtime = getGlRenderStateRuntime(state);

    // Simulate a full frame of render-gl activity plus a sibling renderer (scene-gl) binding raw GL
    // state the cache never observed: the cache now points at bindings that are no longer current.
    runtime.context.currentShader = { locations: null, program: {} as WebGLProgram };
    runtime.context.currentTextureRealization = { straightAlpha: true, texture: {} as WebGLTexture };
    runtime.currentFramebuffer = {} as WebGLFramebuffer;
    runtime.context.currentBlendSignature = { dst: gl.ONE, equation: gl.FUNC_ADD, src: gl.ONE };
    runtime.currentMaskDepth = 3;
    runtime.currentScissorRect = { x: 0, y: 0, width: 1, height: 1 };
    runtime.renderTargetViewport = { height: 4, width: 4, x: 0, y: 0 };

    invalidateGlRenderStateCache(state);

    expect(runtime.context.currentShader).toBeNull();
    expect(runtime.context.currentTextureRealization).toBeNull();
    expect(runtime.currentFramebuffer).toBeNull();
    expect(runtime.context.currentBlendSignature).toBeNull();
    expect(runtime.currentMaskDepth).toBe(0);
    expect(runtime.currentScissorRect).toBeNull();
    expect(runtime.renderTargetViewport).toBeNull();
  });
});

describe('pipeline-backed GL registrations', () => {
  it('requires a rebuilt pipeline to carry late registrations into a new state', () => {
    const { gl } = makeContext();
    const screen = createTestGlRenderState(gl);
    let offscreen = createGlRenderState(screen.gl, screen.registries);
    const materialRenderer = { instanceFloatCount: 0, bind: vi.fn() } as never;
    const offscreenMaterialRenderer = { instanceFloatCount: 0, bind: vi.fn() } as never;
    const decoder = vi.fn(() => new Uint8ClampedArray(4));
    const resolver = vi.fn(() => null);
    registerGlBlendMode(screen, 'acme.LateBlend', { src: 'ONE', dst: 'ZERO' });
    registerGlCompressedTextureDecoder(screen, decoder);
    registerGlCompressedTextureUpload(screen);
    registerGlQuadMaterialRenderer(screen, 'acme.LateMaterial', materialRenderer);
    registerGlTextureResolver(screen, 'acme.LateTexture', resolver);

    expect(isBlendModeSupported(offscreen, 'acme.LateBlend')).toBe(false);
    expect(getGlRenderStateRuntime(offscreen).registries.materialRenderers.has('acme.LateMaterial')).toBe(false);
    expect(getGlRenderStateRuntime(offscreen).registries.textureResolvers.has('acme.LateTexture')).toBe(false);
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBeNull();
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBeNull();
    destroyGlRenderState(offscreen);
    offscreen = createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries });
    expect(isBlendModeSupported(offscreen, 'acme.LateBlend')).toBe(true);
    expect(getGlRenderStateRuntime(offscreen).registries.materialRenderers.get('acme.LateMaterial') ?? null).toBe(
      materialRenderer,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.textureResolvers.get('acme.LateTexture') ?? null).toBe(
      resolver,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBe(
      getGlRenderStateRuntime(screen).registries.compressedTextureDecoder,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toEqual(decoder);
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBe(
      getGlRenderStateRuntime(screen).registries.compressedTextureUpload,
    );
    registerGlQuadMaterialRenderer(offscreen, 'acme.LateMaterial', offscreenMaterialRenderer);
    registerGlBlendMode(offscreen, 'acme.LateBlend', { src: 'ZERO', dst: 'ONE' });
    registerGlCompressedTextureDecoder(offscreen, null);
    registerGlCompressedTextureUpload(offscreen, null);
    registerGlTextureResolver(offscreen, 'acme.LateTexture', null);
    expect(getGlRenderStateRuntime(offscreen).registries.materialRenderers.get('acme.LateMaterial') ?? null).toBe(
      offscreenMaterialRenderer,
    );
    expect(getGlRenderStateRuntime(screen).registries.materialRenderers.get('acme.LateMaterial') ?? null).toBe(
      materialRenderer,
    );
    expect(getGlRenderStateRuntime(screen).registries.blendRealizations.get('acme.LateBlend') ?? null).toEqual({
      src: 'ONE',
      dst: 'ZERO',
    });
    expect(getGlRenderStateRuntime(offscreen).registries.textureResolvers.has('acme.LateTexture')).toBe(false);
    expect(getGlRenderStateRuntime(screen).registries.textureResolvers.get('acme.LateTexture') ?? null).toBe(resolver);
    // Unregistering is an opinion, so the slot exists on `offscreen` holding an empty entry — distinct
    // from a state that never touched the registry at all, where the slot is absent.
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBeNull();
    expect(getGlRenderStateRuntime(screen).registries.compressedTextureDecoder).not.toBeNull();
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBeNull();
    expect(getGlRenderStateRuntime(screen).registries.compressedTextureUpload).not.toBeNull();
  });
});

describe('registerGlContextTeardown', () => {
  it('pushes a callback that fires on context teardown', () => {
    const { gl } = makeContext();
    const state = createGlRenderState(gl);
    const teardown = vi.fn();
    registerGlContextTeardown(state.contextState, teardown);
    destroyGlRenderState(state);
    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(gl);
  });
});
describe('registerGlRenderStateTeardown', () => {
  it('pushes a callback that fires on state teardown', () => {
    const { gl } = makeContext();
    const state = createTestGlRenderState(gl);
    const teardown = vi.fn();
    registerGlRenderStateTeardown(state, teardown);

    destroyGlRenderState(state);

    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(state);
  });
});
