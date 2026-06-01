import type { Renderer, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';
import {
  copyRendererRegistrations,
  createNullRendererData,
  registerDisplayObjectKindTransformer,
  registerRenderer,
} from './renderer';
import { createRenderState } from './renderState';

describe('copyRendererRegistrations', () => {
  it('copies all registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), draw: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    copyRendererRegistrations(target, source);
    expect(target.rendererMap.get(kind)).toBe(renderer);
  });

  it('is a no-op when source has no registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyRendererRegistrations(target, source);
    expect(target.rendererMap.size).toBe(0);
  });

  it('does not affect source rendererMapID', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), draw: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    const sourceIDBeforeCopy = source.rendererMapID;
    copyRendererRegistrations(target, source);
    expect(source.rendererMapID).toBe(sourceIDBeforeCopy);
  });
});

describe('createNullRendererData', () => {
  it('returns null', () => {
    const state = createRenderState();
    expect(createNullRendererData(state, {} as any)).toBeNull();
  });
});

describe('registerDisplayObjectKindTransformer', () => {
  it('pushes the transformer into displayObjectKindTransformers', () => {
    const state = createRenderState() as unknown as RenderStateInternal;
    const transformer = vi.fn();
    registerDisplayObjectKindTransformer(state as unknown as RenderState, transformer);
    expect(state.displayObjectKindTransformers).toContain(transformer);
  });

  it('appends multiple transformers in registration order', () => {
    const state = createRenderState() as unknown as RenderStateInternal;
    const t1 = vi.fn();
    const t2 = vi.fn();
    registerDisplayObjectKindTransformer(state as unknown as RenderState, t1);
    registerDisplayObjectKindTransformer(state as unknown as RenderState, t2);
    expect(state.displayObjectKindTransformers).toEqual([t1, t2]);
  });
});

describe('registerRenderer', () => {
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

    registerRenderer(state, kindA, renderer1);

    expect(state.rendererMap.get(kindA)).toBe(renderer1);
    expect(state.rendererMapID).toBe(1); // incremented
  });

  it('should increment rendererMapID for each new renderer', () => {
    registerRenderer(state, kindA, renderer1);
    const idAfterFirst = state.rendererMapID;

    registerRenderer(state, kindB, renderer2);
    expect(state.rendererMap.get(kindB)).toBe(renderer2);
    expect(state.rendererMapID).toBe(idAfterFirst + 1);
  });

  it('should not increment rendererMapID if the same renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = state.rendererMapID;

    // register same renderer again
    registerRenderer(state, kindA, renderer1);

    expect(state.rendererMap.get(kindA)).toBe(renderer1);
    expect(state.rendererMapID).toBe(idBefore); // no change
  });

  it('should update renderer and increment rendererMapID if different renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = state.rendererMapID;

    // register a different renderer for same kind
    registerRenderer(state, kindA, renderer2);

    expect(state.rendererMap.get(kindA)).toBe(renderer2);
    expect(state.rendererMapID).toBe(idBefore + 1); // incremented
  });

  it('should wrap around rendererMapID correctly using >>> 0', () => {
    state.rendererMapID = 0xffffffff; // max 32-bit uint
    registerRenderer(state, kindA, renderer1);
    expect(state.rendererMapID).toBe(0); // wrapped to 0
  });
});
