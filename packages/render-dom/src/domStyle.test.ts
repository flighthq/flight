import { setMatrix } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';
import { BlendMode } from '@flighthq/types';

import { enableDOMBlendModeSupport } from './domMaterials';
import { createDOMRenderState } from './domRenderState';
import { applyDOMStyle, initDOMElement, setDOMRendererElement } from './domStyle';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
}

describe('applyDOMStyle', () => {
  it('applies the world transform as a CSS matrix', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    setMatrix(node.transform2D, 1, 0, 0, 1, 10, 20);

    applyDOMStyle(state, el, node);

    expect(el.style.transform).toContain('matrix(1,0,0,1,10,20)');
  });

  it('sets opacity when alpha is less than 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    node.alpha = 0.5;

    applyDOMStyle(state, el, node);

    expect(el.style.opacity).toBe('0.5');
  });

  it('clears opacity when alpha is 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    el.style.opacity = '0.5';
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    node.alpha = 1;

    applyDOMStyle(state, el, node);

    expect(el.style.opacity).toBe('');
  });

  it('sets mixBlendMode for non-default blend mode when blend support is enabled', () => {
    const state = makeState();
    enableDOMBlendModeSupport(state);
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    node.blendMode = BlendMode.Multiply;

    applyDOMStyle(state, el, node);

    expect(el.style.mixBlendMode).toBe('multiply');
  });

  it('leaves mixBlendMode untouched when blend support is not enabled', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    node.blendMode = BlendMode.Multiply;

    applyDOMStyle(state, el, node);

    expect(el.style.mixBlendMode).toBe('');
  });
});

describe('initDOMElement', () => {
  it('sets position to absolute', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.position).toBe('absolute');
  });

  it('sets left and top to 0', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('sets transformOrigin to "0 0"', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.transformOrigin).toBe('0 0');
  });

  it('sets pointerEvents to none', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.pointerEvents).toBe('none');
  });
});

describe('setDOMRendererElement', () => {
  it('writes the element to domCurrentElement on the internal state', () => {
    const container = document.createElement('div');
    const state = createDOMRenderState(container);
    const el = document.createElement('canvas');

    setDOMRendererElement(state, el);

    expect((state as unknown as DOMRenderStateInternal).domCurrentElement).toBe(el);
  });
});
