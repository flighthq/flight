import { type Renderer, RenderFeatures, type RenderState } from '@flighthq/types';

import {
  copyRendererRegistrations,
  createNullRendererData,
  disableRenderFeatures,
  enableRenderFeatures,
  hasRenderFeatures,
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

describe('disableRenderFeatures', () => {
  it('removes feature flags from the render state', () => {
    const state = createRenderState({ renderFeatures: RenderFeatures.Masks | RenderFeatures.ScrollRect });
    disableRenderFeatures(state, RenderFeatures.Masks);
    expect(state.renderFeatures).toBe(RenderFeatures.ScrollRect);
  });
});

describe('enableRenderFeatures', () => {
  it('adds feature flags to the render state', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.Masks | RenderFeatures.ScrollRect);
    expect(state.renderFeatures).toBe(RenderFeatures.Masks | RenderFeatures.ScrollRect);
  });
});

describe('hasRenderFeatures', () => {
  it('returns whether all requested features are enabled', () => {
    const state = createRenderState({ renderFeatures: RenderFeatures.Masks });
    expect(hasRenderFeatures(state, RenderFeatures.Masks)).toBe(true);
    expect(hasRenderFeatures(state, RenderFeatures.Masks | RenderFeatures.ScrollRect)).toBe(false);
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
    expect(state.rendererMapID).toBe(1);
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
    registerRenderer(state, kindA, renderer1);
    expect(state.rendererMap.get(kindA)).toBe(renderer1);
    expect(state.rendererMapID).toBe(idBefore);
  });

  it('should update renderer and increment rendererMapID if different renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = state.rendererMapID;
    registerRenderer(state, kindA, renderer2);
    expect(state.rendererMap.get(kindA)).toBe(renderer2);
    expect(state.rendererMapID).toBe(idBefore + 1);
  });

  it('should wrap around rendererMapID correctly using >>> 0', () => {
    state.rendererMapID = 0xffffffff;
    registerRenderer(state, kindA, renderer1);
    expect(state.rendererMapID).toBe(0);
  });
});
