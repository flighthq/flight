import { createDisplayObject } from '@flighthq/displayobject';
import type { RenderProxyAdapter } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { createRenderProxy2D } from './renderProxy';
import { applyRenderProxyAdapter, getRenderProxyAdapter, setRenderProxyAdapter } from './renderProxyAdapter';
import { createRenderState } from './renderState';

describe('applyRenderProxyAdapter', () => {
  it('sets traverseChildren to true when no resolver is attached', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.traverseChildren = false;

    applyRenderProxyAdapter(state, source, data);

    expect(data.traverseChildren).toBe(true);
  });

  it('sets traverseChildren from a non-null adapter result', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    const adapter: RenderProxyAdapter = {
      adapt: vi.fn().mockReturnValue(false),
    };
    setRenderProxyAdapter(state, source, adapter);

    applyRenderProxyAdapter(state, source, data);

    expect(data.traverseChildren).toBe(false);
  });

  it('syncs renderer when the adapter changes the node kind', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    const kind = Symbol('Adapted');
    const renderer = { createData: () => null, submit: vi.fn() };
    registerRenderer(state, kind, renderer);
    const adapter: RenderProxyAdapter = {
      adapt: (_state, _source, node) => {
        node.kind = kind;
        return true;
      },
    };
    setRenderProxyAdapter(state, source, adapter);

    applyRenderProxyAdapter(state, source, data);

    expect(data.renderer).toBe(renderer);
  });
});

describe('getRenderProxyAdapter', () => {
  it('returns null when no adapter is set', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    expect(getRenderProxyAdapter(state, source)).toBeNull();
  });

  it('returns the adapter after setRenderProxyAdapter', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderProxyAdapter = { adapt: vi.fn() };
    setRenderProxyAdapter(state, source, adapter);
    expect(getRenderProxyAdapter(state, source)).toBe(adapter);
    setRenderProxyAdapter(state, source, null);
  });
});

describe('setRenderProxyAdapter', () => {
  it('sets an adapter for the source', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderProxyAdapter = { adapt: vi.fn() };
    setRenderProxyAdapter(state, source, adapter);
    expect(getRenderProxyAdapter(state, source)).toBe(adapter);
    setRenderProxyAdapter(state, source, null);
  });

  it('isolates adapters between render states', () => {
    const stateA = createRenderState();
    const stateB = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderProxyAdapter = { adapt: vi.fn() };
    setRenderProxyAdapter(stateA, source, adapter);
    expect(getRenderProxyAdapter(stateA, source)).toBe(adapter);
    expect(getRenderProxyAdapter(stateB, source)).toBeNull();
  });

  it('removes the adapter when passed null', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderProxyAdapter = { adapt: vi.fn() };
    setRenderProxyAdapter(state, source, adapter);
    setRenderProxyAdapter(state, source, null);
    expect(getRenderProxyAdapter(state, source)).toBeNull();
  });
});
