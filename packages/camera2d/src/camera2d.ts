import type { Camera2D, Camera2DOptions } from '@flighthq/types';

// Allocates a plain-data 2D camera over a `viewportWidth` x `viewportHeight` surface. The camera
// starts centered on world origin at zoom 1 with no rotation; `options` overrides any of `x`, `y`,
// `zoom`, `rotation`. This is the only allocating function in the package — every other operation
// writes into an `out` parameter.
export function createCamera2D(
  viewportWidth: number,
  viewportHeight: number,
  options?: Readonly<Camera2DOptions>,
): Camera2D {
  return {
    rotation: options?.rotation ?? 0,
    viewportHeight,
    viewportWidth,
    x: options?.x ?? 0,
    y: options?.y ?? 0,
    zoom: options?.zoom ?? 1,
  };
}
