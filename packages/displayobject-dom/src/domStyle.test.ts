import { createDisplayObject } from '@flighthq/displayobject';
import { setMatrix } from '@flighthq/geometry';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { BlendMode } from '@flighthq/types';

import { enableDomCssFilterSupport, setDomCssFilter } from './domCSSFilterBinding';
import { enableDomBlendModeSupport } from './domMaterials';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';

function makeState() {
  const container = document.createElement('div');
  return createDomRenderState(container);
}

describe('applyDomStyle', () => {
  it('applies the world transform as a CSS matrix', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    setMatrix(node.transform2D, 1, 0, 0, 1, 10, 20);

    applyDomStyle(state, el, node);

    expect(el.style.transform).toContain('matrix(1,0,0,1,10,20)');
  });

  it('sets opacity when alpha is less than 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    node.alpha = 0.5;

    applyDomStyle(state, el, node);

    expect(el.style.opacity).toBe('0.5');
  });

  it('clears opacity when alpha is 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    el.style.opacity = '0.5';
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    node.alpha = 1;

    applyDomStyle(state, el, node);

    expect(el.style.opacity).toBe('');
  });

  it('sets mixBlendMode for non-default blend mode when blend support is enabled', () => {
    const state = makeState();
    enableDomBlendModeSupport(state);
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    node.blendMode = BlendMode.Multiply;

    applyDomStyle(state, el, node);

    expect(el.style.mixBlendMode).toBe('multiply');
  });

  it('leaves mixBlendMode untouched when blend support is not enabled', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    node.blendMode = BlendMode.Multiply;

    applyDomStyle(state, el, node);

    expect(el.style.mixBlendMode).toBe('');
  });

  it('applies a bound CSS filter to the element', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    enableDomCssFilterSupport(state);
    setDomCssFilter(state, obj, 'blur(3px)');
    const node = getOrCreateRenderProxy2D(state, obj);

    applyDomStyle(state, el, node);

    expect(el.style.filter).toBe('blur(3px)');
  });
});

describe('prepareDomElement', () => {
  it('sets position to absolute', () => {
    const el = document.createElement('div');
    prepareDomElement(el);
    expect(el.style.position).toBe('absolute');
  });

  it('sets left and top to 0', () => {
    const el = document.createElement('div');
    prepareDomElement(el);
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('sets transformOrigin to "0 0"', () => {
    const el = document.createElement('div');
    prepareDomElement(el);
    expect(el.style.transformOrigin).toBe('0 0');
  });

  it('sets pointerEvents to none', () => {
    const el = document.createElement('div');
    prepareDomElement(el);
    expect(el.style.pointerEvents).toBe('none');
  });
});

describe('setDomRendererElement', () => {
  it('writes the element to domCurrentElement on the internal state', () => {
    const container = document.createElement('div');
    const state = createDomRenderState(container);
    const el = document.createElement('canvas');

    setDomRendererElement(state, el);

    expect(getDomRenderStateRuntime(state).domCurrentElement).toBe(el);
  });
});
