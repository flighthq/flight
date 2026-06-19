import type { DisplayObjectClipHooks, Renderer, RenderState } from '@flighthq/types';

import {
  copyAllRenderersFromRenderState,
  copyRenderersFromRenderState,
  noopRendererData,
  registerRenderer,
} from './renderer';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('copyAllRenderersFromRenderState', () => {
  it('copies all registrations and the clip hooks from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    const hooks = {
      finalize: vi.fn(),
      popClip: vi.fn(),
      pushClip: vi.fn(),
    } as unknown as DisplayObjectClipHooks;
    registerRenderer(source, kind, renderer);
    source.displayObjectClipHooks = hooks;

    copyAllRenderersFromRenderState(target, source);

    expect(getRenderStateRuntime(target).rendererMap.get(kind)).toBe(renderer);
    expect(target.displayObjectClipHooks).toBe(hooks);
  });

  it('is a no-op when source has no registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyAllRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).rendererMap.size).toBe(0);
    expect(target.displayObjectClipHooks).toBeNull();
  });
});

describe('copyRenderersFromRenderState', () => {
  it('copies all renderer registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).rendererMap.get(kind)).toBe(renderer);
  });

  it('is a no-op when source has no renderer registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).rendererMap.size).toBe(0);
  });

  it('does not affect source rendererMapID', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = Symbol('kind');
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    const sourceIDBeforeCopy = getRenderStateRuntime(source).rendererMapID;
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(source).rendererMapID).toBe(sourceIDBeforeCopy);
  });
});

describe('noopRendererData', () => {
  it('returns null', () => {
    const state = createRenderState();
    expect(noopRendererData(state, {} as any)).toBeNull();
  });
});

describe('registerRenderer', () => {
  let state: RenderState;
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
    expect(getRenderStateRuntime(state).rendererMap.has(kindA)).toBe(false);
    registerRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).rendererMap.get(kindA)).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapID).toBe(1);
  });

  it('should increment rendererMapID for each new renderer', () => {
    registerRenderer(state, kindA, renderer1);
    const idAfterFirst = getRenderStateRuntime(state).rendererMapID;
    registerRenderer(state, kindB, renderer2);
    expect(getRenderStateRuntime(state).rendererMap.get(kindB)).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapID).toBe(idAfterFirst + 1);
  });

  it('should not increment rendererMapID if the same renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapID;
    registerRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).rendererMap.get(kindA)).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapID).toBe(idBefore);
  });

  it('should update renderer and increment rendererMapID if different renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapID;
    registerRenderer(state, kindA, renderer2);
    expect(getRenderStateRuntime(state).rendererMap.get(kindA)).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapID).toBe(idBefore + 1);
  });

  it('should wrap around rendererMapID correctly using >>> 0', () => {
    getRenderStateRuntime(state).rendererMapID = 0xffffffff;
    registerRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).rendererMapID).toBe(0);
  });
});
