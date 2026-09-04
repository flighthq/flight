import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Path,
  ShapeCommandToken,
  ShapeFillRegion,
  StrokeStyle,
} from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

import { compactStrokePath } from './compactStrokePath';
import { appendShapeGeometryCommand, getPathCommandOperandCount } from './shapeFill';

// Resolves a Shape's drawing-command stream into stroke OUTLINE regions for the GPU fill path: each
// `lineStyle` span's centerline geometry is offset by the compact open-stroke kernel (real
// miter/bevel/round joins, butt/round/square caps, and dashing), emitted as a
// `ShapeFillRegion` so the renderer tessellates + fills it with the same flat-color mesh path solid
// fills use. This replaces the offscreen Canvas-2D raster-to-texture stroke fallback with
// GPU-tessellated, resolution-independent geometry (sharp when scaled, no per-shape offscreen cost,
// and no bounds-clipped miter spikes) without retaining the larger closed-ring validation kernel.
//
// Returns `null` when the shape uses a stroke the direct-fill outline route cannot express, so the
// caller falls back to the raster path: a gradient/bitmap stroke (non-solid color), or a CLOSED stroke.
// A closed stroke offsets into a hollow RING, and the tessellator fills each contour solid with no hole
// subtraction, so a ring can't be direct-filled — only an OPEN stroke's outline is a simple fillable
// polygon. Closure is decided geometrically on the accumulated centerline (a CLOSE verb, or a subpath
// whose end returns to its start — which covers self-closing rect/ellipse/circle/round-rect primitives,
// `appendShapePolygon`, a manual return-to-start polyline, and a `drawPath` carrying either), so it is
// stroke-span-aware: only geometry drawn under an active `lineStyle` reaches a centerline, so an
// unstroked closed primitive never forces the fallback. Solid open strokes only; the backend's
// explicit stroke-path-tessellation feature owns the closed-ring strip route.
export function getShapeStrokeOutlineRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  if (hasNonSolidShapeStroke(commands)) return null;

  const regions: ShapeFillRegion[] = [];
  let centerline: Path | null = null; // accumulated centerline for the active stroke span
  let style: StrokeStyle | null = null;
  let color = 0;
  let alpha = 1;
  let penX = 0;
  let penY = 0;
  let deferred = false; // a stroked span closed into a ring the direct-fill route can't express

  const flush = (): void => {
    if (style === null || centerline === null || centerline.commands.length === 0) return;
    if (isCenterlineClosed(centerline)) {
      deferred = true;
      return;
    }
    const outline = compactStrokePath(centerline, style);
    if (outline.commands.length > 0) regions.push({ path: outline, color, alpha });
  };

  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const a = i + 2;
    i = a + argCount;

    if (name === 'lineStyle') {
      // A new stroke style ends the previous span's outline and opens a fresh centerline.
      flush();
      const thickness = commands[a] as number;
      if (thickness > 0) {
        color = commands[a + 1] as number;
        alpha = commands[a + 2] as number;
        const caps = commands[a + 5] as string;
        const joints = commands[a + 6] as string;
        style = {
          width: thickness,
          // Shape's CapsStyle 'none' is Canvas/`strokeStyle`'s 'butt'; round/square pass through.
          cap: caps === 'none' ? 'butt' : (caps as StrokeStyle['cap']),
          join: joints as StrokeStyle['join'],
          miterLimit: commands[a + 7] as number,
        };
        centerline = (() => {
          const out = allocateEntity<Path>();
          out.commands = [] as number[];
          out.data = [] as number[];
          out.winding = 'nonZero' as const;
          return finishEntity(out);
        })();
      } else {
        style = null;
        centerline = null;
      }
    } else if (isShapeGeometryCommand(name)) {
      if (centerline !== null) {
        // A span whose first geometry is a lineTo/curve (no leading moveTo) begins from the current pen
        // position, matching Canvas 2D stroking the running path.
        if (centerline.commands.length === 0 && name !== 'moveTo') {
          centerline.commands.push(PathCommand.MOVE_TO);
          centerline.data.push(penX, penY);
        }
        appendShapeGeometryCommand(centerline, name, commands, a);
      }
      // Track the pen off the polyline verbs so the next span can seed from it (primitives self-start).
      if (name === 'moveTo' || name === 'lineTo') {
        penX = commands[a] as number;
        penY = commands[a + 1] as number;
      } else if (name === 'curveTo') {
        penX = commands[a + 2] as number;
        penY = commands[a + 3] as number;
      } else if (name === 'cubicCurveTo') {
        penX = commands[a + 4] as number;
        penY = commands[a + 5] as number;
      }
    }
    // Fill-style + other non-geometry commands do not affect the stroke centerline.
  }
  flush();
  return deferred ? null : regions;
}

// True if the stream uses a stroke the GPU outline path cannot express (a gradient or bitmap stroke),
// so the caller must fall back to the raster path. A solid `lineStyle` is expressible.
function hasNonSolidShapeStroke(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    if (name === 'lineGradientStyle' || name === 'lineTextureStyle') return true;
    i += 2 + (commands[i + 1] as number);
  }
  return false;
}

// True if the centerline encloses a region — a CLOSE verb, or any subpath whose end returns to its
// start (≥2 segments so it bounds area). Such a stroke offsets into a hollow ring the direct-fill
// tessellator cannot express, so the caller defers the whole shape to raster. Walks the verb/data
// stream with getPathCommandOperandCount so CLOSE/WIDE verbs keep the data cursor aligned.
function isCenterlineClosed(path: Readonly<Path>): boolean {
  const { commands, data } = path;
  let d = 0;
  let subStartX = 0;
  let subStartY = 0;
  let lastX = 0;
  let lastY = 0;
  let segments = 0;
  const subpathReturnsToStart = (): boolean =>
    segments >= 2 && Math.abs(lastX - subStartX) < CLOSE_EPSILON && Math.abs(lastY - subStartY) < CLOSE_EPSILON;
  for (let c = 0; c < commands.length; c++) {
    const verb = commands[c];
    if (verb === PathCommand.CLOSE) return true;
    const n = getPathCommandOperandCount(verb);
    if (verb === PathCommand.MOVE_TO || verb === PathCommand.WIDE_MOVE_TO) {
      if (subpathReturnsToStart()) return true;
      // A WIDE_MOVE_TO's real endpoint is its trailing (x,y) pair; MOVE_TO's is its only pair.
      lastX = subStartX = data[d + n - 2];
      lastY = subStartY = data[d + n - 1];
      segments = 0;
    } else if (n >= 2) {
      // The endpoint of LINE/CURVE/CUBIC/WIDE_LINE is its trailing (x,y) pair.
      lastX = data[d + n - 2];
      lastY = data[d + n - 1];
      segments++;
    }
    d += n;
  }
  return subpathReturnsToStart();
}

function isShapeGeometryCommand(name: string): boolean {
  return (
    name === 'moveTo' ||
    name === 'lineTo' ||
    name === 'curveTo' ||
    name === 'cubicCurveTo' ||
    name === 'drawCircle' ||
    name === 'drawEllipse' ||
    name === 'drawRectangle' ||
    name === 'drawRoundRectangle' ||
    name === 'drawPath'
  );
}

// Endpoint-coincidence tolerance for return-to-start closure. Authored primitives (rect/ellipse) and
// polygons re-emit their start coordinate exactly, so this only absorbs trivial float noise.
const CLOSE_EPSILON = 1e-6;
