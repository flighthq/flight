import { type DisplayObjectClipHooks, type Renderer, RenderFeatures, type RenderState } from '@flighthq/types';

import {
  copyFromRenderState,
  copyMaskRenderersFromRenderState,
  copyRenderersFromRenderState,
  createNullRendererData,
  disableRenderFeatures,
  enableRenderFeatures,
  hasRenderFeatures,
  registerDisplayObjectMaskRenderer,
  registerRenderer,
} from './renderer';
import { createRenderState } from './renderState';

describe('copyFromRenderState', () => {
  it('copies all registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), draw: vi.fn() } as unknown as Renderer;
    const maskRenderer = { drawMask: vi.fn() };
    const hooks = {
      finalize: vi.fn(),
      popMask: vi.fn(),
      popClipRectangle: vi.fn(),
      pushMask: vi.fn(),
      pushClipRectangle: vi.fn(),
    } as unknown as DisplayObjectClipHooks;
    registerRenderer(source, kind, renderer);
    registerDisplayObjectMaskRenderer(source, kind, maskRenderer);
    source.displayObjectClipHooks = hooks;

    copyFromRenderState(target, source);

    expect(target.rendererMap.get(kind)).toBe(renderer);
    expect(target.displayObjectMaskRendererMap.get(kind)).toBe(maskRenderer);
    expect(target.displayObjectClipHooks).toBe(hooks);
  });

  it('is a no-op when source has no registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyFromRenderState(target, source);
    expect(target.rendererMap.size).toBe(0);
  });
});

describe('copyMaskRenderersFromRenderState', () => {
  it('copies mask renderer registrations and clip hooks from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const maskRenderer = { drawMask: vi.fn() };
    const hooks = {
      finalize: vi.fn(),
      popMask: vi.fn(),
      popClipRectangle: vi.fn(),
      pushMask: vi.fn(),
      pushClipRectangle: vi.fn(),
    } as unknown as DisplayObjectClipHooks;
    registerDisplayObjectMaskRenderer(source, kind, maskRenderer);
    source.displayObjectClipHooks = hooks;

    copyMaskRenderersFromRenderState(target, source);

    expect(target.displayObjectMaskRendererMap.get(kind)).toBe(maskRenderer);
    expect(target.displayObjectClipHooks).toBe(hooks);
  });

  it('is a no-op when source has no mask registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyMaskRenderersFromRenderState(target, source);
    expect(target.displayObjectMaskRendererMap.size).toBe(0);
    expect(target.displayObjectClipHooks).toBeNull();
  });
});

describe('copyRenderersFromRenderState', () => {
  it('copies all renderer registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), draw: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    copyRenderersFromRenderState(target, source);
    expect(target.rendererMap.get(kind)).toBe(renderer);
  });

  it('is a no-op when source has no renderer registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyRenderersFromRenderState(target, source);
    expect(target.rendererMap.size).toBe(0);
  });

  it('does not affect source rendererMapID', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), draw: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    const sourceIDBeforeCopy = source.rendererMapID;
    copyRenderersFromRenderState(target, source);
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
    const state = createRenderState({ renderFeatures: RenderFeatures.Masks | RenderFeatures.ClipRectangle });
    disableRenderFeatures(state, RenderFeatures.Masks);
    expect(state.renderFeatures).toBe(RenderFeatures.ClipRectangle);
  });
});

describe('enableRenderFeatures', () => {
  it('adds feature flags to the render state', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.Masks | RenderFeatures.ClipRectangle);
    expect(state.renderFeatures).toBe(RenderFeatures.Masks | RenderFeatures.ClipRectangle);
  });
});

describe('hasRenderFeatures', () => {
  it('returns whether all requested features are enabled', () => {
    const state = createRenderState({ renderFeatures: RenderFeatures.Masks });
    expect(hasRenderFeatures(state, RenderFeatures.Masks)).toBe(true);
    expect(hasRenderFeatures(state, RenderFeatures.Masks | RenderFeatures.ClipRectangle)).toBe(false);
  });
});

describe('registerDisplayObjectMaskRenderer', () => {
  it('registers a mask renderer and enables mask support', () => {
    const state = createRenderState();
    const kind = Symbol('kind');
    const renderer = { drawMask: vi.fn() };

    registerDisplayObjectMaskRenderer(state, kind, renderer);

    expect(state.displayObjectMaskRendererMap.get(kind)).toBe(renderer);
    expect(state.displayObjectMaskRendererMapID).toBe(1);
    expect(hasRenderFeatures(state, RenderFeatures.Masks)).toBe(true);
  });

  it('does not increment displayObjectMaskRendererMapID for the same renderer', () => {
    const state = createRenderState();
    const kind = Symbol('kind');
    const renderer = { drawMask: vi.fn() };
    registerDisplayObjectMaskRenderer(state, kind, renderer);
    const id = state.displayObjectMaskRendererMapID;

    registerDisplayObjectMaskRenderer(state, kind, renderer);

    expect(state.displayObjectMaskRendererMapID).toBe(id);
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
