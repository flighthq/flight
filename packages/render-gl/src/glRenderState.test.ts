import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import {
  createKeyedTable,
  getRegistryTableEntry,
  hasRegistryTableEntry,
  withRegistryTableEntry,
} from '@flighthq/registry/contract';
import {
  copyAllRenderersFromRenderState,
  enableColorAdjustments,
  getRenderStateRuntime,
  prepareScene2DRender,
  registerRenderer,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { RenderEffectPaddingResolver, RenderState } from '@flighthq/types/contract';
import { BlendMode, RegistryEntryState } from '@flighthq/types/contract';

import { enableGlRenderStateGuards } from './enableGlRenderStateGuards';
import { registerGlCompressedTextureDecoder, registerGlCompressedTextureUpload } from './glCompressedTexture';
import { isBlendModeSupported, registerGlBlendMode } from './glDraw';
import { registerGlMaterialRenderer } from './glMaterialRegistry';
import {
  copyGlRenderStateRegistrations,
  createGlOffscreenRenderState,
  createGlRenderState,
  createGlRenderStateRuntime,
  destroyGlRenderState,
  getGlRenderStateRuntime,
  invalidateGlRenderStateCache,
} from './glRenderState';
import { makeGL } from './glTestHelper';
import { registerGlTextureResolver } from './glTextureResolver';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = makeGL();
  canvas.getContext = vi.fn().mockReturnValue(gl) as typeof canvas.getContext;
  return { canvas, gl };
}

function getPaddingResolver(state: RenderState, kind: string): RenderEffectPaddingResolver | null {
  const table = getRenderStateRuntime(state).registries.effectPaddingResolvers;
  return table === undefined ? null : getRegistryTableEntry(table, kind);
}

function registerPaddingResolver(state: RenderState, kind: string, resolver: RenderEffectPaddingResolver): void {
  const runtime = getRenderStateRuntime(state);
  runtime.registries.effectPaddingResolvers = withRegistryTableEntry(
    runtime.registries.effectPaddingResolvers ??
      createKeyedTable<RenderEffectPaddingResolver>('RenderEffectPaddingResolver', 'Zero'),
    kind,
    resolver,
  );
}

describe('copyGlRenderStateRegistrations', () => {
  it('copies late GL registrations only when explicitly requested', () => {
    const { canvas } = makeCanvas();
    const screen = createGlRenderState(canvas);
    const offscreen = createGlOffscreenRenderState(screen);
    const materialRenderer = { instanceFloatCount: 0, bind: vi.fn() } as never;
    const offscreenMaterialRenderer = { instanceFloatCount: 0, bind: vi.fn() } as never;
    const decoder = vi.fn(() => new Uint8ClampedArray(4));
    const resolver = vi.fn(() => null);
    registerGlBlendMode(screen, 'acme.LateBlend', { src: 'ONE', dst: 'ZERO' });
    registerGlCompressedTextureDecoder(screen, decoder);
    registerGlCompressedTextureUpload(screen);
    registerGlMaterialRenderer(screen, 'acme.LateMaterial', materialRenderer);
    registerGlTextureResolver(screen, 'acme.LateTexture', resolver);

    expect(isBlendModeSupported(offscreen, 'acme.LateBlend')).toBe(false);
    expect(
      hasRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(false);
    expect(
      hasRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(false);
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toBeNull();
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload.entry).toBeNull();
    copyGlRenderStateRegistrations(offscreen, screen);
    expect(isBlendModeSupported(offscreen, 'acme.LateBlend')).toBe(true);
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(materialRenderer);
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(resolver);
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBe(
      getGlRenderStateRuntime(screen).registries.compressedTextureDecoder,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: decoder,
    });
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBe(
      getGlRenderStateRuntime(screen).registries.compressedTextureUpload,
    );
    registerGlMaterialRenderer(offscreen, 'acme.LateMaterial', offscreenMaterialRenderer);
    registerGlBlendMode(offscreen, 'acme.LateBlend', { src: 'ZERO', dst: 'ONE' });
    registerGlCompressedTextureDecoder(offscreen, null);
    registerGlCompressedTextureUpload(offscreen, null);
    registerGlTextureResolver(offscreen, 'acme.LateTexture', null);
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(offscreenMaterialRenderer);
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(screen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(materialRenderer);
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(screen).registries.blendRealizations, 'acme.LateBlend'),
    ).toEqual({ src: 'ONE', dst: 'ZERO' });
    expect(
      hasRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(false);
    expect(getRegistryTableEntry(getGlRenderStateRuntime(screen).registries.textureResolvers, 'acme.LateTexture')).toBe(
      resolver,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toBeNull();
    expect(getGlRenderStateRuntime(screen).registries.compressedTextureDecoder.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
    expect(getGlRenderStateRuntime(offscreen).registries.compressedTextureUpload.entry).toBeNull();
    expect(getGlRenderStateRuntime(screen).registries.compressedTextureUpload.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
  });
});

describe('createGlOffscreenRenderState', () => {
  it('shares context resources and persistent registration snapshots through independent aggregates', () => {
    const { canvas } = makeCanvas();
    const screen = createGlRenderState(canvas);
    const renderer = { createData: () => null, submit: vi.fn() };
    const materialRenderer = { getBatchData: vi.fn(), getBatchFloats: vi.fn() } as never;
    const paddingResolver = vi.fn(() => ({ bottom: 1, left: 1, right: 1, top: 1 }));
    const textureResolver = vi.fn(() => null);
    const effectRunner = vi.fn();
    registerRenderer(screen, 'acme.Node', renderer);
    registerGlMaterialRenderer(screen, 'acme.Material', materialRenderer);
    registerGlTextureResolver(screen, 'acme.Texture', textureResolver);
    enableColorAdjustments(screen);
    getGlRenderStateRuntime(screen).registries.renderEffects = withRegistryTableEntry(
      getGlRenderStateRuntime(screen).registries.renderEffects,
      'acme.Effect',
      { runner: effectRunner as never },
    );
    registerPaddingResolver(screen, 'acme.Effect', paddingResolver);
    getGlRenderStateRuntime(screen).glRenderTextureCache = new WeakMap();

    const offscreen = createGlOffscreenRenderState(screen);
    const screenRuntime = getGlRenderStateRuntime(screen);
    const offscreenRuntime = getGlRenderStateRuntime(offscreen);

    expect(offscreen.gl).toBe(screen.gl);
    expect(offscreen.canvas).toBe(screen.canvas);
    expect(offscreenRuntime.textureCache).toBe(screenRuntime.textureCache);
    expect(offscreenRuntime.textureSourcePremultipliedTextureCache).toBe(
      screenRuntime.textureSourcePremultipliedTextureCache,
    );
    expect(offscreenRuntime.glRenderTextureCache).toBe(screenRuntime.glRenderTextureCache);
    expect(offscreenRuntime.quadIndexBuffer).toBe(screenRuntime.quadIndexBuffer);
    expect(offscreenRuntime.registries.renderers).toBe(screenRuntime.registries.renderers);
    expect(offscreenRuntime.registries).not.toBe(screenRuntime.registries);
    expect(offscreenRuntime.registries.blendRealizations).toBe(screenRuntime.registries.blendRealizations);
    expect(offscreenRuntime.registries.colorAdjustments).toBe(screenRuntime.registries.colorAdjustments);
    expect(offscreenRuntime.registries.compressedTextureDecoder).toBe(
      screenRuntime.registries.compressedTextureDecoder,
    );
    expect(offscreenRuntime.registries.compressedTextureUpload).toBe(screenRuntime.registries.compressedTextureUpload);
    expect(offscreenRuntime.registries.customEffectShaders).toBe(screenRuntime.registries.customEffectShaders);
    expect(offscreenRuntime.registries.customMaterialShaders).toBe(screenRuntime.registries.customMaterialShaders);
    expect(offscreenRuntime.registries.materialRenderers).toBe(screenRuntime.registries.materialRenderers);
    expect(offscreenRuntime.registries.meshMaterialRenderers).toBe(screenRuntime.registries.meshMaterialRenderers);
    expect(offscreenRuntime.registries.modifierSnippets).toBe(screenRuntime.registries.modifierSnippets);
    expect(offscreenRuntime.registries.modifierSnippetRevision).toBe(screenRuntime.registries.modifierSnippetRevision);
    expect(offscreenRuntime.registries.pbrExtensions).toBe(screenRuntime.registries.pbrExtensions);
    expect(offscreenRuntime.registries.pbrExtensionRevision).toBe(screenRuntime.registries.pbrExtensionRevision);
    expect(offscreenRuntime.registries.renderEffects).toBe(screenRuntime.registries.renderEffects);
    expect(offscreenRuntime.registries.shapeRasterizer).toBe(screenRuntime.registries.shapeRasterizer);
    expect(offscreenRuntime.registries.strokeTessellator).toBe(screenRuntime.registries.strokeTessellator);
    expect(offscreenRuntime.registries.textureResolvers).toBe(screenRuntime.registries.textureResolvers);
    expect(offscreenRuntime.registries.velocityWriters).toBe(screenRuntime.registries.velocityWriters);
    expect(offscreenRuntime.registries.effectPaddingResolvers).toBe(screenRuntime.registries.effectPaddingResolvers);
    expect(getRegistryTableEntry(offscreenRuntime.registries.renderers, 'acme.Node')).toBe(renderer);
    expect(getRegistryTableEntry(offscreenRuntime.registries.materialRenderers, 'acme.Material')).toBe(
      materialRenderer,
    );
    expect(getRegistryTableEntry(offscreenRuntime.registries.textureResolvers, 'acme.Texture')).toBe(textureResolver);
    expect(getRegistryTableEntry(offscreenRuntime.registries.renderEffects, 'acme.Effect')?.runner).toBe(effectRunner);
    expect(getPaddingResolver(offscreen, 'acme.Effect')).toBe(paddingResolver);

    screenRuntime.currentProgram = {} as WebGLProgram;
    expect(offscreenRuntime.currentProgram).toBe(screenRuntime.currentProgram);
  });

  it('requires explicit re-copy for registrations added after derivation', () => {
    const { canvas } = makeCanvas();
    const screen = createGlRenderState(canvas);
    const offscreen = createGlOffscreenRenderState(screen);
    const renderer = { createData: () => null, submit: vi.fn() };
    const paddingResolver = vi.fn(() => ({ bottom: 2, left: 2, right: 2, top: 2 }));
    const resolver = vi.fn(() => null);
    registerRenderer(screen, 'acme.LateNode', renderer);
    registerGlTextureResolver(screen, 'acme.LateTexture', resolver);
    registerPaddingResolver(screen, 'acme.LateEffect', paddingResolver);

    expect(hasRegistryTableEntry(getRenderStateRuntime(offscreen).registries.renderers, 'acme.LateNode')).toBe(false);
    expect(
      hasRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(false);
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBeNull();

    copyAllRenderersFromRenderState(offscreen, screen);
    copyGlRenderStateRegistrations(offscreen, screen);
    expect(getRegistryTableEntry(getRenderStateRuntime(offscreen).registries.renderers, 'acme.LateNode')).toBe(
      renderer,
    );
    expect(
      getRegistryTableEntry(getGlRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(resolver);
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBe(paddingResolver);
  });

  it('keeps proxy trees independent and destroys derived renderer data without freeing shared context resources', () => {
    const { canvas, gl } = makeCanvas();
    const screen = createGlRenderState(canvas);
    const destroyData = vi.fn();
    const root = createDisplayObject();
    registerRenderer(screen, root.kind, {
      createData: () => createEntity({}),
      destroyData,
      submit: vi.fn(),
    });
    const offscreen = createGlOffscreenRenderState(screen);
    prepareScene2DRender(offscreen, root);

    expect(getRenderStateRuntime(offscreen).renderProxyMap).not.toBe(getRenderStateRuntime(screen).renderProxyMap);
    destroyGlRenderState(offscreen);
    expect(destroyData).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).not.toHaveBeenCalled();

    destroyGlRenderState(screen);
    expect(gl.deleteProgram).toHaveBeenCalled();
  });
});

describe('createGlRenderState', () => {
  it('throws when Gl2 context is unavailable', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn().mockReturnValue(null) as typeof canvas.getContext;
    expect(() => createGlRenderState(canvas)).toThrow('Failed to get WebGL2 context.');
  });

  it('stores the canvas on the returned state', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(state.canvas).toBe(canvas);
  });

  it('stores the GL context on the returned state', () => {
    const { canvas, gl } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(state.gl).toBe(gl);
  });

  it('initializes runtime currentBlendMode to null', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(getGlRenderStateRuntime(state).currentBlendMode).toBeNull();
  });

  it('initializes runtime currentProgram to null', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(getGlRenderStateRuntime(state).currentProgram).toBeNull();
  });

  it('initializes runtime currentTexture to null', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(getGlRenderStateRuntime(state).currentTexture).toBeNull();
  });

  it('enables blending during initialization', () => {
    const { canvas, gl } = makeCanvas();
    createGlRenderState(canvas);
    expect(gl.enable).toHaveBeenCalledWith((gl as unknown as { BLEND: number }).BLEND);
  });

  it('disables depth testing during initialization', () => {
    const { canvas, gl } = makeCanvas();
    createGlRenderState(canvas);
    expect(gl.disable).toHaveBeenCalledWith((gl as unknown as { DEPTH_TEST: number }).DEPTH_TEST);
  });

  it('sets the default premultiplied-alpha blend function', () => {
    const { canvas, gl } = makeCanvas();
    createGlRenderState(canvas);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('requests an anti-aliased context by default', () => {
    const { canvas } = makeCanvas();
    createGlRenderState(canvas);
    const attribs = (canvas.getContext as ReturnType<typeof vi.fn>).mock.calls[0][1] as WebGLContextAttributes;
    expect(attribs.antialias).toBe(true);
  });

  it('disables the anti-aliased context when antialias is false', () => {
    const { canvas } = makeCanvas();
    createGlRenderState(canvas, { antialias: false });
    const attribs = (canvas.getContext as ReturnType<typeof vi.fn>).mock.calls[0][1] as WebGLContextAttributes;
    expect(attribs.antialias).toBe(false);
  });

  it('applies the backgroundColor option', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas, { backgroundColor: 0xff0000ff });
    expect(state.backgroundColor).toBe(0xff0000ff);
  });

  it('uses the provided pixelRatio option', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas, { pixelRatio: 2 });
    expect(state.pixelRatio).toBe(2);
  });

  it('defaults roundPixels to false', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(state.roundPixels).toBe(false);
  });

  it('applies the roundPixels option', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas, { roundPixels: true });
    expect(state.roundPixels).toBe(true);
  });
});

describe('createGlRenderStateRuntime', () => {
  it('returns a runtime with the base binding slot and empty named registration tables', () => {
    const runtime = createGlRenderStateRuntime();
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.blendRealizations).toMatchObject({
      onMiss: 'Normal',
      registry: 'GlBlendRealization',
      shape: 'keyed',
    });
    expect(runtime.registries.blendRealizations.entries.size).toBe(0);
    expect(runtime.registries.customEffectShaders).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlCustomEffectShader',
      shape: 'keyed',
    });
    expect(runtime.registries.customEffectShaders.entries.size).toBe(0);
    expect(runtime.registries.customMaterialShaders).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlCustomMaterialShader',
      shape: 'keyed',
    });
    expect(runtime.registries.customMaterialShaders.entries.size).toBe(0);
    expect(runtime.registries.materialRenderers).toMatchObject({
      onMiss: 'StandardMaterial',
      registry: 'GlMaterialRenderer',
      shape: 'keyed',
    });
    expect(runtime.registries.materialRenderers.entries.size).toBe(0);
    expect(runtime.registries.meshMaterialRenderers).toMatchObject({
      onMiss: 'StandardMaterial',
      registry: 'GlMeshMaterialRenderer',
      shape: 'keyed',
    });
    expect(runtime.registries.meshMaterialRenderers.entries.size).toBe(0);
    expect(runtime.registries.modifierSnippets).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlModifierSnippet',
      shape: 'keyed',
    });
    expect(runtime.registries.modifierSnippets.entries.size).toBe(0);
    expect(runtime.registries.modifierSnippetRevision).toBe(0);
    expect(runtime.registries.pbrExtensions).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlPbrExtension',
      shape: 'keyed',
    });
    expect(runtime.registries.pbrExtensions.entries.size).toBe(0);
    expect(runtime.registries.pbrExtensionRevision).toBe(0);
    expect(runtime.registries.renderEffects).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlRenderEffect',
      shape: 'keyed',
    });
    expect(runtime.registries.compressedTextureDecoder).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'GlCompressedTextureDecoder',
      shape: 'slot',
    });
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.compressedTextureUpload).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'GlCompressedTextureUpload',
      shape: 'slot',
    });
    expect(runtime.registries.shapeRasterizer).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'GlShapeRasterizer',
      shape: 'slot',
    });
    expect(runtime.registries.strokeTessellator).toEqual({
      entry: null,
      onMiss: 'Rasterize',
      registry: 'StrokeTessellator',
      shape: 'slot',
    });
    expect(runtime.registries.velocityWriters).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'GlVelocityWriter',
      shape: 'keyed',
    });
    expect(runtime.registries.velocityWriters.entries.size).toBe(0);
  });
});

describe('destroyGlRenderState', () => {
  it('deletes the state-owned shader programs and buffers', () => {
    const { canvas, gl } = makeCanvas();
    const state = createGlRenderState(canvas);
    const deleteProgram = vi.spyOn(gl, 'deleteProgram');
    const deleteBuffer = vi.spyOn(gl, 'deleteBuffer');

    destroyGlRenderState(state);

    expect(deleteProgram).toHaveBeenCalled();
    expect(deleteBuffer).toHaveBeenCalled();
  });

  it('is safe to call twice (Gl deletes are no-ops on already-deleted resources)', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    destroyGlRenderState(state);
    expect(() => destroyGlRenderState(state)).not.toThrow();
  });
});

describe('enableGlRenderStateGuards', () => {
  it('warns when one GL pipeline prepares two different roots', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableGlRenderStateGuards(state);
    try {
      prepareScene2DRender(state, createDisplayObject());
      prepareScene2DRender(state, createDisplayObject());
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect((entries[0].data as { message: string }).message).toContain('createGlOffscreenRenderState');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

describe('getGlRenderStateRuntime', () => {
  it('returns the runtime attached by createGlRenderState', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime).toBeDefined();
    expect(runtime.defaultBitmapShader).toBeDefined();
  });

  it('resolves the same runtime object on repeated calls', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    expect(getGlRenderStateRuntime(state)).toBe(getGlRenderStateRuntime(state));
  });
});

describe('invalidateGlRenderStateCache', () => {
  it('nulls the cached GL binding slots so the next draw re-binds from scratch', () => {
    const { canvas } = makeCanvas();
    const state = createGlRenderState(canvas);
    const runtime = getGlRenderStateRuntime(state);

    // Simulate a full frame of render-gl activity plus a sibling renderer (scene-gl) binding raw GL
    // state the cache never observed: the cache now points at bindings that are no longer current.
    runtime.currentProgram = {} as WebGLProgram;
    runtime.currentTexture = {} as WebGLTexture;
    runtime.currentFramebuffer = {} as WebGLFramebuffer;
    runtime.currentBlendMode = BlendMode.Add;
    runtime.currentMaskDepth = 3;
    runtime.currentScissorRect = { x: 0, y: 0, width: 1, height: 1 };
    runtime.renderTargetViewport = { height: 4, width: 4, x: 0, y: 0 };

    invalidateGlRenderStateCache(state);

    expect(runtime.currentProgram).toBeNull();
    expect(runtime.currentTexture).toBeNull();
    expect(runtime.currentFramebuffer).toBeNull();
    expect(runtime.currentBlendMode).toBeNull();
    expect(runtime.currentMaskDepth).toBe(0);
    expect(runtime.currentScissorRect).toBeNull();
    expect(runtime.renderTargetViewport).toBeNull();
  });
});
import { createEntity } from '@flighthq/entity/contract';
