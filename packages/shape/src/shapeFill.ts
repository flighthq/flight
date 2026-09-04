import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { CIRCLE_KAPPA } from '@flighthq/math/contract';
import type { Path, PathWinding, ShapeCommandToken, ShapeFillRegion } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

// Appends one shape geometry command (moveTo/lineTo/curveTo/cubicCurveTo and the drawCircle/Ellipse/
// Rectangle/RoundRectangle/Path primitives) onto `path`, expanding primitives into MOVE/LINE/CURVE
// verbs (curves kept for the renderer to flatten). Shared by the fill-region and stroke-region walkers
// so both expand geometry identically. Non-geometry command names are ignored (a no-op). `a` is the
// index of the command's first argument in `commands`.
export function appendShapeGeometryCommand(
  path: Path,
  name: string,
  commands: readonly ShapeCommandToken[],
  a: number,
): void {
  switch (name) {
    case 'moveTo':
      pushVerb(path, PathCommand.MOVE_TO, commands[a] as number, commands[a + 1] as number);
      break;
    case 'lineTo':
      pushVerb(path, PathCommand.LINE_TO, commands[a] as number, commands[a + 1] as number);
      break;
    case 'curveTo':
      pushQuadratic(
        path,
        commands[a] as number,
        commands[a + 1] as number,
        commands[a + 2] as number,
        commands[a + 3] as number,
      );
      break;
    case 'cubicCurveTo':
      pushCubic(
        path,
        commands[a] as number,
        commands[a + 1] as number,
        commands[a + 2] as number,
        commands[a + 3] as number,
        commands[a + 4] as number,
        commands[a + 5] as number,
      );
      break;
    case 'drawCircle':
      appendEllipseToPath(
        path,
        commands[a] as number,
        commands[a + 1] as number,
        commands[a + 2] as number,
        commands[a + 2] as number,
      );
      break;
    case 'drawEllipse': {
      const w = commands[a + 2] as number;
      const h = commands[a + 3] as number;
      appendEllipseToPath(path, (commands[a] as number) + w / 2, (commands[a + 1] as number) + h / 2, w / 2, h / 2);
      break;
    }
    case 'drawRectangle':
      appendRectangleToPath(
        path,
        commands[a] as number,
        commands[a + 1] as number,
        commands[a + 2] as number,
        commands[a + 3] as number,
      );
      break;
    case 'drawRoundRectangle':
      appendRoundRectangleToPath(
        path,
        commands[a] as number,
        commands[a + 1] as number,
        commands[a + 2] as number,
        commands[a + 3] as number,
        (commands[a + 4] as number) / 2,
        (commands[a + 5] as number) / 2,
      );
      break;
    case 'drawPath':
      path.winding = commands[a + 2] as PathWinding;
      appendRawPath(path, commands[a] as readonly number[], commands[a + 1] as readonly number[]);
      break;
    default:
      break;
  }
}

// The number of `data` numbers a PathCommand verb consumes: MOVE_TO/LINE_TO = 2, CURVE_TO (quadratic)
// and WIDE_MOVE_TO/WIDE_LINE_TO = 4, CUBIC_CURVE_TO = 6, CLOSE/NO_OP = 0. The one place that maps a raw
// Path verb to its operand width, so a verb/data stream (appendRawPath) and a closure scan
// (shapeStroke) walk it without desynchronizing the data cursor.
export function getPathCommandOperandCount(verb: number): number {
  switch (verb) {
    case PathCommand.MOVE_TO:
    case PathCommand.LINE_TO:
      return 2;
    case PathCommand.CURVE_TO:
    case PathCommand.WIDE_MOVE_TO:
    case PathCommand.WIDE_LINE_TO:
      return 4;
    case PathCommand.CUBIC_CURVE_TO:
      return 6;
    default: // CLOSE, NO_OP
      return 0;
  }
}

// Resolves a Shape's drawing-command stream into solid-fill regions for the GPU fill path: each
// `beginFill … endFill` (or the next fill) span becomes one `ShapeFillRegion` whose `path` carries the
// geometry (primitives expanded to MOVE/LINE/CURVE verbs, curves kept for the renderer to flatten).
//
// Returns `null` when the fills are not expressible as plain solid regions (gradient/texture fills or
// textured triangles). Stroke styles are independent: callers that render both layers resolve them
// through `getShapeStrokeRegions` and fall back when either layer returns `null`.
export function getShapeFillRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  if (hasNonSolidShapeFill(commands)) return null;

  const regions: ShapeFillRegion[] = [];
  let path: Path | null = null;
  let color = 0;
  let alpha = 1;
  const winding: PathWinding = 'nonZero';

  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const a = i + 2;
    i = a + argCount;

    switch (name) {
      case 'beginFill': {
        if (path !== null && path.commands.length > 0) regions.push({ path, color, alpha });
        color = commands[a] as number;
        alpha = commands[a + 1] as number;
        path = (() => {
          const out = allocateEntity<Path>();
          out.commands = [] as number[];
          out.data = [] as number[];
          out.winding = winding;
          return finishEntity(out);
        })();
        break;
      }
      case 'endFill': {
        if (path !== null && path.commands.length > 0) regions.push({ path, color, alpha });
        path = null;
        break;
      }
      default:
        // Geometry verbs (moveTo/lineTo/curve/primitives) append to the active path; non-geometry
        // styling commands (lineStyle, begin*Fill variants) are handled above / by the guard.
        if (path !== null) appendShapeGeometryCommand(path, name, commands, a);
        break;
    }
  }

  if (path !== null && path.commands.length > 0) regions.push({ path, color, alpha });
  return regions;
}

// True if the command stream uses a fill the GPU solid-fill path cannot express.
export function hasNonSolidShapeFill(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    const argCount = commands[i + 1] as number;
    if (name === 'beginGradientFill' || name === 'beginTextureFill') {
      return true;
    }
    if (name === 'drawTriangles' && commands[i + 2 + 2] !== null) {
      return true;
    }
    i += 2 + argCount;
  }
  return false;
}

// True if the command stream declares any fill (solid, gradient, or bitmap). Consumers can distinguish
// stroke-only Shape streams without rebuilding fill geometry.
export function hasShapeFill(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    if (name === 'beginFill' || name === 'beginGradientFill' || name === 'beginTextureFill') return true;
    i += 2 + (commands[i + 1] as number);
  }
  return false;
}

function appendEllipseToPath(path: Path, cx: number, cy: number, rx: number, ry: number): void {
  const kx = rx * CIRCLE_KAPPA;
  const ky = ry * CIRCLE_KAPPA;
  pushVerb(path, PathCommand.MOVE_TO, cx + rx, cy);
  pushCubic(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
  pushCubic(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
  pushCubic(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
  pushCubic(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
}

// Appends a raw Path verb/data stream (from a `drawPath` command) onto `path` unchanged.
function appendRawPath(path: Path, verbs: readonly number[], data: readonly number[]): void {
  let d = 0;
  for (let v = 0; v < verbs.length; v++) {
    const verb = verbs[v];
    // Per-verb operand width — CLOSE/NO_OP consume 0 and WIDE_* consume 4, so a CLOSE or wide verb
    // followed by another subpath keeps the data cursor aligned (assuming 2 for all-but-curves did not).
    const args = getPathCommandOperandCount(verb);
    path.commands.push(verb);
    for (let k = 0; k < args; k++) path.data.push(data[d + k]);
    d += args;
  }
}

function appendRectangleToPath(path: Path, x: number, y: number, w: number, h: number): void {
  pushVerb(path, PathCommand.MOVE_TO, x, y);
  pushVerb(path, PathCommand.LINE_TO, x + w, y);
  pushVerb(path, PathCommand.LINE_TO, x + w, y + h);
  pushVerb(path, PathCommand.LINE_TO, x, y + h);
  pushVerb(path, PathCommand.LINE_TO, x, y);
}

function appendRoundRectangleToPath(
  path: Path,
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  ry: number,
): void {
  const right = x + w;
  const bottom = y + h;
  pushVerb(path, PathCommand.MOVE_TO, x + rx, y);
  pushVerb(path, PathCommand.LINE_TO, right - rx, y);
  pushQuadratic(path, right, y, right, y + ry);
  pushVerb(path, PathCommand.LINE_TO, right, bottom - ry);
  pushQuadratic(path, right, bottom, right - rx, bottom);
  pushVerb(path, PathCommand.LINE_TO, x + rx, bottom);
  pushQuadratic(path, x, bottom, x, bottom - ry);
  pushVerb(path, PathCommand.LINE_TO, x, y + ry);
  pushQuadratic(path, x, y, x + rx, y);
}

function pushCubic(path: Path, c1x: number, c1y: number, c2x: number, c2y: number, ax: number, ay: number): void {
  path.commands.push(PathCommand.CUBIC_CURVE_TO);
  path.data.push(c1x, c1y, c2x, c2y, ax, ay);
}

function pushQuadratic(path: Path, cx: number, cy: number, ax: number, ay: number): void {
  path.commands.push(PathCommand.CURVE_TO);
  path.data.push(cx, cy, ax, ay);
}

function pushVerb(path: Path, verb: number, x: number, y: number): void {
  path.commands.push(verb);
  path.data.push(x, y);
}
