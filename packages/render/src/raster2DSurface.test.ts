import type { Raster2DSurface } from '@flighthq/types/contract';

import {
  createRaster2DSurface,
  explainRaster2DSurfaceProvider,
  getRaster2DSurfaceProvider,
  hasRaster2DSurfaceHostProvider,
  installRaster2DSurfaceHostProvider,
  resetRaster2DSurfaceProviderForTest,
  setRaster2DSurfaceProvider,
} from './raster2DSurface';

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

describe('createRaster2DSurface', () => {
  it('passes exact dimensions through the selected provider and preserves its result', () => {
    const surface = {} as Raster2DSurface;
    const createSurface = vi.fn(() => surface);
    setRaster2DSurfaceProvider({ createRaster2DSurface: createSurface });

    expect(createRaster2DSurface(30, 40)).toBe(surface);
    expect(createSurface).toHaveBeenCalledOnce();
    expect(createSurface).toHaveBeenCalledWith(30, 40);
  });

  it('preserves provider refusal as expected absence', () => {
    setRaster2DSurfaceProvider({ createRaster2DSurface: () => null });
    expect(createRaster2DSurface(10, 20)).toBeNull();
  });
});

describe('explainRaster2DSurfaceProvider', () => {
  it('reports the stable sentinel as host-not-enabled', () => {
    expect(explainRaster2DSurfaceProvider()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports a competing host installation without replacing the first host', () => {
    const first = { createRaster2DSurface: () => null };
    const second = { createRaster2DSurface: () => null };
    installRaster2DSurfaceHostProvider(first);
    installRaster2DSurfaceHostProvider(second);

    expect(explainRaster2DSurfaceProvider()).toMatchObject({ conflict: true, layer: 'host' });
  });
});

describe('getRaster2DSurfaceProvider', () => {
  it('uses one stable null-returning sentinel when no provider is installed', () => {
    const sentinel = getRaster2DSurfaceProvider();
    expect(getRaster2DSurfaceProvider()).toBe(sentinel);
    expect(sentinel.createRaster2DSurface(10, 20)).toBeNull();
  });

  it('selects a custom provider over the host provider', () => {
    const host = { createRaster2DSurface: () => null };
    const custom = { createRaster2DSurface: () => null };
    installRaster2DSurfaceHostProvider(host);
    setRaster2DSurfaceProvider(custom);

    expect(getRaster2DSurfaceProvider()).toBe(custom);
  });
});

describe('hasRaster2DSurfaceHostProvider', () => {
  it('reports only the host slot', () => {
    setRaster2DSurfaceProvider({ createRaster2DSurface: () => null });
    expect(hasRaster2DSurfaceHostProvider()).toBe(false);
    installRaster2DSurfaceHostProvider({ createRaster2DSurface: () => null });
    expect(hasRaster2DSurfaceHostProvider()).toBe(true);
  });
});

describe('installRaster2DSurfaceHostProvider', () => {
  it('keeps the first host provider', () => {
    const first = { createRaster2DSurface: () => null };
    installRaster2DSurfaceHostProvider(first);
    installRaster2DSurfaceHostProvider({ createRaster2DSurface: () => null });

    expect(getRaster2DSurfaceProvider()).toBe(first);
  });
});

describe('resetRaster2DSurfaceProviderForTest', () => {
  it('clears custom, host, and conflict state', () => {
    installRaster2DSurfaceHostProvider({ createRaster2DSurface: () => null });
    installRaster2DSurfaceHostProvider({ createRaster2DSurface: () => null });
    setRaster2DSurfaceProvider({ createRaster2DSurface: () => null });

    resetRaster2DSurfaceProviderForTest();

    expect(hasRaster2DSurfaceHostProvider()).toBe(false);
    expect(explainRaster2DSurfaceProvider()).toMatchObject({ conflict: false, layer: 'host-not-enabled' });
  });
});

describe('setRaster2DSurfaceProvider', () => {
  it('reveals the host provider again when custom is cleared', () => {
    const hostSurface = { width: 1 } as Raster2DSurface;
    const customSurface = { width: 2 } as Raster2DSurface;
    const host = { createRaster2DSurface: () => hostSurface };
    installRaster2DSurfaceHostProvider(host);
    setRaster2DSurfaceProvider({ createRaster2DSurface: () => customSurface });

    expect(createRaster2DSurface(1, 1)).toBe(customSurface);
    setRaster2DSurfaceProvider(null);
    expect(getRaster2DSurfaceProvider()).toBe(host);
    expect(createRaster2DSurface(1, 1)).toBe(hostSurface);
  });
});
