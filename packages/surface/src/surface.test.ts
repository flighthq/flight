import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostSurfaceCreateCapability } from '@flighthq/types/contract';

import { createSurface, destroySurface } from './surface';

function entityCreator(fields: Omit<HostSurfaceCreateCapability, keyof Entity>): HostSurfaceCreateCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createSurface', () => {
  it('delegates to the creator and returns the canvas element', () => {
    const canvas = {} as HTMLCanvasElement;
    const create = vi.fn(() => canvas);
    const creator = entityCreator({ createSurface: create, destroySurface() {} });

    const result = createSurface(creator, 800, 600);
    expect(result).toBe(canvas);
    expect(create).toHaveBeenCalledExactlyOnceWith(800, 600);
  });
});

describe('destroySurface', () => {
  it('delegates to the creator', () => {
    const canvas = {} as HTMLCanvasElement;
    const destroy = vi.fn();
    const creator = entityCreator({ createSurface: () => canvas, destroySurface: destroy });

    destroySurface(creator, canvas);

    expect(destroy).toHaveBeenCalledExactlyOnceWith(canvas);
  });
});
