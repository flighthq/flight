import { createEntity } from '@flighthq/entity/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import * as renderWgpuContract from '@flighthq/render-wgpu/contract';

import {
  createWebWgpuRenderSurfaceProvider,
  enableHostWebWgpuRenderSurface,
  resetHostWebWgpuRenderSurfaceForTest,
} from './webWgpuRenderSurface';

describe('createWebWgpuRenderSurfaceProvider', () => {
  it('creates fresh caller-owned surfaces for every request', () => {
    const provider = createWebWgpuRenderSurfaceProvider();
    const first = provider.createRenderSurface(100, 200, 1);
    const second = provider.createRenderSurface(100, 200, 1);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(second).toBeInstanceOf(HTMLCanvasElement);
    expect(second).not.toBe(first);
  });

  it('sets exact logical CSS and unit-ratio backing dimensions', () => {
    const surface = createWebWgpuRenderSurfaceProvider().createRenderSurface(100, 200, 1)!;
    expect(surface.style.width).toBe('100px');
    expect(surface.style.height).toBe('200px');
    expect(surface.width).toBe(100);
    expect(surface.height).toBe(200);
  });

  it('scales only backing dimensions for a non-unit pixel ratio', () => {
    const surface = createWebWgpuRenderSurfaceProvider().createRenderSurface(300, 150, 2.5)!;
    expect(surface.style.width).toBe('300px');
    expect(surface.style.height).toBe('150px');
    expect(surface.width).toBe(750);
    expect(surface.height).toBe(375);
  });
});

describe('enableHostWebWgpuRenderSurface', () => {
  afterEach(() => {
    resetHostWebWgpuRenderSurfaceForTest();
    renderGlContract.resetGlRenderSurfaceProviderForTest();
    renderWgpuContract.resetWgpuRenderSurfaceProviderForTest();
    vi.restoreAllMocks();
  });

  it('installs the Web provider into the WGPU-only slot', () => {
    expect(renderGlContract.createGlRenderSurface(80, 40, 2)).toBeNull();
    enableHostWebWgpuRenderSurface();
    const first = renderWgpuContract.createWgpuRenderSurface(80, 40, 2);
    const second = renderWgpuContract.createWgpuRenderSurface(80, 40, 2);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(first?.style.width).toBe('80px');
    expect(first?.width).toBe(160);
    expect(second).not.toBe(first);
    expect(renderGlContract.createGlRenderSurface(80, 40, 2)).toBeNull();
  });

  it('calls the WGPU surface setter and no acquisition setter when first enabled', () => {
    const surfaceSetter = vi.spyOn(renderWgpuContract, 'setWgpuRenderSurfaceProvider');
    const acquisitionSetter = vi.spyOn(renderWgpuContract, 'setWgpuHostBackend');
    enableHostWebWgpuRenderSurface();
    expect(surfaceSetter).toHaveBeenCalledOnce();
    expect(acquisitionSetter).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const setter = vi.spyOn(renderWgpuContract, 'setWgpuRenderSurfaceProvider');
    enableHostWebWgpuRenderSurface();
    enableHostWebWgpuRenderSurface();
    expect(setter).toHaveBeenCalledOnce();
  });

  it('allows re-enabling after reset', () => {
    const setter = vi.spyOn(renderWgpuContract, 'setWgpuRenderSurfaceProvider');
    enableHostWebWgpuRenderSurface();
    resetHostWebWgpuRenderSurfaceForTest();
    enableHostWebWgpuRenderSurface();
    expect(setter).toHaveBeenCalledTimes(2);
  });
});

describe('GL and WGPU surface provider independence', () => {
  afterEach(() => {
    resetHostWebWgpuRenderSurfaceForTest();
    renderGlContract.resetGlRenderSurfaceProviderForTest();
    renderWgpuContract.resetWgpuRenderSurfaceProviderForTest();
  });

  it('preserves the full one-sided install, replacement and reset matrix', () => {
    const glFirst = createEntity({
      createRenderSurface: () => ({ kind: 'gl-first' }) as unknown as HTMLCanvasElement,
    });
    const glSecond = createEntity({
      createRenderSurface: () => ({ kind: 'gl-second' }) as unknown as HTMLCanvasElement,
    });
    const wgpuFirst = createEntity({
      createRenderSurface: () => ({ kind: 'wgpu-first' }) as unknown as HTMLCanvasElement,
    });
    const wgpuSecond = createEntity({
      createRenderSurface: () => ({ kind: 'wgpu-second' }) as unknown as HTMLCanvasElement,
    });
    renderGlContract.setGlRenderSurfaceProvider(glFirst);
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBe(glFirst);
    expect(renderGlContract.createGlRenderSurface(1, 1)).toEqual({ kind: 'gl-first' });
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBeNull();
    expect(renderWgpuContract.createWgpuRenderSurface(1, 1)).toBeNull();
    renderWgpuContract.setWgpuRenderSurfaceProvider(wgpuFirst);
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBe(glFirst);
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBe(wgpuFirst);
    expect(renderGlContract.createGlRenderSurface(1, 1)).toEqual({ kind: 'gl-first' });
    expect(renderWgpuContract.createWgpuRenderSurface(1, 1)).toEqual({ kind: 'wgpu-first' });
    renderGlContract.setGlRenderSurfaceProvider(glSecond);
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBe(glSecond);
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBe(wgpuFirst);
    expect(renderGlContract.createGlRenderSurface(1, 1)).toEqual({ kind: 'gl-second' });
    expect(renderWgpuContract.createWgpuRenderSurface(1, 1)).toEqual({ kind: 'wgpu-first' });
    renderWgpuContract.setWgpuRenderSurfaceProvider(wgpuSecond);
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBe(glSecond);
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBe(wgpuSecond);
    expect(renderGlContract.createGlRenderSurface(1, 1)).toEqual({ kind: 'gl-second' });
    expect(renderWgpuContract.createWgpuRenderSurface(1, 1)).toEqual({ kind: 'wgpu-second' });
    renderGlContract.resetGlRenderSurfaceProviderForTest();
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBeNull();
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBe(wgpuSecond);
    expect(renderGlContract.createGlRenderSurface(1, 1)).toBeNull();
    expect(renderWgpuContract.createWgpuRenderSurface(1, 1)).toEqual({ kind: 'wgpu-second' });
    renderWgpuContract.resetWgpuRenderSurfaceProviderForTest();
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).toBeNull();
    expect(renderGlContract.getGlRenderSurfaceProvider()).toBeNull();
  });
});

describe('resetHostWebWgpuRenderSurfaceForTest', () => {
  afterEach(() => {
    resetHostWebWgpuRenderSurfaceForTest();
    renderWgpuContract.resetWgpuRenderSurfaceProviderForTest();
  });

  it('allows re-enabling with a fresh provider', () => {
    enableHostWebWgpuRenderSurface();
    const first = renderWgpuContract.getWgpuRenderSurfaceProvider();
    resetHostWebWgpuRenderSurfaceForTest();
    enableHostWebWgpuRenderSurface();
    expect(renderWgpuContract.getWgpuRenderSurfaceProvider()).not.toBe(first);
  });
});
