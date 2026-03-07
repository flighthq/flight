import type { Renderer, RenderState } from '@flighthq/types';

import { setDefaultRenderer } from './renderer';
import { createRenderState } from './renderState';

describe('setDefaultRenderer', () => {
  let state: RenderState & { rendererMapID: number };
  let kindA: symbol;
  let kindB: symbol;
  let renderer1: Renderer;
  let renderer2: Renderer;

  beforeEach(() => {
    kindA = Symbol('kindA');
    kindB = Symbol('kindB');

    renderer1 = { render: vi.fn() } as unknown as Renderer;
    renderer2 = { render: vi.fn() } as unknown as Renderer;

    state = createRenderState();
  });

  it('should register a new renderer', () => {
    expect(state.rendererMap.has(kindA)).toBe(false);

    setDefaultRenderer(state, kindA, renderer1);

    expect(state.rendererMap.get(kindA)).toBe(renderer1);
    expect(state.rendererMapID).toBe(1); // incremented
  });

  it('should increment rendererMapID for each new renderer', () => {
    setDefaultRenderer(state, kindA, renderer1);
    const idAfterFirst = state.rendererMapID;

    setDefaultRenderer(state, kindB, renderer2);
    expect(state.rendererMap.get(kindB)).toBe(renderer2);
    expect(state.rendererMapID).toBe(idAfterFirst + 1);
  });

  it('should not increment rendererMapID if the same renderer is registered', () => {
    setDefaultRenderer(state, kindA, renderer1);
    const idBefore = state.rendererMapID;

    // register same renderer again
    setDefaultRenderer(state, kindA, renderer1);

    expect(state.rendererMap.get(kindA)).toBe(renderer1);
    expect(state.rendererMapID).toBe(idBefore); // no change
  });

  it('should update renderer and increment rendererMapID if different renderer is registered', () => {
    setDefaultRenderer(state, kindA, renderer1);
    const idBefore = state.rendererMapID;

    // register a different renderer for same kind
    setDefaultRenderer(state, kindA, renderer2);

    expect(state.rendererMap.get(kindA)).toBe(renderer2);
    expect(state.rendererMapID).toBe(idBefore + 1); // incremented
  });

  it('should wrap around rendererMapID correctly using >>> 0', () => {
    state.rendererMapID = 0xffffffff; // max 32-bit uint
    setDefaultRenderer(state, kindA, renderer1);
    expect(state.rendererMapID).toBe(0); // wrapped to 0
  });
});
