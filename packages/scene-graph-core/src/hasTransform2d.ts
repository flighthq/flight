import type { HasTransform2D, HasTransform2DRuntime, MethodsOf } from '@flighthq/types';

export function initHasTransform2D(target: HasTransform2D, obj?: Readonly<Partial<HasTransform2D>>): void {
  target.rotation = obj?.rotation ?? 0;
  target.scaleX = obj?.scaleX ?? 1;
  target.scaleY = obj?.scaleY ?? 1;
  target.x = obj?.x ?? 0;
  target.y = obj?.y ?? 0;
}

export function initHasTransform2DRuntime(
  target: HasTransform2DRuntime,
  _methods?: Readonly<Partial<MethodsOf<HasTransform2DRuntime>>>,
): void {
  target.localTransform2D = null;
  target.rotationAngle = 0;
  target.rotationCosine = 1;
  target.rotationSine = 0;
  target.worldTransform2D = null;
}
