import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Camera2D, Camera2DOptions } from '@flighthq/types/contract';

// Allocates a plain-data 2D camera over a `viewportWidth` x `viewportHeight` surface. The camera
// starts centered on world origin at zoom 1 with no rotation; `options` overrides any of `x`, `y`,
// `zoom`, `rotation`. This is the only allocating function in the package — every other operation
// writes into an `out` parameter.
export function createCamera2D(
  viewportWidth: number,
  viewportHeight: number,
  options?: Readonly<Camera2DOptions>,
): Camera2D {
  const out = allocateEntity<Camera2D>();
  out.rotation = options?.rotation ?? 0;
  out.viewportHeight = viewportHeight;
  out.viewportWidth = viewportWidth;
  out.x = options?.x ?? 0;
  out.y = options?.y ?? 0;
  out.zoom = options?.zoom ?? 1;
  return finishEntity(out);
}
