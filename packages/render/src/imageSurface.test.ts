import type { CanvasSurface, HostCanvasCapability } from '@flighthq/types/contract';

import { createCanvasHostSurface, destroyCanvasHostSurface, getCanvasHostSurface } from './imageSurface.ts';

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

describe('createCanvasHostSurface', () => {
  it('passes exact dimensions through the given host and preserves its result', () => {
    const surface = {} as CanvasSurface;
    const createSurface = vi.fn(() => surface);
    const host = mockHost({ createSurface });

    expect(createCanvasHostSurface(host, 30, 40)).toBe(surface);
    expect(createSurface).toHaveBeenCalledOnce();
    expect(createSurface).toHaveBeenCalledWith(30, 40);
  });

  it('preserves host refusal as expected absence', () => {
    const host = mockHost({ createSurface: () => null });
    expect(createCanvasHostSurface(host, 10, 20)).toBeNull();
  });
});

describe('destroyCanvasHostSurface', () => {
  it('routes each surface to its host even when different hosts were used', () => {
    const firstSurface = {} as CanvasSurface;
    const secondSurface = {} as CanvasSurface;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = mockHost({ createSurface: () => firstSurface, destroySurface: firstDestroy });
    const second = mockHost({ createSurface: () => secondSurface, destroySurface: secondDestroy });

    expect(createCanvasHostSurface(first, 10, 20)).toBe(firstSurface);
    expect(createCanvasHostSurface(second, 30, 40)).toBe(secondSurface);

    destroyCanvasHostSurface(firstSurface);
    destroyCanvasHostSurface(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstSurface);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondSurface);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const surface = {} as CanvasSurface;
    const destroySurface = vi.fn();
    const host = mockHost({ createSurface: () => surface, destroySurface });
    expect(createCanvasHostSurface(host, 10, 20)).toBe(surface);

    destroyCanvasHostSurface(surface);
    destroyCanvasHostSurface(surface);

    expect(destroySurface).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroyCanvasHostSurface({} as CanvasSurface)).not.toThrow();
  });
});

describe('getCanvasHostSurface', () => {
  it('returns the host that created the surface', () => {
    const surface = {} as CanvasSurface;
    const host = mockHost({ createSurface: () => surface });
    createCanvasHostSurface(host, 1, 1);
    expect(getCanvasHostSurface(surface)).toBe(host);
  });

  it('returns null for an unknown surface', () => {
    expect(getCanvasHostSurface({} as CanvasSurface)).toBeNull();
  });

  it('returns null after the surface has been destroyed', () => {
    const surface = {} as CanvasSurface;
    const host = mockHost({ createSurface: () => surface });
    createCanvasHostSurface(host, 1, 1);
    destroyCanvasHostSurface(surface);
    expect(getCanvasHostSurface(surface)).toBeNull();
  });
});
