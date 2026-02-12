import type { DisplayObject, Transform } from '@flighthq/types';

// Constructor

export function create(obj: Partial<Transform> = {}, displayObject: DisplayObject): Transform {
  const defaults: Transform = {};

  const _obj: Transform = { ...defaults, ...obj };
  // _obj.displayObject = displayObject;
  return _obj;
}
