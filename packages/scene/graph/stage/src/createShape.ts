import { type PartialWithData, type Shape, type ShapeData,ShapeKind } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

export function createShape(obj?: PartialWithData<Shape>): Shape {
  return createPrimitive<Shape, ShapeData>(ShapeKind, obj, createShapeData);
}

export function createShapeData(data?: Partial<ShapeData>): ShapeData {
  return {
    graphics: data?.graphics ?? {},
  };
}
