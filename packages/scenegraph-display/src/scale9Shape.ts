import type { PartialNode, RectangleLike, Scale9Shape, Scale9ShapeData } from '@flighthq/types';
import { Scale9ShapeKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createScale9Shape(
  scale9Grid: Readonly<RectangleLike>,
  obj?: Readonly<PartialNode<Scale9Shape>>,
): Scale9Shape {
  return createDisplayObjectGeneric(Scale9ShapeKind, obj as Readonly<PartialNode<Scale9Shape>>, (data) =>
    createScale9ShapeData(scale9Grid, data),
  ) as Scale9Shape;
}

export function createScale9ShapeData(
  scale9Grid: Readonly<RectangleLike>,
  data?: Readonly<Partial<Scale9ShapeData>>,
): Scale9ShapeData {
  return {
    commands: data?.commands ?? [],
    scale9Grid,
  };
}
