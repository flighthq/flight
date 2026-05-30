import type { RectangleLike } from '@flighthq/types';

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
  commands: readonly unknown[],
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
function computeCommandsBounds(commands: readonly unknown[]): { width: number; height: number } | null {
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

  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;

    // args begin at i+2 (after key and argCount)
    switch (key) {
      case 'moveTo':
      case 'lineTo':
        expand(commands[i + 2] as number, commands[i + 3] as number);
        break;
      case 'curveTo':
        expand(commands[i + 2] as number, commands[i + 3] as number);
        expand(commands[i + 4] as number, commands[i + 5] as number);
        break;
      case 'cubicCurveTo':
        expand(commands[i + 2] as number, commands[i + 3] as number);
        expand(commands[i + 4] as number, commands[i + 5] as number);
        expand(commands[i + 6] as number, commands[i + 7] as number);
        break;
      case 'drawCircle': {
        const cx = commands[i + 2] as number;
        const cy = commands[i + 3] as number;
        const r = commands[i + 4] as number;
        expand(cx - r, cy - r);
        expand(cx + r, cy + r);
        break;
      }
      case 'drawEllipse':
      case 'drawRectangle':
        expand(commands[i + 2] as number, commands[i + 3] as number);
        expand(
          (commands[i + 2] as number) + (commands[i + 4] as number),
          (commands[i + 3] as number) + (commands[i + 5] as number),
        );
        break;
      case 'drawRoundRectangle':
        expand(commands[i + 2] as number, commands[i + 3] as number);
        expand(
          (commands[i + 2] as number) + (commands[i + 4] as number),
          (commands[i + 3] as number) + (commands[i + 5] as number),
        );
        break;
      case 'drawPath': {
        const pathCmds = commands[i + 2] as number[];
        const data = commands[i + 3] as number[];
        let di = 0;
        for (const pc of pathCmds) {
          switch (pc) {
            case 1: // MOVE_TO
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
            default:
              break;
          }
        }
        break;
      }
    }

    i += argCount + 2;
  }

  if (!isFinite(minX)) return null;
  return { width: maxX - minX, height: maxY - minY };
}
