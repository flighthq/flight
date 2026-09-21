import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Camera2D, Camera2DOptions, EntityConstruction } from '@flighthq/types/contract';

// Allocates a plain-data 2D camera. The camera starts centered on world origin at zoom 1 with no
// rotation; `options` overrides any of `x`, `y`, `zoom`, `rotation`. This is the only allocating
// function in the package — every other operation writes into an `out` parameter.
export function createCamera2D(options?: Readonly<Camera2DOptions>): Camera2D {
  const out = allocateEntity<Camera2D>();
  initializeCamera2D(out, options);
  return finishEntity(out);
}

export function initializeCamera2D(out: EntityConstruction<Camera2D>, options?: Readonly<Camera2DOptions>): void {
  out.rotation = options?.rotation ?? 0;
  out.x = options?.x ?? 0;
  out.y = options?.y ?? 0;
  out.zoom = options?.zoom ?? 1;
}

// Centers the camera on a world position. The simplest camera operation — the named verb reads
// better than bare `camera.x = x; camera.y = y` because it names the intent.
export function setCamera2DLookAt(camera: Camera2D, x: number, y: number): void {
  camera.x = x;
  camera.y = y;
}
