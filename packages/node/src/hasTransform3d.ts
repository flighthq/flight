import { cloneQuaternion, cloneVector3, createQuaternion, createVector3 } from '@flighthq/geometry/contract';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/types/contract';

export function initTransform3DRuntimeTrait(target: HasTransform3DRuntime): void {
  target.localMatrix4 = null;
  target.localMatrix4Detached = false;
  target.worldMatrix4 = null;
}

// The node owns its position/rotation/scale storage: values are copied out of `obj` rather than
// retained, so one options object can seed many nodes and later transform writes (which mutate these
// in place) never reach back into the caller's `Readonly` input. Mirrors the value semantics of the
// primitive-field 2D sibling.
export function initTransform3DTrait(target: HasTransform3D, obj?: Readonly<Partial<HasTransform3D>>): void {
  const position = obj?.position;
  const rotation = obj?.rotation;
  const scale = obj?.scale;
  target.position = position !== undefined ? cloneVector3(position) : createVector3();
  target.rotation = rotation !== undefined ? cloneQuaternion(rotation) : createQuaternion();
  target.scale = scale !== undefined ? cloneVector3(scale) : createVector3(1, 1, 1);
}
