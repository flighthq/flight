import { createMatrix } from '@flighthq/geometry/contract';
import { createKeyedTable } from '@flighthq/registry/contract';
import type { RenderState } from '@flighthq/types/contract';
import { BlendMode, EntityRuntimeKey } from '@flighthq/types/contract';

import { createRenderState, createRenderStateRuntime, destroyRenderState, getRenderStateRuntime } from './renderState';

describe('createRenderState', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('initializes default values', () => {
    expect(state.allowSmoothing).toStrictEqual(true);
    expect(state.backgroundColor).toStrictEqual(0);
    expect(state.backgroundColorRgba).toStrictEqual([]);
    expect(state.backgroundColorString).toStrictEqual('');
    expect(state.currentClipDepth).toStrictEqual(0);
    expect(state.pixelRatio).toStrictEqual(1);
    expect(state.renderAlpha).toStrictEqual(1);
    expect(state.renderBlendMode).toStrictEqual(BlendMode.Normal);
    expect(state.displayObjectClipHooks).toStrictEqual(null);
    expect(state.renderTransform2D).toStrictEqual(null);
    expect(state.roundPixels).toStrictEqual(false);
  });

  it('attaches a render state runtime with the machinery fields', () => {
    const runtime = getRenderStateRuntime(state);
    expect(runtime.currentFrameId).toStrictEqual(0);
    expect(runtime.renderProxyMap).toStrictEqual(new WeakMap());
    expect(runtime.renderProxyAdapterMap).toStrictEqual(new WeakMap());
    expect(runtime.registries).toStrictEqual({ renderers: createKeyedTable('NodeRenderer', 'Unregistered') });
    expect(runtime.rendererMapId).toStrictEqual(0);
    expect(runtime.tempStack).toStrictEqual([]);
  });

  it('allows pre-defined values', () => {
    const base = {
      allowSmoothing: false,
      backgroundColor: 0xff,
      backgroundColorRgba: [1, 0, 0, 0],
      backgroundColorString: '#FF000000',
      pixelRatio: 5,
      renderAlpha: 0.5,
      renderBlendMode: BlendMode.Multiply,
      renderTransform2D: createMatrix(),
      roundPixels: true,
    };
    const obj = createRenderState(base);
    expect(obj.allowSmoothing).toStrictEqual(base.allowSmoothing);
    expect(obj.backgroundColor).toStrictEqual(base.backgroundColor);
    expect(obj.backgroundColorRgba).toStrictEqual(base.backgroundColorRgba);
    expect(obj.backgroundColorString).toStrictEqual(base.backgroundColorString);
    expect(obj.pixelRatio).toStrictEqual(base.pixelRatio);
    expect(obj.renderAlpha).toStrictEqual(base.renderAlpha);
    expect(obj.renderBlendMode).toStrictEqual(base.renderBlendMode);
    expect(obj.renderTransform2D).toStrictEqual(base.renderTransform2D);
    expect(obj.roundPixels).toStrictEqual(base.roundPixels);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRenderState(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createRenderStateRuntime', () => {
  it('initializes the machinery fields', () => {
    const runtime = createRenderStateRuntime();
    expect(runtime.colorAdjustmentResolver).toBeNull();
    expect(runtime.currentFrameId).toStrictEqual(0);
    expect(runtime.renderProxyMap).toStrictEqual(new WeakMap());
    expect(runtime.renderProxyAdapterMap).toStrictEqual(new WeakMap());
    expect(runtime.registries.renderers).toStrictEqual(createKeyedTable('NodeRenderer', 'Unregistered'));
    expect(runtime.rendererMapId).toStrictEqual(0);
    expect(runtime.tempStack).toStrictEqual([]);
  });

  it('returns a distinct runtime each call', () => {
    const a = createRenderStateRuntime();
    const b = createRenderStateRuntime();
    expect(a).not.toBe(b);
    expect(a.registries.renderers).not.toBe(b.registries.renderers);
  });
});

describe('destroyRenderState', () => {
  it('clears state-owned traversal and registration storage', () => {
    const state = createRenderState();
    const runtime = getRenderStateRuntime(state);
    runtime.tempStack.push({} as never);
    runtime.registries.effectPaddingResolvers = {
      entries: new Map(),
      onMiss: 'Zero',
      registry: 'RenderEffectPaddingResolver',
      shape: 'keyed',
    };

    destroyRenderState(state);

    expect(runtime.tempStack).toHaveLength(0);
    expect(runtime.registries.effectPaddingResolvers).toBeUndefined();
  });
});

describe('getRenderStateRuntime', () => {
  it('returns the runtime attached under EntityRuntimeKey', () => {
    const state = createRenderState();
    expect(getRenderStateRuntime(state)).toBe(state[EntityRuntimeKey]);
  });
});
