import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject } from '@flighthq/types';

import {
  enableCanvasCssFilterSupport,
  getCanvasCssFilter,
  resolveCanvasCssFilter,
  setCanvasCssFilter,
} from './canvasCSSFilterBinding';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  return createCanvasRenderState(canvas);
}

describe('enableCanvasCssFilterSupport', () => {
  it('installs the CSS filter resolver', () => {
    const state = makeState();
    expect(state.canvasCssFilterResolver).toBeNull();
    enableCanvasCssFilterSupport(state);
    expect(state.canvasCssFilterResolver).toBe(resolveCanvasCssFilter);
  });
});

describe('getCanvasCssFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCssFilter(state, node, 'blur(4px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCssFilter(renderProxy)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(getCanvasCssFilter(renderProxy)).toBeUndefined();
  });
});

describe('resolveCanvasCssFilter', () => {
  it('returns null when no filter is set', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(resolveCanvasCssFilter(state, renderProxy)).toBeNull();
  });

  it('returns the bound filter', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCssFilter(state, node, 'grayscale(1)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(resolveCanvasCssFilter(state, renderProxy)).toBe('grayscale(1)');
  });
});

describe('setCanvasCssFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCssFilter(state, node, 'blur(2px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCssFilter(renderProxy)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCssFilter(state, node, 'blur(2px)');
    setCanvasCssFilter(state, node, null);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getCanvasCssFilter(renderProxy)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setCanvasCssFilter(a, node, 'blur(2px)');
    expect(getCanvasCssFilter(getOrCreateRenderProxy2D(b, node))).toBeUndefined();
    expect(getCanvasCssFilter(getOrCreateRenderProxy2D(a, node))).toBe('blur(2px)');
  });
});
