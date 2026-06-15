import { noopRendererData } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  MatrixLike,
  Scale9Mapper,
  Scale9Shape,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { buildScale9Mapper } from './canvasScale9Mapper';
import { renderCanvasShapeCommands } from './canvasShape';
import { setCanvasTransform } from './canvasTransform';

const _remappedCommands: unknown[] = [];
const _remappedPathData: number[] = [];

export function drawCanvasScale9Shape(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;

  const { scaleX, scaleY } = source;
  const mapper = buildScale9Mapper(commands, scale9Grid, scaleX, scaleY);

  if (mapper === null) {
    setCanvasTransform(state, context, renderNode.transform2D);
    renderCanvasShapeCommands(context, commands);
  } else {
    applyStrippedTransform(state, context, renderNode.transform2D, scaleX, scaleY);
    mapCanvasScale9ShapeCommands(_remappedCommands, commands, mapper);
    renderCanvasShapeCommands(context, _remappedCommands);
  }
}

export function mapCanvasScale9ShapeCommands(out: unknown[], source: readonly unknown[], mapper: Scale9Mapper): void {
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

export const defaultCanvasScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasScale9Shape,
};

function applyStrippedTransform(
  state: CanvasRenderState,
  context: CanvasRenderingContext2D,
  t: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  if (state.roundPixels) {
    context.setTransform(a, b, c, d, Math.fround(t.tx), Math.fround(t.ty));
  } else {
    context.setTransform(a, b, c, d, t.tx, t.ty);
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
