import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

import { createRaster2DSurface, destroyRaster2DSurface } from './raster2DSurface';

function entityProvider(fields: Omit<Raster2DSurfaceProvider, keyof Entity>): Raster2DSurfaceProvider {
  return (() => {
    const out = allocateEntity<unknown>();
    Object.assign(out, fields);
    return finishEntity(out);
  })();
}

describe('createRaster2DSurface', () => {
  it('passes exact dimensions through the given provider and preserves its result', () => {
    const surface = {} as Raster2DSurface;
    const create = vi.fn(() => surface);
    const provider = entityProvider({ createRaster2DSurface: create, destroyRaster2DSurface() {} });

    expect(createRaster2DSurface(provider, 30, 40)).toBe(surface);
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(30, 40);
  });

  it('preserves provider refusal as expected absence', () => {
    const provider = entityProvider({ createRaster2DSurface: () => null, destroyRaster2DSurface() {} });
    expect(createRaster2DSurface(provider, 10, 20)).toBeNull();
  });
});

describe('destroyRaster2DSurface', () => {
  it('routes each surface to its creator even when different providers were used', () => {
    const firstSurface = {} as Raster2DSurface;
    const secondSurface = {} as Raster2DSurface;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = entityProvider({
      createRaster2DSurface: () => firstSurface,
      destroyRaster2DSurface: firstDestroy,
    });
    const second = entityProvider({
      createRaster2DSurface: () => secondSurface,
      destroyRaster2DSurface: secondDestroy,
    });

    expect(createRaster2DSurface(first, 10, 20)).toBe(firstSurface);
    expect(createRaster2DSurface(second, 30, 40)).toBe(secondSurface);

    destroyRaster2DSurface(firstSurface);
    destroyRaster2DSurface(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstSurface);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondSurface);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const surface = {} as Raster2DSurface;
    const destroy = vi.fn();
    const provider = entityProvider({
      createRaster2DSurface: () => surface,
      destroyRaster2DSurface: destroy,
    });
    expect(createRaster2DSurface(provider, 10, 20)).toBe(surface);

    destroyRaster2DSurface(surface);
    destroyRaster2DSurface(surface);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroyRaster2DSurface({} as Raster2DSurface)).not.toThrow();
  });
});
