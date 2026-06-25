import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import type { BoundsNodeAny, PartialNode, Rectangle, Shape, ShapeData, ShapeRuntime } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

export function clearShapeCommands(shape: Shape): void {
  shape.data.commands.length = 0;
  invalidateShapeGeometry(shape);
}

export function computeShapeLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNodeAny>): void {
  const shape = source as unknown as Shape;
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

export function copyShapeCommands(out: Shape, source: Readonly<Shape>): void {
  out.data.commands.length = 0;
  out.data.commands.push(...source.data.commands);
  invalidateShapeGeometry(out);
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
  return createDisplayObjectRuntime({ computeLocalBoundsRectangle: computeShapeLocalBoundsRectangle }) as ShapeRuntime;
}

// Returns the tight local bounding rectangle for the shape's command stream, writing into `out`.
// This is a public allocation-explicit wrapper over computeShapeLocalBoundsRectangle that spares
// callers from reaching through the runtime. `out` may alias the shape if needed (the shape is
// read-only here).
export function getShapeBounds(out: Rectangle, source: Readonly<Shape>): void {
  computeShapeLocalBoundsRectangle(out, source);
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
  return getDisplayObjectRuntime(source) as ShapeRuntime;
}

// A shape's payload defines both its drawn surface and its extent, so any command change bumps
// content (re-rasterize) and local bounds (re-measure) together. Call after mutating
// shape.data.commands directly; the append*/clear/copy helpers call it for you.
export function invalidateShapeGeometry(shape: Shape): void {
  invalidateNodeLocalContent(shape);
  invalidateNodeLocalBounds(shape);
}

// True when the shape has no drawing commands in its command stream.
export function isShapeEmpty(source: Readonly<Shape>): boolean {
  return source.data.commands.length === 0;
}
