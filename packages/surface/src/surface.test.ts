import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostSurfaceCreateCapability } from '@flighthq/types/contract';

import { createSurface, destroySurface, resizeSurface } from './surface';

function entityCreator(fields: Omit<HostSurfaceCreateCapability, keyof Entity>): HostSurfaceCreateCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createSurface', () => {
  it('delegates to the creator and wraps the result in a Surface', () => {
    const canvas = {} as HTMLCanvasElement;
    const create = vi.fn(() => canvas);
    const creator = entityCreator({ createSurface: create, destroySurface() {} });

    const surface = createSurface(creator, 800, 600);
    expect(surface.native).toBe(canvas);
    expect(surface.width).toBe(800);
    expect(surface.height).toBe(600);
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

    const firstSurface = createSurface(first, 100, 100);
    const secondSurface = createSurface(second, 200, 200);

    destroySurface(firstSurface);
    destroySurface(secondSurface);

    expect(firstDestroy).toHaveBeenCalledExactlyOnceWith(firstCanvas);
    expect(secondDestroy).toHaveBeenCalledExactlyOnceWith(secondCanvas);
  });

  it('is a no-op after the surface has been destroyed once', () => {
    const canvas = {} as HTMLCanvasElement;
    const destroy = vi.fn();
    const creator = entityCreator({ createSurface: () => canvas, destroySurface: destroy });
    const surface = createSurface(creator, 100, 100);

    destroySurface(surface);
    destroySurface(surface);

    expect(destroy).toHaveBeenCalledOnce();
  });
});

describe('resizeSurface', () => {
  it('updates both the native element and the surface dimensions', () => {
    const canvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const creator = entityCreator({ createSurface: () => canvas, destroySurface() {} });
    const surface = createSurface(creator, 100, 100);

    resizeSurface(surface, 400, 300);

    expect(surface.width).toBe(400);
    expect(surface.height).toBe(300);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
  });
});
