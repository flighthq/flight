import { createQuaternion, createVector3 } from '@flighthq/geometry';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/types';

export function initTransform3DRuntimeTrait(target: HasTransform3DRuntime): void {
  target.localMatrix4 = null;
  target.localMatrix4Detached = false;
  target.worldMatrix4 = null;
}

export function initTransform3DTrait(target: HasTransform3D, obj?: Readonly<Partial<HasTransform3D>>): void {
  target.rotation = obj?.rotation ?? createQuaternion();
  target.scale = obj?.scale ?? createVector3(1, 1, 1);
  target.position = obj?.position ?? createVector3();
}
