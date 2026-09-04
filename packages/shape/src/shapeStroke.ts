import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Path,
  ShapeCommandToken,
  ShapeStrokeRegion,
  StrokeStyle,
} from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

import { appendShapeGeometryCommand } from './shapeFill';

// Resolves each solid lineStyle span into its authored centerline + stroke style. The backend-neutral
// tessellateStrokePath consumer turns that pair into non-overlapping triangles for both open strokes and
// hollow closed rings. Keeping the centerline here also lets a renderer reject pathological geometry
// with the tessellator's null sentinel and preserve the Shape's Canvas raster fallback.
//
// Returns null only for gradient/bitmap strokes, which the solid mesh path cannot express. Geometry
// without an active lineStyle never reaches a centerline and cannot force a fallback.
export function getShapeStrokeRegions(commands: readonly ShapeCommandToken[]): ShapeStrokeRegion[] | null {
  if (hasNonSolidShapeStroke(commands)) return null;

  const regions: ShapeStrokeRegion[] = [];
  let centerline: Path | null = null;
  let style: StrokeStyle | null = null;
  let color = 0;
  let alpha = 1;
  let penX = 0;
  let penY = 0;

  const flush = (): void => {
    if (style === null || centerline === null || centerline.commands.length === 0) return;
    regions.push({ path: centerline, style, color, alpha });
  };

  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const a = i + 2;
    i = a + argCount;

    if (name === 'lineStyle') {
      flush();
      const thickness = commands[a] as number;
      if (thickness > 0) {
        color = commands[a + 1] as number;
        alpha = commands[a + 2] as number;
        const caps = commands[a + 5] as string;
        const joints = commands[a + 6] as string;
        style = {
          width: thickness,
          // Shape's CapsStyle 'none' is StrokeStyle's butt cap; round/square pass through.
          cap: caps === 'none' ? 'butt' : (caps as StrokeStyle['cap']),
          join: joints as StrokeStyle['join'],
          miterLimit: commands[a + 7] as number,
        };
        centerline = (() => {
          const out = allocateEntity<unknown>();
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
        // A span whose first geometry is a lineTo/curve starts from the current pen, matching Canvas.
        if (centerline.commands.length === 0 && name !== 'moveTo') {
          centerline.commands.push(PathCommand.MOVE_TO);
          centerline.data.push(penX, penY);
        }
        appendShapeGeometryCommand(centerline, name, commands, a);
      }
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
  }
  flush();
  return regions;
}

export function hasNonSolidShapeStroke(commands: readonly ShapeCommandToken[]): boolean {
  let i = 0;
  while (i < commands.length) {
    const name = commands[i] as string;
    if (name === 'lineGradientStyle' || name === 'lineTextureStyle') return true;
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
