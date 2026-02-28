import type { DisplayObject, DisplayObjectType, PartialWithData } from '@flighthq/types';

import { createDisplayObject } from '../createDisplayObject';

export type PrimitiveDataFactory<D extends object> = (obj?: Partial<D>, defaults?: D) => D;

export function createPrimitive<T extends DisplayObject, D extends object>(
  type: DisplayObjectType,
  obj?: PartialWithData<T>,
  createPrimitiveData?: PrimitiveDataFactory<D>,
): T {
  const base = createDisplayObject(obj) as T;
  if (createPrimitiveData !== undefined) {
    base.data = createPrimitiveData(obj?.data as Partial<D>);
  }
  base.type = type;
  return base;
}
