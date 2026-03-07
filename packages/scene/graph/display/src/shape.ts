import { DisplayObjectType, type PartialWithData, type Shape, type ShapeData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createShape(obj?: PartialWithData<Shape>): Shape {
  return createPrimitive(DisplayObjectType.Shape, obj, createShapeData) as Shape;
}

export function createShapeData(data?: Partial<ShapeData>): ShapeData {
  return {
    graphics: data?.graphics ?? {},
  };
}
