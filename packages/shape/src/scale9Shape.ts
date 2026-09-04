import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createNode2D, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  EntityConstruction,
  PartialNode,
  RectangleLike,
  Scale9Shape,
  Scale9ShapeData,
  Scale9ShapeRuntime,
} from '@flighthq/types/contract';
import { Scale9ShapeKind } from '@flighthq/types/contract';

import { createShapeRuntime } from './shape';

export function createScale9Shape(
  scale9Grid: Readonly<RectangleLike>,
  obj?: Readonly<PartialNode<Scale9Shape>>,
): Scale9Shape {
  return createNode2D(
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
  const out = allocateEntity<Scale9ShapeData>();
  initializeScale9ShapeData(out, scale9Grid, data);
  return finishEntity(out);
}

export function createScale9ShapeRuntime(): Scale9ShapeRuntime {
  return createShapeRuntime() as Scale9ShapeRuntime;
}

export function getScale9ShapeRuntime(source: Readonly<Scale9Shape>): Readonly<Scale9ShapeRuntime> {
  return getNode2DRuntime(source) as Scale9ShapeRuntime;
}

export function initializeScale9ShapeData(
  out: EntityConstruction<Scale9ShapeData>,
  scale9Grid: Readonly<RectangleLike>,
  data?: Readonly<Partial<Scale9ShapeData>>,
): void {
  out.commands = data?.commands ?? [];
  out.scale9Grid = scale9Grid;
}
