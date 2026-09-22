import type { ColorAdjustmentUnsupportedGuard, RenderState } from '@flighthq/types/contract';
import { BlendMode, EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
  getColorAdjustmentUnsupportedGuard,
  getRenderStateRuntime,
  initializeRenderState,
} from './renderState';

describe('createRenderState', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('initializes default values', () => {
    expect(state.allowSmoothing).toStrictEqual(true);
    expect(state.currentClipDepth).toStrictEqual(0);
    expect(state.pixelRatio).toStrictEqual(1);
    expect(state.renderAlpha).toStrictEqual(1);
    expect(state.renderBlendMode).toStrictEqual(BlendMode.Normal);
    expect(state.displayObjectClipHooks).toStrictEqual(null);
    expect(state.roundPixels).toStrictEqual(false);
  });

  it('attaches a render state runtime with the machinery fields', () => {
    const runtime = getRenderStateRuntime(state);
    expect(runtime.currentFrameId).toStrictEqual(0);
    expect(runtime.renderProxyMap).toStrictEqual(new WeakMap());
    expect(runtime.renderProxyAdapterMap).toStrictEqual(new WeakMap());
    expect(runtime.registries).toStrictEqual({
      nodeRenderers: new Map(),
      // Present and null, not absent: the stable key set is what keeps the registries one hidden class.
      strokeTessellator: null,
    });
    expect(runtime.rendererMapId).toStrictEqual(0);
    expect(runtime.tempStack).toStrictEqual([]);
  });

  it('allows pre-defined values', () => {
    const base = {
      allowSmoothing: false,
      pixelRatio: 5,
      renderAlpha: 0.5,
      renderBlendMode: BlendMode.Multiply,
      roundPixels: true,
    };
    const obj = createRenderState(base);
    expect(obj.allowSmoothing).toStrictEqual(base.allowSmoothing);
    expect(obj.pixelRatio).toStrictEqual(base.pixelRatio);
    expect(obj.renderAlpha).toStrictEqual(base.renderAlpha);
    expect(obj.renderBlendMode).toStrictEqual(base.renderBlendMode);
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
    expect(runtime.currentFrameId).toStrictEqual(0);
    expect(runtime.renderProxyMap).toStrictEqual(new WeakMap());
    expect(runtime.renderProxyAdapterMap).toStrictEqual(new WeakMap());
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.nodeRenderers).toStrictEqual(new Map());
    // Opt-in: the stroke kernel's slot is allocated by enable*StrokePathTessellation, never here.
    expect(runtime.registries.strokeTessellator).toBeNull();
    expect(runtime.rendererMapId).toStrictEqual(0);
    expect(runtime.tempStack).toStrictEqual([]);
  });

  it('returns a distinct runtime each call', () => {
    const a = createRenderStateRuntime();
    const b = createRenderStateRuntime();
    expect(a).not.toBe(b);
    expect(a.registries.nodeRenderers).not.toBe(b.registries.nodeRenderers);
  });
});

describe('destroyRenderState', () => {
  it('clears state-owned traversal and registration storage', () => {
    const state = createRenderState();
    const runtime = getRenderStateRuntime(state);
    runtime.tempStack.push({} as never);
    runtime.registries.effectPaddingResolvers = new Map();

    destroyRenderState(state);

    expect(runtime.tempStack).toHaveLength(0);
    expect(runtime.registries.effectPaddingResolvers).toBeUndefined();
  });
});

describe('getColorAdjustmentUnsupportedGuard', () => {
  it('resolves only a bound guard entry', () => {
    const state = createRenderState();
    const guard: ColorAdjustmentUnsupportedGuard = vi.fn();
    const runtime = getRenderStateRuntime(state);

    expect(getColorAdjustmentUnsupportedGuard(state)).toBeNull();
    runtime.registries.colorAdjustmentUnsupportedGuard = guard;
    expect(getColorAdjustmentUnsupportedGuard(state)).toBe(guard);
    runtime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(getColorAdjustmentUnsupportedGuard(state)).toBeNull();
  });
});

describe('getRenderStateRuntime', () => {
  it('returns the runtime attached under EntityRuntimeKey', () => {
    const state = createRenderState();
    expect(getRenderStateRuntime(state)).toBe(state[EntityRuntimeKey]);
  });
});
describe('initializeRenderState', () => {
  it('is the construction initializer of createRenderState', () => {
    expect(typeof initializeRenderState).toBe('function');
  });
});
