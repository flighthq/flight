import { createMatrix4 } from '@flighthq/geometry';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/types';

export type { HasTransform3D, HasTransform3DRuntime, WorldTransform3DNode } from '@flighthq/types';

export function initTransform3DRuntimeTrait(target: HasTransform3DRuntime): void {
  target.worldMatrix = null;
}

export function initTransform3DTrait(target: HasTransform3D, obj?: Readonly<Partial<HasTransform3D>>): void {
  target.localMatrix = obj?.localMatrix ?? createMatrix4();
}
