import type { PartialWithData, Shape, ShapeData } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createShape(obj?: Readonly<PartialWithData<Shape>>): Shape {
  return createDisplayObjectGeneric(ShapeKind, obj, createShapeData) as Shape;
}

export function createShapeData(data?: Readonly<Partial<ShapeData>>): ShapeData {
  return {
    graphics: data?.graphics ?? {},
  };
}
