import type { PartialWithData, Shape, ShapeData } from '@flighthq/types';

import { createPrimitive } from './internal/createPrimitive';

export function createShape(obj?: PartialWithData<Shape>): Shape {
  return createPrimitive<Shape, ShapeData>('shape', obj, createShapeData);
}

export function createShapeData(data?: Partial<ShapeData>): ShapeData {
  return {
    graphics: data?.graphics ?? {},
  };
}
