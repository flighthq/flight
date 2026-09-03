import { createEntity } from '@flighthq/entity/contract';
import type { Entity, Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

import {
  createRaster2DSurface,
  destroyRaster2DSurface,
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

function entityProvider(fields: Omit<Raster2DSurfaceProvider, keyof Entity>): Raster2DSurfaceProvider {
  return createEntity(fields);
}

describe('createRaster2DSurface', () => {
  it('passes exact dimensions through the selected provider and preserves its result', () => {
    const surface = {} as Raster2DSurface;
    const createSurface = vi.fn(() => surface);
    setRaster2DSurfaceProvider(entityProvider({ createRaster2DSurface: createSurface, destroyRaster2DSurface() {} }));

    expect(createRaster2DSurface(30, 40)).toBe(surface);
    expect(createSurface).toHaveBeenCalledOnce();
    expect(createSurface).toHaveBeenCalledWith(30, 40);
  });

  it('preserves provider refusal as expected absence', () => {
    setRaster2DSurfaceProvider(entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }));
    expect(createRaster2DSurface(10, 20)).toBeNull();
  });
});

describe('destroyRaster2DSurface', () => {
  it('routes each surface to its creator after the selected provider changes', () => {
    const firstSurface = {} as Raster2DSurface;
    const secondSurface = {} as Raster2DSurface;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    setRaster2DSurfaceProvider(
      entityProvider({
        createRaster2DSurface: () => firstSurface,
        destroyRaster2DSurface: firstDestroy,
      }),
    );
    expect(createRaster2DSurface(10, 20)).toBe(firstSurface);

    setRaster2DSurfaceProvider(
      entityProvider({
        createRaster2DSurface: () => secondSurface,
        destroyRaster2DSurface: secondDestroy,
      }),
    );
    expect(createRaster2DSurface(30, 40)).toBe(secondSurface);

    destroyRaster2DSurface(firstSurface);
    destroyRaster2DSurface(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstSurface);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondSurface);
  });

  it('is a no-op after the creator has destroyed the surface once', () => {
    const surface = {} as Raster2DSurface;
    const destroySurface = vi.fn();
    setRaster2DSurfaceProvider(
      entityProvider({
        createRaster2DSurface: () => surface,
        destroyRaster2DSurface: destroySurface,
      }),
    );
    expect(createRaster2DSurface(10, 20)).toBe(surface);

    destroyRaster2DSurface(surface);
    destroyRaster2DSurface(surface);

    expect(destroySurface).toHaveBeenCalledOnce();
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
    const first = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
    const second = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
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
    const host = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
    const custom = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
    installRaster2DSurfaceHostProvider(host);
    setRaster2DSurfaceProvider(custom);

    expect(getRaster2DSurfaceProvider()).toBe(custom);
  });
});

describe('hasRaster2DSurfaceHostProvider', () => {
  it('reports only the host slot', () => {
    setRaster2DSurfaceProvider(entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }));
    expect(hasRaster2DSurfaceHostProvider()).toBe(false);
    installRaster2DSurfaceHostProvider(
      entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }),
    );
    expect(hasRaster2DSurfaceHostProvider()).toBe(true);
  });
});

describe('installRaster2DSurfaceHostProvider', () => {
  it('keeps the first host provider', () => {
    const first = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
    installRaster2DSurfaceHostProvider(first);
    installRaster2DSurfaceHostProvider(
      entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }),
    );

    expect(getRaster2DSurfaceProvider()).toBe(first);
  });
});

describe('resetRaster2DSurfaceProviderForTest', () => {
  it('clears custom, host, and conflict state', () => {
    installRaster2DSurfaceHostProvider(
      entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }),
    );
    installRaster2DSurfaceHostProvider(
      entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }),
    );
    setRaster2DSurfaceProvider(entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} }));

    resetRaster2DSurfaceProviderForTest();

    expect(hasRaster2DSurfaceHostProvider()).toBe(false);
    expect(explainRaster2DSurfaceProvider()).toMatchObject({ conflict: false, layer: 'host-not-enabled' });
  });
});

describe('setRaster2DSurfaceProvider', () => {
  it('reveals the host provider again when custom is cleared', () => {
    const hostSurface = { width: 1 } as Raster2DSurface;
    const customSurface = { width: 2 } as Raster2DSurface;
    const host = entityProvider({ createRaster2DSurface: () => hostSurface, destroyRaster2DSurface() {} });
    installRaster2DSurfaceHostProvider(host);
    setRaster2DSurfaceProvider(
      entityProvider({ createRaster2DSurface: () => customSurface, destroyRaster2DSurface() {} }),
    );

    expect(createRaster2DSurface(1, 1)).toBe(customSurface);
    setRaster2DSurfaceProvider(null);
    expect(getRaster2DSurfaceProvider()).toBe(host);
    expect(createRaster2DSurface(1, 1)).toBe(hostSurface);
  });
});
