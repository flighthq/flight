import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostSurfaceCreateCapability } from '@flighthq/types/contract';

import { createSurface, destroySurface } from './surface';

function entityCreator(fields: Omit<HostSurfaceCreateCapability, keyof Entity>): HostSurfaceCreateCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createSurface', () => {
  it('delegates to the creator with exact arguments and returns the surface', () => {
    const canvas = {} as HTMLCanvasElement;
    const create = vi.fn(() => canvas);
    const creator = entityCreator({ createSurface: create, destroySurface() {} });

    expect(createSurface(creator, 800, 600)).toBe(canvas);
    expect(create).toHaveBeenCalledExactlyOnceWith(800, 600);
  });
});

describe('destroySurface', () => {
  it('routes each surface to its creator even when different creators were used', () => {
    const firstCanvas = {} as HTMLCanvasElement;
    const secondCanvas = {} as HTMLCanvasElement;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = entityCreator({ createSurface: () => firstCanvas, destroySurface: firstDestroy });
    const second = entityCreator({ createSurface: () => secondCanvas, destroySurface: secondDestroy });

    createSurface(first, 100, 100);
    createSurface(second, 200, 200);

    destroySurface(firstCanvas);
    destroySurface(secondCanvas);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstCanvas);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondCanvas);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const canvas = {} as HTMLCanvasElement;
    const destroy = vi.fn();
    const creator = entityCreator({ createSurface: () => canvas, destroySurface: destroy });
    createSurface(creator, 100, 100);

    destroySurface(canvas);
    destroySurface(canvas);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroySurface({} as HTMLCanvasElement)).not.toThrow();
  });
});
