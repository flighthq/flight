import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, ImageSurface, ImageSurfaceCreator } from '@flighthq/types/contract';

import { createImageSurface, destroyImageSurface } from './imageSurface';

function entityProvider(fields: Omit<ImageSurfaceCreator, keyof Entity>): ImageSurfaceCreator {
  return (() => {
    const out = allocateEntity<any>();
    Object.assign(out, fields);
    return finishEntity(out);
  })();
}

describe('createImageSurface', () => {
  it('passes exact dimensions through the given provider and preserves its result', () => {
    const surface = {} as ImageSurface;
    const create = vi.fn(() => surface);
    const provider = entityProvider({ createImageSurface: create, destroyImageSurface() {} });

    expect(createImageSurface(provider, 30, 40)).toBe(surface);
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(30, 40);
  });

  it('preserves provider refusal as expected absence', () => {
    const provider = entityProvider({ createImageSurface: () => null, destroyImageSurface() {} });
    expect(createImageSurface(provider, 10, 20)).toBeNull();
  });
});

describe('destroyImageSurface', () => {
  it('routes each surface to its creator even when different providers were used', () => {
    const firstSurface = {} as ImageSurface;
    const secondSurface = {} as ImageSurface;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = entityProvider({
      createImageSurface: () => firstSurface,
      destroyImageSurface: firstDestroy,
    });
    const second = entityProvider({
      createImageSurface: () => secondSurface,
      destroyImageSurface: secondDestroy,
    });

    expect(createImageSurface(first, 10, 20)).toBe(firstSurface);
    expect(createImageSurface(second, 30, 40)).toBe(secondSurface);

    destroyImageSurface(firstSurface);
    destroyImageSurface(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstSurface);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondSurface);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const surface = {} as ImageSurface;
    const destroy = vi.fn();
    const provider = entityProvider({
      createImageSurface: () => surface,
      destroyImageSurface: destroy,
    });
    expect(createImageSurface(provider, 10, 20)).toBe(surface);

    destroyImageSurface(surface);
    destroyImageSurface(surface);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroyImageSurface({} as ImageSurface)).not.toThrow();
  });
});
