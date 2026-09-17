import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostSurfaceCreateCapability } from '@flighthq/types/contract';

import { createRenderSurface, destroyRenderSurface } from './renderSurface';

function entityCreator(fields: Omit<HostSurfaceCreateCapability, keyof Entity>): HostSurfaceCreateCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createRenderSurface', () => {
  it('delegates to the creator with exact arguments and returns the surface', () => {
    const canvas = {} as HTMLCanvasElement;
    const create = vi.fn(() => canvas);
    const creator = entityCreator({ createRenderSurface: create, destroyRenderSurface() {} });

    expect(createRenderSurface(creator, 800, 600, 2)).toBe(canvas);
    expect(create).toHaveBeenCalledExactlyOnceWith(800, 600, 2);
  });

  it('defaults pixelRatio to 1 when omitted', () => {
    const canvas = {} as HTMLCanvasElement;
    const create = vi.fn(() => canvas);
    const creator = entityCreator({ createRenderSurface: create, destroyRenderSurface() {} });

    createRenderSurface(creator, 320, 240);
    expect(create).toHaveBeenCalledExactlyOnceWith(320, 240, 1);
  });
});

describe('destroyRenderSurface', () => {
  it('routes each surface to its creator even when different creators were used', () => {
    const firstCanvas = {} as HTMLCanvasElement;
    const secondCanvas = {} as HTMLCanvasElement;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const first = entityCreator({ createRenderSurface: () => firstCanvas, destroyRenderSurface: firstDestroy });
    const second = entityCreator({ createRenderSurface: () => secondCanvas, destroyRenderSurface: secondDestroy });

    createRenderSurface(first, 100, 100, 1);
    createRenderSurface(second, 200, 200, 1);

    destroyRenderSurface(firstCanvas);
    destroyRenderSurface(secondCanvas);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstCanvas);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondCanvas);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const canvas = {} as HTMLCanvasElement;
    const destroy = vi.fn();
    const creator = entityCreator({ createRenderSurface: () => canvas, destroyRenderSurface: destroy });
    createRenderSurface(creator, 100, 100, 1);

    destroyRenderSurface(canvas);
    destroyRenderSurface(canvas);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('is a no-op for an unknown surface', () => {
    expect(() => destroyRenderSurface({} as HTMLCanvasElement)).not.toThrow();
  });
});
