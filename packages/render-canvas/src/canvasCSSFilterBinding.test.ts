import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject } from '@flighthq/types';

import {
  enableCanvasCSSFilterSupport,
  getCanvasCSSFilter,
  resolveCanvasCSSFilter,
  setCanvasCSSFilter,
} from './canvasCSSFilterBinding';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  return createCanvasRenderState(canvas);
}

describe('enableCanvasCSSFilterSupport', () => {
  it('installs the CSS filter resolver', () => {
    const state = makeState();
    expect(state.canvasCSSFilterResolver).toBeNull();
    enableCanvasCSSFilterSupport(state);
    expect(state.canvasCSSFilterResolver).toBe(resolveCanvasCSSFilter);
  });
});

describe('getCanvasCSSFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(4px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCSSFilter(renderProxy)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(getCanvasCSSFilter(renderProxy)).toBeUndefined();
  });
});

describe('resolveCanvasCSSFilter', () => {
  it('returns null when no filter is set', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(resolveCanvasCSSFilter(state, renderProxy)).toBeNull();
  });

  it('returns the bound filter', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'grayscale(1)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(resolveCanvasCSSFilter(state, renderProxy)).toBe('grayscale(1)');
  });
});

describe('setCanvasCSSFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(2px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCSSFilter(renderProxy)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(2px)');
    setCanvasCSSFilter(state, node, null);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCSSFilter(renderProxy)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(a, node, 'blur(2px)');
    expect(getCanvasCSSFilter(getOrCreateRenderProxy2D(b, node))).toBeUndefined();
    expect(getCanvasCSSFilter(getOrCreateRenderProxy2D(a, node))).toBe('blur(2px)');
  });
});
