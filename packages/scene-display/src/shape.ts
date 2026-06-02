import type { PartialNode, Rectangle, SceneNode, Shape, ShapeData, ShapeRuntime } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function clearShapeCommands(data: ShapeData): void {
  data.commands.length = 0;
  data.version++;
}

export function computeShapeLocalBoundsRectangle(out: Rectangle, source: Readonly<SceneNode>): void {
  const shape = source as Shape;
  const commands = shape.data.commands;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let strokeWidth = 0;
  let penX = 0;
  let penY = 0;

  function expand(x: number, y: number): void {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  function quadPoint(t: number, p0: number, p1: number, p2: number): number {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const b = i + 2;

    switch (key) {
      case 'drawRectangle':
      case 'drawRoundRectangle': {
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
      case 'moveTo': {
        penX = commands[b] as number;
        penY = commands[b + 1] as number;
        break;
      }
      case 'lineTo': {
        const x = commands[b] as number;
        const y = commands[b + 1] as number;
        expand(penX, penY);
        expand(x, y);
        penX = x;
        penY = y;
        break;
      }
      case 'curveTo': {
        const controlX = commands[b] as number;
        const controlY = commands[b + 1] as number;
        const anchorX = commands[b + 2] as number;
        const anchorY = commands[b + 3] as number;
        expand(penX, penY);
        // Expand by quadratic bezier extrema (t where derivative = 0)
        const denomX = penX - 2 * controlX + anchorX;
        if (denomX !== 0) {
          const tx = (penX - controlX) / denomX;
          if (tx > 0 && tx < 1) expand(quadPoint(tx, penX, controlX, anchorX), quadPoint(tx, penY, controlY, anchorY));
        }
        const denomY = penY - 2 * controlY + anchorY;
        if (denomY !== 0) {
          const ty = (penY - controlY) / denomY;
          if (ty > 0 && ty < 1) expand(quadPoint(ty, penX, controlX, anchorX), quadPoint(ty, penY, controlY, anchorY));
        }
        expand(anchorX, anchorY);
        penX = anchorX;
        penY = anchorY;
        break;
      }
      case 'cubicCurveTo': {
        const control1X = commands[b] as number;
        const control1Y = commands[b + 1] as number;
        const control2X = commands[b + 2] as number;
        const control2Y = commands[b + 3] as number;
        const anchorX = commands[b + 4] as number;
        const anchorY = commands[b + 5] as number;
        expand(penX, penY);
        expand(control1X, control1Y);
        expand(control2X, control2Y);
        expand(anchorX, anchorY);
        penX = anchorX;
        penY = anchorY;
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
              penX = data[di];
              penY = data[di + 1];
              di += 2;
              break;
            case 2: // LINE_TO
              expand(penX, penY);
              expand(data[di], data[di + 1]);
              penX = data[di];
              penY = data[di + 1];
              di += 2;
              break;
            case 3: // CURVE_TO
              expand(penX, penY);
              expand(data[di], data[di + 1]);
              expand(data[di + 2], data[di + 3]);
              penX = data[di + 2];
              penY = data[di + 3];
              di += 4;
              break;
            case 4: // WIDE_MOVE_TO
              penX = data[di + 2];
              penY = data[di + 3];
              di += 4;
              break;
            case 5: // WIDE_LINE_TO
              expand(penX, penY);
              expand(data[di + 2], data[di + 3]);
              penX = data[di + 2];
              penY = data[di + 3];
              di += 4;
              break;
            case 6: // CUBIC_CURVE_TO
              expand(penX, penY);
              expand(data[di], data[di + 1]);
              expand(data[di + 2], data[di + 3]);
              expand(data[di + 4], data[di + 5]);
              penX = data[di + 4];
              penY = data[di + 5];
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
  target.version++;
}

export function createShape(obj?: Readonly<PartialNode<Shape>>): Shape {
  return createDisplayObjectGeneric(ShapeKind, obj, createShapeData, createShapeRuntime) as Shape;
}

export function createShapeData(data?: Readonly<Partial<ShapeData>>): ShapeData {
  return {
    commands: data?.commands ?? [],
    version: data?.version ?? 0,
  };
}

export function createShapeRuntime(): ShapeRuntime {
  return createDisplayObjectRuntime({ computeLocalBoundsRect: computeShapeLocalBoundsRectangle }) as ShapeRuntime;
}

export function getShapeRuntime(source: Readonly<Shape>): Readonly<ShapeRuntime> {
  return getDisplayObjectRuntime(source) as ShapeRuntime;
}
