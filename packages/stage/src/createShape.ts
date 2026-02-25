import type { PartialWithData, Shape, ShapeData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createShape(obj: PartialWithData<Shape> = {}): Shape {
  if (obj.data === undefined) obj.data = {} as ShapeData;
  if (obj.data.graphics === undefined) obj.data.graphics = {};
  if (obj.type === undefined) obj.type = 'shape';
  return createDisplayObject(obj) as Shape;
}
