import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostTarget } from '@flighthq/types/contract';

import { createCanvasSurface } from './canvasSurface';

function createHostTarget(): HostTarget {
  const out = allocateEntity<HostTarget>();
  out.__brand = 'HostTarget' as const;
  return finishEntity(out);
}

describe('createCanvasSurface', () => {
  it('returns a CanvasSurface entity binding the target and context', () => {
    const target = createHostTarget();
    const context = {} as CanvasRenderingContext2D;

    const surface = createCanvasSurface(target, context);

    expect(surface.__brand).toBe('CanvasSurface');
    expect(surface.target).toBe(target);
    expect(surface.context).toBe(context);
  });
});
