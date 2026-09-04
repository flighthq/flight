import * as renderGlContract from '@flighthq/render-gl/contract';

import {
  createWebGlRenderSurfaceProvider,
  enableHostWebGlRenderSurface,
  initializeWebGlRenderSurfaceProvider,
  resetHostWebGlRenderSurfaceForTest,
} from './webGlRenderSurface';

describe('createWebGlRenderSurfaceProvider', () => {
  it('creates fresh caller-owned surfaces for every request', () => {
    const provider = createWebGlRenderSurfaceProvider();
    const first = provider.createRenderSurface(100, 200, 1);
    const second = provider.createRenderSurface(100, 200, 1);

    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(second).toBeInstanceOf(HTMLCanvasElement);
    expect(second).not.toBe(first);
  });

  it('sets exact logical CSS and default-ratio backing dimensions', () => {
    const surface = createWebGlRenderSurfaceProvider().createRenderSurface(100, 200, 1)!;
    expect(surface.style.width).toBe('100px');
    expect(surface.style.height).toBe('200px');
    expect(surface.width).toBe(100);
    expect(surface.height).toBe(200);
  });

  it('scales only backing dimensions for a non-unit pixel ratio', () => {
    const surface = createWebGlRenderSurfaceProvider().createRenderSurface(300, 150, 2.5)!;
    expect(surface.style.width).toBe('300px');
    expect(surface.style.height).toBe('150px');
    expect(surface.width).toBe(750);
    expect(surface.height).toBe(375);
  });
});

describe('enableHostWebGlRenderSurface', () => {
  afterEach(() => {
    resetHostWebGlRenderSurfaceForTest();
    renderGlContract.resetGlRenderSurfaceProviderForTest();
    vi.restoreAllMocks();
  });

  it('installs the Web provider into the GL-only slot', () => {
    enableHostWebGlRenderSurface();
    const first = renderGlContract.createGlRenderSurface(80, 40, 2);
    const second = renderGlContract.createGlRenderSurface(80, 40, 2);

    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(first?.style.width).toBe('80px');
    expect(first?.width).toBe(160);
    expect(second).not.toBe(first);
  });

  it('calls the GL setter when first enabled', () => {
    const setter = vi.spyOn(renderGlContract, 'setGlRenderSurfaceProvider');
    enableHostWebGlRenderSurface();
    expect(setter).toHaveBeenCalledOnce();
  });

  it('is idempotent', () => {
    const setter = vi.spyOn(renderGlContract, 'setGlRenderSurfaceProvider');
    enableHostWebGlRenderSurface();
    enableHostWebGlRenderSurface();
    expect(setter).toHaveBeenCalledOnce();
  });

  it('allows re-enabling after reset', () => {
    const setter = vi.spyOn(renderGlContract, 'setGlRenderSurfaceProvider');
    enableHostWebGlRenderSurface();
    resetHostWebGlRenderSurfaceForTest();
    enableHostWebGlRenderSurface();
    expect(setter).toHaveBeenCalledTimes(2);
  });
});

describe('initializeWebGlRenderSurfaceProvider', () => {
  it('is the construction initializer of createWebGlRenderSurfaceProvider', () => {
    expect(typeof initializeWebGlRenderSurfaceProvider).toBe('function');
  });
});
describe('resetHostWebGlRenderSurfaceForTest', () => {
  afterEach(() => {
    resetHostWebGlRenderSurfaceForTest();
    renderGlContract.resetGlRenderSurfaceProviderForTest();
  });

  it('allows re-enabling after reset', () => {
    enableHostWebGlRenderSurface();
    const first = renderGlContract.getGlRenderSurfaceProvider();
    resetHostWebGlRenderSurfaceForTest();
    enableHostWebGlRenderSurface();
    expect(renderGlContract.getGlRenderSurfaceProvider()).not.toBe(first);
  });
});
