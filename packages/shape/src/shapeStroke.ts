import { strokePath } from '@flighthq/path';
import type { Path, ShapeCommandToken, ShapeFillRegion, StrokeStyle } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { appendShapeGeometryCommand } from './shapeFill';

// Resolves a Shape's drawing-command stream into stroke OUTLINE regions for the GPU fill path: each
// `lineStyle` span's centerline geometry is offset into a fillable outline via `@flighthq/path`'s
// `strokePath` (real miter/bevel/round joins, butt/round/square caps, and dashing), emitted as a
// `ShapeFillRegion` so the renderer tessellates + fills it with the same flat-color mesh path solid
// fills use. This replaces the offscreen Canvas-2D raster-to-texture stroke fallback with
// GPU-tessellated, resolution-independent geometry (sharp when scaled, no per-shape offscreen cost,
// and no bounds-clipped miter spikes) — and is the first consumer of the otherwise-orphaned strokePath.
//
// Returns `null` when the shape uses a stroke the direct-fill outline route cannot express, so the
// caller falls back to the raster path: a gradient/bitmap stroke (non-solid color), or a CLOSED stroke
// (a self-closing rectangle/ellipse/circle/round-rect primitive). A closed stroke offsets into a
// hollow RING, and the tessellator fills each contour solid with no hole subtraction, so a ring can't
// be direct-filled — only an OPEN stroke's outline is a simple fillable polygon. Solid open strokes
// only; ring tessellation (a stroke-strip or stencil-cover route) is a later addition.
export function getShapeStrokeRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  if (hasNonSolidShapeStroke(commands) || hasClosedShapeStroke(commands)) return null;

  const regions: ShapeFillRegion[] = [];
  let centerline: Path | null = null; // accumulated centerline for the active stroke span
  let style: StrokeStyle | null = null;
  let color = 0;
  let alpha = 1;
  let penX = 0;
  let penY = 0;

  const flush = (): void => {
    if (style === null || centerline === null || centerline.commands.length === 0) return;
    const outline = strokePath(centerline, style);
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
        centerline = { commands: [], data: [], winding: 'nonZero' };
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
  return regions;
}

// True if the stream strokes a self-closing primitive (rectangle/ellipse/circle/round-rect). Such a
// stroke offsets into a hollow ring the direct-fill tessellator cannot express (see the header note),
// so the caller defers the whole shape to the raster path.
export function hasClosedShapeStroke(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    if (name === 'drawCircle' || name === 'drawEllipse' || name === 'drawRectangle' || name === 'drawRoundRectangle') {
      return true;
    }
    i += 2 + (commands[i + 1] as number);
  }
  return false;
}

// True if the stream uses a stroke the GPU outline path cannot express (a gradient or bitmap stroke),
// so the caller must fall back to the raster path. A solid `lineStyle` is expressible.
export function hasNonSolidShapeStroke(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    if (name === 'lineGradientStyle' || name === 'lineBitmapStyle') return true;
    i += 2 + (commands[i + 1] as number);
  }
  return false;
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
