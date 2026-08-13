import { invalidateContent } from '@flighthq/node/contract';
import { createNode2D, createNode2DRuntime, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  BoundsNodeAny,
  MethodsOf,
  MorphShape,
  PartialNode,
  Rectangle,
  Shape,
  ShapeBoundsMode,
  ShapeData,
  ShapeRuntime,
} from '@flighthq/types/contract';
import { MorphShapeKind, ShapeKind } from '@flighthq/types/contract';

import { computeShapeBoundsRectangle } from './shapeBounds';
import { getShapeBoundsCommandRegistryRevision } from './shapeBoundsRegistry';

export function clearShapeCommands(shape: Shape): void {
  shape.data.commands.length = 0;
  if (shape.kind === MorphShapeKind) (shape as MorphShape).data.paintBindings.length = 0;
  invalidateContent(shape);
}

export function computeShapeLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNodeAny>): void {
  getShapeBounds(out, source as unknown as Shape, 'ink');
}

export function copyShapeCommands(out: Shape, source: Readonly<Shape>): void {
  const commands = out.data.commands;
  const sourceCommands = source.data.commands;
  // Copied element by element rather than by spreading into push: a spread passes one argument per
  // command, and a command stream is as long as its authored artwork, so imported vector art overflows
  // the engine's argument limit. Aliased `out` is a no-op copy, not a self-clear followed by a read of
  // what was just cleared.
  if (commands !== sourceCommands) {
    commands.length = sourceCommands.length;
    for (let i = 0; i < sourceCommands.length; i++) commands[i] = sourceCommands[i];
  }
  if (out.kind === MorphShapeKind) (out as MorphShape).data.paintBindings.length = 0;
  invalidateContent(out);
}

export function createShape(obj?: Readonly<PartialNode<Shape>>): Shape {
  return createNode2D(ShapeKind, obj, createShapeData, createShapeRuntime) as Shape;
}

export function createShapeData(data?: Readonly<Partial<ShapeData>>): ShapeData {
  return {
    commands: data?.commands ?? [],
  };
}

export function createShapeRuntime(): ShapeRuntime {
  const runtime = createNode2DRuntime(defaultMethods) as ShapeRuntime;
  runtime.shapeBoundsCommandRegistryRevision = -1;
  return runtime;
}

export function getShapeBounds(out: Rectangle, source: Readonly<Shape>, mode: ShapeBoundsMode = 'ink'): boolean {
  const complete = computeShapeBoundsRectangle(out, source, mode);
  const runtime = getNode2DRuntime(source) as ShapeRuntime;
  runtime.shapeBoundsCommandRegistryRevision = getShapeBoundsCommandRegistryRevision();
  return complete;
}

// Returns the number of drawing commands in the shape's command stream.
export function getShapeCommandCount(source: Readonly<Shape>): number {
  const commands = source.data.commands;
  let count = 0;
  let i = 0;
  while (i < commands.length) {
    const argCount = commands[i + 1] as number;
    count++;
    i += argCount + 2;
  }
  return count;
}

export function getShapeRuntime(source: Readonly<Shape>): Readonly<ShapeRuntime> {
  return getNode2DRuntime(source) as ShapeRuntime;
}

// True when the shape has no drawing commands in its command stream.
export function isShapeEmpty(source: Readonly<Shape>): boolean {
  return source.data.commands.length === 0;
}

function isShapeLocalBoundsRectangleValid(source: Readonly<BoundsNodeAny>): boolean {
  const runtime = getNode2DRuntime(source as unknown as Shape) as ShapeRuntime;
  return runtime.shapeBoundsCommandRegistryRevision === getShapeBoundsCommandRegistryRevision();
}

const defaultMethods: Partial<MethodsOf<ShapeRuntime> & Pick<ShapeRuntime, 'isLocalBoundsRectangleValid'>> = {
  computeLocalBoundsRectangle: computeShapeLocalBoundsRectangle,
  isLocalBoundsRectangleValid: isShapeLocalBoundsRectangleValid,
};
