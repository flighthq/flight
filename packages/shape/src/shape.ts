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
  let strokeHalf = 0;
  let penX = 0;
  let penY = 0;

  function expand(x: number, y: number): void {
    const lo_x = x - strokeHalf;
    const hi_x = x + strokeHalf;
    const lo_y = y - strokeHalf;
    const hi_y = y + strokeHalf;
    if (lo_x < minX) minX = lo_x;
    if (lo_y < minY) minY = lo_y;
    if (hi_x > maxX) maxX = hi_x;
    if (hi_y > maxY) maxY = hi_y;
  }

  function quadPoint(t: number, p0: number, p1: number, p2: number): number {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  function cubicPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  // Solve the quadratic at² + bt + c = 0 for roots in (0, 1) and expand the cubic at those t values.
  function expandCubicExtrema(
    p0x: number,
    p0y: number,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number,
    p3x: number,
    p3y: number,
  ): void {
    expandCubicAxis(p0x, p1x, p2x, p3x, p0y, p1y, p2y, p3y);
    expandCubicAxis(p0y, p1y, p2y, p3y, p0x, p1x, p2x, p3x);
  }

  function expandCubicAxis(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    q0: number,
    q1: number,
    q2: number,
    q3: number,
  ): void {
    // Derivative: 3[(-p0+3p1-3p2+p3)t² + 2(p0-2p1+p2)t + (-p0+p1)]
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const c = -p0 + p1;

    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) {
        const t = -c / b;
        if (t > 0 && t < 1) expand(cubicPoint(t, p0, p1, p2, p3), cubicPoint(t, q0, q1, q2, q3));
      }
      return;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return;
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b + sqrtDisc) / (2 * a);
    const t2 = (-b - sqrtDisc) / (2 * a);
    if (t1 > 0 && t1 < 1) expand(cubicPoint(t1, p0, p1, p2, p3), cubicPoint(t1, q0, q1, q2, q3));
    if (t2 > 0 && t2 < 1) expand(cubicPoint(t2, p0, p1, p2, p3), cubicPoint(t2, q0, q1, q2, q3));
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
        expand(anchorX, anchorY);
        expandCubicExtrema(penX, penY, control1X, control1Y, control2X, control2Y, anchorX, anchorY);
        penX = anchorX;
        penY = anchorY;
        break;
      }
      case 'lineStyle': {
        strokeHalf = (commands[b] as number) / 2;
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
            case 3: {
              // CURVE_TO
              const qcx = data[di];
              const qcy = data[di + 1];
              const qax = data[di + 2];
              const qay = data[di + 3];
              expand(penX, penY);
              const qdx = penX - 2 * qcx + qax;
              if (qdx !== 0) {
                const qt = (penX - qcx) / qdx;
                if (qt > 0 && qt < 1) expand(quadPoint(qt, penX, qcx, qax), quadPoint(qt, penY, qcy, qay));
              }
              const qdy = penY - 2 * qcy + qay;
              if (qdy !== 0) {
                const qt = (penY - qcy) / qdy;
                if (qt > 0 && qt < 1) expand(quadPoint(qt, penX, qcx, qax), quadPoint(qt, penY, qcy, qay));
              }
              expand(qax, qay);
              penX = qax;
              penY = qay;
              di += 4;
              break;
            }
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
            case 6: {
              // CUBIC_CURVE_TO
              expand(penX, penY);
              const ax = data[di + 4];
              const ay = data[di + 5];
              expand(ax, ay);
              expandCubicExtrema(penX, penY, data[di], data[di + 1], data[di + 2], data[di + 3], ax, ay);
              penX = ax;
              penY = ay;
              di += 6;
              break;
            }
          }
        }
        break;
      }
      case 'drawTriangles': {
        const vertices = commands[b] as number[];
        for (let vi = 0; vi < vertices.length; vi += 2) {
          expand(vertices[vi], vertices[vi + 1]);
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
    out.x = minX;
    out.y = minY;
    out.width = maxX - minX;
    out.height = maxY - minY;
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
