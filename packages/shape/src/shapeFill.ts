import type { Path, PathWinding, ShapeCommandToken, ShapeFillRegion } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Resolves a Shape's drawing-command stream into solid-fill regions for the GPU fill path: each
// `beginFill … endFill` (or the next fill) span becomes one `ShapeFillRegion` whose `path` carries the
// geometry (primitives expanded to MOVE/LINE/CURVE verbs, curves kept for the renderer to flatten).
//
// Returns `null` when the shape is NOT expressible as plain solid fills — any gradient/bitmap fill or
// any stroke (lineStyle) present — so the caller falls back to the raster path. This keeps the GPU path
// to the case it handles exactly (the "jagged circle" fix) without regressing gradients, bitmap fills,
// or strokes.
export function getShapeFillRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  if (hasNonSolidShapeFill(commands)) return null;

  const regions: ShapeFillRegion[] = [];
  let path: Path | null = null;
  let color = 0;
  let alpha = 1;
  let winding: PathWinding = 'nonZero';
  let startX = 0;
  let startY = 0;

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
        winding = 'nonZero';
        path = { commands: [], data: [], winding };
        break;
      }
      case 'endFill': {
        if (path !== null && path.commands.length > 0) regions.push({ path, color, alpha });
        path = null;
        break;
      }
      case 'moveTo': {
        if (path === null) break;
        startX = commands[a] as number;
        startY = commands[a + 1] as number;
        pushVerb(path, PathCommand.MOVE_TO, startX, startY);
        break;
      }
      case 'lineTo': {
        if (path === null) break;
        pushVerb(path, PathCommand.LINE_TO, commands[a] as number, commands[a + 1] as number);
        break;
      }
      case 'curveTo': {
        if (path === null) break;
        pushQuadratic(
          path,
          commands[a] as number,
          commands[a + 1] as number,
          commands[a + 2] as number,
          commands[a + 3] as number,
        );
        break;
      }
      case 'cubicCurveTo': {
        if (path === null) break;
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
      }
      case 'drawCircle': {
        if (path === null) break;
        appendEllipseToPath(
          path,
          commands[a] as number,
          commands[a + 1] as number,
          commands[a + 2] as number,
          commands[a + 2] as number,
        );
        break;
      }
      case 'drawEllipse': {
        if (path === null) break;
        const w = commands[a + 2] as number;
        const h = commands[a + 3] as number;
        appendEllipseToPath(path, (commands[a] as number) + w / 2, (commands[a + 1] as number) + h / 2, w / 2, h / 2);
        break;
      }
      case 'drawRectangle': {
        if (path === null) break;
        appendRectangleToPath(
          path,
          commands[a] as number,
          commands[a + 1] as number,
          commands[a + 2] as number,
          commands[a + 3] as number,
        );
        break;
      }
      case 'drawRoundRectangle': {
        if (path === null) break;
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
      }
      case 'drawPath': {
        if (path === null) break;
        path.winding = commands[a + 2] as PathWinding;
        appendRawPath(path, commands[a] as readonly number[], commands[a + 1] as readonly number[]);
        break;
      }
      // Non-geometry styling commands (lineStyle, begin*Fill variants) are handled by the
      // hasNonSolidShapeFill guard above or are no-ops for solid fills.
      default:
        break;
    }
  }

  if (path !== null && path.commands.length > 0) regions.push({ path, color, alpha });
  return regions;
}

// True if the command stream uses any fill or stroke the GPU solid-fill path cannot express.
export function hasNonSolidShapeFill(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    const argCount = commands[i + 1] as number;
    if (
      name === 'beginGradientFill' ||
      name === 'beginBitmapFill' ||
      name === 'lineStyle' ||
      name === 'lineGradientStyle' ||
      name === 'lineBitmapStyle'
    ) {
      return true;
    }
    if (name === 'drawTriangles' && commands[i + 2 + 2] !== null) {
      return true;
    }
    i += 2 + argCount;
  }
  return false;
}

const KAPPA = 0.5522847498307936;

function appendEllipseToPath(path: Path, cx: number, cy: number, rx: number, ry: number): void {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
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
    const args = verb === PathCommand.CUBIC_CURVE_TO ? 6 : verb === PathCommand.CURVE_TO ? 4 : 2;
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
