import type { DisplayObject, PartialWithData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export type DisplayObjectDataFactory<D extends object> = (obj?: Partial<D>, defaults?: D) => D;

export function createPrimitive<T extends DisplayObject, D extends object>(
  kind: symbol,
  obj?: PartialWithData<T>,
  createDisplayObjectData?: DisplayObjectDataFactory<D>,
): T {
  const base = createDisplayObject(obj) as T;
  if (createDisplayObjectData !== undefined) {
    base.data = createDisplayObjectData(obj?.data as Partial<D>);
  }
  base.kind = kind;
  return base;
}
