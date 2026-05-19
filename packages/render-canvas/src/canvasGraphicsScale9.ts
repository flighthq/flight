import type { RectangleLike, ShapeCommand } from '@flighthq/types';

export interface Scale9Mapper {
  mapX(x: number): number;
  mapY(y: number): number;
}

/**
 * Builds a coordinate mapper for 9-slice scaled rendering.
 * Returns null if scale9Grid cannot be applied (zero/negative scale, degenerate bounds).
 *
 * Caller is responsible for ensuring the canvas transform has the object's own
 * scaleX/scaleY removed (leaving only parent scale + translation) before drawing.
 */
export function buildScale9Mapper(
  commands: readonly ShapeCommand[],
  scale9Grid: Readonly<RectangleLike>,
  scaleX: number,
  scaleY: number,
): Scale9Mapper | null {
  if (scaleX <= 0 || scaleY <= 0) return null;

  const bounds = computeCommandsBounds(commands);
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) return null;

  const { width: bw, height: bh } = bounds;
  const gx = scale9Grid.x;
  const gy = scale9Grid.y;
  const gw = scale9Grid.width;
  const gh = scale9Grid.height;

  return {
    mapX: (x: number) => toScale9Position(x, gx, gw, bw, scaleX),
    mapY: (y: number) => toScale9Position(y, gy, gh, bh, scaleY),
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Maps a local coordinate to its 9-slice-scaled position.
 * Port of OpenFL's CanvasGraphics.hx `toScale9Position`.
 */
function toScale9Position(
  pos: number,
  scale9Start: number,
  scale9Center: number,
  unscaledSize: number,
  scale: number,
): number {
  const scale9End = unscaledSize - scale9Center - scale9Start;
  const size = unscaledSize * scale;
  const center = size - scale9Start - scale9End;

  if (pos <= scale9Start) {
    if (center < 0) {
      return (pos * (scale9Start + scale9End + center)) / (scale9Start + scale9End);
    }
    return pos;
  }

  if (pos >= scale9Start + scale9Center) {
    if (center < 0) {
      return (
        ((scale9Start + (pos - scale9Start - scale9Center)) * (scale9Start + scale9End + center)) /
        (scale9Start + scale9End)
      );
    }
    return scale9Start + center + (pos - scale9Start - scale9Center);
  }

  if (center < 0) {
    return (scale9Start * (scale9Start + scale9End + center)) / (scale9Start + scale9End);
  }
  return scale9Start + (center * (pos - scale9Start)) / scale9Center;
}

/**
 * Computes an axis-aligned bounding box from shape commands.
 * Uses endpoints and control points as a conservative over-estimate of bezier extents.
 */
function computeCommandsBounds(commands: readonly ShapeCommand[]): { width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function expand(x: number, y: number): void {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'moveTo':
      case 'lineTo':
        expand(cmd.x, cmd.y);
        break;
      case 'curveTo':
        expand(cmd.controlX, cmd.controlY);
        expand(cmd.anchorX, cmd.anchorY);
        break;
      case 'cubicCurveTo':
        expand(cmd.controlX1, cmd.controlY1);
        expand(cmd.controlX2, cmd.controlY2);
        expand(cmd.anchorX, cmd.anchorY);
        break;
      case 'drawCircle':
        expand(cmd.x - cmd.radius, cmd.y - cmd.radius);
        expand(cmd.x + cmd.radius, cmd.y + cmd.radius);
        break;
      case 'drawEllipse':
      case 'drawRect':
      case 'drawRoundRect':
        expand(cmd.x, cmd.y);
        expand(cmd.x + cmd.width, cmd.y + cmd.height);
        break;
      case 'drawPath': {
        let di = 0;
        for (const pc of cmd.commands) {
          switch (pc) {
            case 1: // MOVE_TO
            case 2: // LINE_TO
              expand(cmd.data[di], cmd.data[di + 1]);
              di += 2;
              break;
            case 3: // CURVE_TO
              expand(cmd.data[di], cmd.data[di + 1]);
              expand(cmd.data[di + 2], cmd.data[di + 3]);
              di += 4;
              break;
            case 4: // WIDE_MOVE_TO
            case 5: // WIDE_LINE_TO
              expand(cmd.data[di + 2], cmd.data[di + 3]);
              di += 4;
              break;
            case 6: // CUBIC_CURVE_TO
              expand(cmd.data[di], cmd.data[di + 1]);
              expand(cmd.data[di + 2], cmd.data[di + 3]);
              expand(cmd.data[di + 4], cmd.data[di + 5]);
              di += 6;
              break;
            default:
              break;
          }
        }
        break;
      }
    }
  }

  if (!isFinite(minX)) return null;
  return { width: maxX - minX, height: maxY - minY };
}
