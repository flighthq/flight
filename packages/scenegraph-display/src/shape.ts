import type { GraphNode, PartialNode, Rectangle, Shape, ShapeData, ShapeRuntime } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function clearShapeCommands(data: ShapeData): void {
  data.commands.length = 0;
}

export function computeShapeLocalBoundsRect(out: Rectangle, source: Readonly<GraphNode>): void {
  const shape = source as Shape;
  const commands = shape.data.commands;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let strokeWidth = 0;

  function expand(x: number, y: number): void {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const b = i + 2;

    switch (key) {
      case 'drawRect':
      case 'drawRoundRect': {
        const x = commands[b] as number;
        const y = commands[b + 1] as number;
        const w = commands[b + 2] as number;
        const h = commands[b + 3] as number;
        expand(x, y);
        expand(x + w, y + h);
        break;
      }
      case 'drawCircle': {
        const x = commands[b] as number;
        const y = commands[b + 1] as number;
        const r = commands[b + 2] as number;
        expand(x - r, y - r);
        expand(x + r, y + r);
        break;
      }
      case 'drawEllipse': {
        const x = commands[b] as number;
        const y = commands[b + 1] as number;
        const w = commands[b + 2] as number;
        const h = commands[b + 3] as number;
        expand(x, y);
        expand(x + w, y + h);
        break;
      }
      case 'moveTo':
      case 'lineTo': {
        expand(commands[b] as number, commands[b + 1] as number);
        break;
      }
      case 'curveTo': {
        expand(commands[b] as number, commands[b + 1] as number);
        expand(commands[b + 2] as number, commands[b + 3] as number);
        break;
      }
      case 'cubicCurveTo': {
        expand(commands[b] as number, commands[b + 1] as number);
        expand(commands[b + 2] as number, commands[b + 3] as number);
        expand(commands[b + 4] as number, commands[b + 5] as number);
        break;
      }
      case 'lineStyle': {
        strokeWidth = commands[b] as number;
        break;
      }
      case 'drawPath': {
        const pathCmds = commands[b] as number[];
        const data = commands[b + 1] as number[];
        let di = 0;
        for (const pc of pathCmds) {
          switch (pc) {
            case 1: // MOVE_TO
              expand(data[di], data[di + 1]);
              di += 2;
              break;
            case 2: // LINE_TO
              expand(data[di], data[di + 1]);
              di += 2;
              break;
            case 3: // CURVE_TO
              expand(data[di], data[di + 1]);
              expand(data[di + 2], data[di + 3]);
              di += 4;
              break;
            case 4: // WIDE_MOVE_TO
              expand(data[di + 2], data[di + 3]);
              di += 4;
              break;
            case 5: // WIDE_LINE_TO
              expand(data[di + 2], data[di + 3]);
              di += 4;
              break;
            case 6: // CUBIC_CURVE_TO
              expand(data[di], data[di + 1]);
              expand(data[di + 2], data[di + 3]);
              expand(data[di + 4], data[di + 5]);
              di += 6;
              break;
          }
        }
        break;
      }
    }

    i += argCount + 2;
  }

  if (minX === Infinity) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
  } else {
    const half = strokeWidth / 2;
    out.x = minX - half;
    out.y = minY - half;
    out.width = maxX - minX + strokeWidth;
    out.height = maxY - minY + strokeWidth;
  }
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
  return createDisplayObjectRuntime({ computeLocalBoundsRect: computeShapeLocalBoundsRect }) as ShapeRuntime;
}

export function getShapeRuntime(source: Readonly<Shape>): Readonly<ShapeRuntime> {
  return getDisplayObjectRuntime(source) as ShapeRuntime;
}
