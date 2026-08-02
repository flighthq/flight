import type { Scale9Mapper, ShapeCommandToken } from '@flighthq/types/contract';

// Rewrites a shape's command stream through a nine-slice mapper, so the corners of a scaled shape keep
// their size while the edges and centre stretch. This is pure command geometry — no renderer, no
// context — which is why it lives beside the commands rather than in the backend that happens to
// rasterize the result: every backend that supports nine-slice needs the same rewrite.
//
// `out` may be `source`, in which case the rewrite is in place.
export function mapScale9ShapeCommands(
  out: ShapeCommandToken[],
  source: readonly ShapeCommandToken[],
  mapper: Scale9Mapper,
): void {
  if (out !== (source as unknown[])) {
    out.length = source.length;
    for (let k = 0; k < source.length; k++) out[k] = source[k];
  }

  let i = 0;
  while (i < out.length) {
    const key = out[i] as string;
    const argCount = out[i + 1] as number;

    switch (key) {
      case 'moveTo':
      case 'lineTo':
        out[i + 2] = mapper.mapX(out[i + 2] as number);
        out[i + 3] = mapper.mapY(out[i + 3] as number);
        break;
      case 'curveTo':
        out[i + 2] = mapper.mapX(out[i + 2] as number);
        out[i + 3] = mapper.mapY(out[i + 3] as number);
        out[i + 4] = mapper.mapX(out[i + 4] as number);
        out[i + 5] = mapper.mapY(out[i + 5] as number);
        break;
      case 'cubicCurveTo':
        out[i + 2] = mapper.mapX(out[i + 2] as number);
        out[i + 3] = mapper.mapY(out[i + 3] as number);
        out[i + 4] = mapper.mapX(out[i + 4] as number);
        out[i + 5] = mapper.mapY(out[i + 5] as number);
        out[i + 6] = mapper.mapX(out[i + 6] as number);
        out[i + 7] = mapper.mapY(out[i + 7] as number);
        break;
      case 'drawRectangle':
      case 'drawEllipse': {
        const x = out[i + 2] as number;
        const y = out[i + 3] as number;
        const w = out[i + 4] as number;
        const h = out[i + 5] as number;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        out[i + 2] = mx;
        out[i + 3] = my;
        out[i + 4] = mapper.mapX(x + w) - mx;
        out[i + 5] = mapper.mapY(y + h) - my;
        break;
      }
      case 'drawRoundRectangle': {
        const x = out[i + 2] as number;
        const y = out[i + 3] as number;
        const w = out[i + 4] as number;
        const h = out[i + 5] as number;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        out[i + 2] = mx;
        out[i + 3] = my;
        out[i + 4] = mapper.mapX(x + w) - mx;
        out[i + 5] = mapper.mapY(y + h) - my;
        break;
      }
      case 'drawCircle':
        out[i + 2] = mapper.mapX(out[i + 2] as number);
        out[i + 3] = mapper.mapY(out[i + 3] as number);
        break;
      case 'drawPath':
        remapPathData(_remappedPathData, out[i + 3] as readonly number[], out[i + 2] as readonly number[], mapper);
        out[i + 3] = _remappedPathData;
        break;
    }

    i += argCount + 2;
  }
}

function remapPathData(out: number[], source: readonly number[], cmds: readonly number[], mapper: Scale9Mapper): void {
  if (out !== (source as number[])) {
    out.length = source.length;
    for (let k = 0; k < source.length; k++) out[k] = source[k];
  }
  let di = 0;
  for (const pc of cmds) {
    switch (pc) {
      case 1: // MOVE_TO [x, y]
      case 2: // LINE_TO [x, y]
        out[di] = mapper.mapX(out[di]);
        out[di + 1] = mapper.mapY(out[di + 1]);
        di += 2;
        break;
      case 3: // CURVE_TO [cx, cy, ax, ay]
        out[di] = mapper.mapX(out[di]);
        out[di + 1] = mapper.mapY(out[di + 1]);
        out[di + 2] = mapper.mapX(out[di + 2]);
        out[di + 3] = mapper.mapY(out[di + 3]);
        di += 4;
        break;
      case 4: // WIDE_MOVE_TO [?, ?, x, y]
      case 5: // WIDE_LINE_TO [?, ?, x, y]
        out[di + 2] = mapper.mapX(out[di + 2]);
        out[di + 3] = mapper.mapY(out[di + 3]);
        di += 4;
        break;
      case 6: // CUBIC_CURVE_TO [cx1, cy1, cx2, cy2, ax, ay]
        out[di] = mapper.mapX(out[di]);
        out[di + 1] = mapper.mapY(out[di + 1]);
        out[di + 2] = mapper.mapX(out[di + 2]);
        out[di + 3] = mapper.mapY(out[di + 3]);
        out[di + 4] = mapper.mapX(out[di + 4]);
        out[di + 5] = mapper.mapY(out[di + 5]);
        di += 6;
        break;
      default:
        break;
    }
  }
}

const _remappedPathData: number[] = [];
