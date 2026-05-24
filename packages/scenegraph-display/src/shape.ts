import type { PartialNode, Shape, ShapeData, ShapeRuntime } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function clearShapeCommands(data: ShapeData): void {
  data.commands.length = 0;
}

export function copyShapeCommands(source: ShapeData, target: ShapeData): void {
  target.commands.length = 0;
  target.commands.push(...source.commands);
}

export function createShape(obj?: Readonly<PartialNode<Shape>>): Shape {
  return createDisplayObjectGeneric(ShapeKind, obj, createShapeData, createShapeRuntime) as Shape;
}

export function createShapeData(data?: Readonly<Partial<ShapeData>>): ShapeData {
  return {
    commands: data?.commands ?? [],
  };
}

export function createShapeRuntime(): ShapeRuntime {
  return createDisplayObjectRuntime() as ShapeRuntime;
}

export function getShapeRuntime(source: Readonly<Shape>): Readonly<ShapeRuntime> {
  return getDisplayObjectRuntime(source) as ShapeRuntime;
}
