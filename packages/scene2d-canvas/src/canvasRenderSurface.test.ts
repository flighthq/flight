import type { CanvasSurface, HostCanvasCapability } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import {
  acquireCanvasSurface,
  destroyCanvasSurfaceOwned,
  getCanvasHost,
  getCanvasSurfaceHost,
  registerCanvasHost,
} from './canvasRenderSurface';
import { canvasTestHost, createCanvasTextureResolvers } from './canvasTestSupport';
import { canvasScene2DRenderPreset } from './scene2DCanvasPipeline';

function mockHost(overrides: Partial<HostCanvasCapability> = {}): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createImageResource: () => ({}) as any,
    createSurface: overrides.createSurface ?? (() => null),
    destroySurface: overrides.destroySurface ?? (() => {}),
    release: () => {},
    ...overrides,
  } as HostCanvasCapability;
}

describe('acquireCanvasSurface', () => {
  it('passes exact dimensions through the given host and preserves its result', () => {
    const surface = {} as CanvasSurface;
    const createSurface = vi.fn(() => surface);
    const host = mockHost({ createSurface });

    expect(acquireCanvasSurface(host, 30, 40)).toBe(surface);
    expect(createSurface).toHaveBeenCalledOnce();
    expect(createSurface).toHaveBeenCalledWith(30, 40);
  });

  it('preserves host refusal as expected absence', () => {
    const host = mockHost({ createSurface: () => null });
    expect(acquireCanvasSurface(host, 10, 20)).toBeNull();
  });
});

describe('destroyCanvasSurfaceOwned', () => {
  it('routes each surface to its host even when different hosts were used', () => {
    const firstSurface = {} as CanvasSurface;
    const secondSurface = {} as CanvasSurface;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = mockHost({ createSurface: () => firstSurface, destroySurface: firstDestroy });
    const second = mockHost({ createSurface: () => secondSurface, destroySurface: secondDestroy });

    expect(acquireCanvasSurface(first, 10, 20)).toBe(firstSurface);
    expect(acquireCanvasSurface(second, 30, 40)).toBe(secondSurface);

    destroyCanvasSurfaceOwned(firstSurface);
    destroyCanvasSurfaceOwned(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstSurface);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondSurface);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const surface = {} as CanvasSurface;
    const destroySurface = vi.fn();
    const host = mockHost({ createSurface: () => surface, destroySurface });
    expect(acquireCanvasSurface(host, 10, 20)).toBe(surface);

    destroyCanvasSurfaceOwned(surface);
    destroyCanvasSurfaceOwned(surface);

    expect(destroySurface).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroyCanvasSurfaceOwned({} as CanvasSurface)).not.toThrow();
  });
});

describe('getCanvasHost', () => {
  it('throws until a host is registered, then returns exactly that one', () => {
    const state = createCanvasRenderState({
      ...canvasScene2DRenderPreset,
      canvasTextureResolvers: createCanvasTextureResolvers(),
    });
    expect(() => getCanvasHost(state)).toThrow(/registerCanvasHost/);

    registerCanvasHost(state, canvasTestHost);

    expect(getCanvasHost(state)).toBe(canvasTestHost);
  });
});

describe('getCanvasSurfaceHost', () => {
  it('returns the host that created the surface via acquireCanvasSurface', () => {
    const surface = {} as CanvasSurface;
    const host = mockHost({ createSurface: () => surface });
    acquireCanvasSurface(host, 10, 10);

    expect(getCanvasSurfaceHost(surface)).toBe(host);
  });

  it('returns null for an unknown surface', () => {
    expect(getCanvasSurfaceHost({} as CanvasSurface)).toBeNull();
  });

  it('returns null after the surface has been destroyed', () => {
    const surface = {} as CanvasSurface;
    const host = mockHost({ createSurface: () => surface, destroySurface: () => {} });
    acquireCanvasSurface(host, 10, 10);
    destroyCanvasSurfaceOwned(surface);

    expect(getCanvasSurfaceHost(surface)).toBeNull();
  });
});

describe('registerCanvasHost', () => {
  it('replaces the host a state allocates through', () => {
    const state = createCanvasRenderState({
      ...canvasScene2DRenderPreset,
      canvasTextureResolvers: createCanvasTextureResolvers(),
    });
    const replacement = mockHost();

    registerCanvasHost(state, canvasTestHost);
    registerCanvasHost(state, replacement);

    expect(getCanvasHost(state)).toBe(replacement);
  });
});
