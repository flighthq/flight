import { createDisplayObjectGeneric, getDisplayObjectRuntime } from '@flighthq/displayobject';
import type { PartialNode, RectangleLike, Scale9Shape, Scale9ShapeData, Scale9ShapeRuntime } from '@flighthq/types';
import { Scale9ShapeKind } from '@flighthq/types';

import { createShapeRuntime } from './shape';

export function createScale9Shape(
  scale9Grid: Readonly<RectangleLike>,
  obj?: Readonly<PartialNode<Scale9Shape>>,
): Scale9Shape {
  return createDisplayObjectGeneric(
    Scale9ShapeKind,
    obj as Readonly<PartialNode<Scale9Shape>>,
    (data) => createScale9ShapeData(scale9Grid, data),
    createScale9ShapeRuntime,
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

export function createScale9ShapeRuntime(): Scale9ShapeRuntime {
  return createShapeRuntime() as Scale9ShapeRuntime;
}

export function getScale9ShapeRuntime(source: Readonly<Scale9Shape>): Readonly<Scale9ShapeRuntime> {
  return getDisplayObjectRuntime(source) as Scale9ShapeRuntime;
}
