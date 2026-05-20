import { createNullRendererData } from '@flighthq/render-core';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Matrix3x2Like,
  Scale9Shape,
  ShapeCommand,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { buildScale9Mapper, type Scale9Mapper } from './canvasScale9Mapper';
import { renderCanvasShapeCommands } from './canvasShape';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasScale9Shape(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  const ctx = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  ctx.globalAlpha = renderNode.alpha;

  const { scaleX, scaleY } = source;
  const mapper = buildScale9Mapper(commands, scale9Grid, scaleX, scaleY);

  if (mapper === null) {
    setCanvasTransform(state, ctx, renderNode.transform2D);
    renderCanvasShapeCommands(ctx, commands);
  } else {
    applyStrippedTransform(state, ctx, renderNode.transform2D, scaleX, scaleY);
    renderCanvasShapeCommands(ctx, remapScale9Commands(commands, mapper));
  }
}

export function remapScale9Commands(commands: ShapeCommand[], mapper: Scale9Mapper): ShapeCommand[] {
  const result: ShapeCommand[] = new Array(commands.length);
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    switch (cmd.key) {
      case 'moveTo':
        result[i] = { key: 'moveTo', args: [mapper.mapX(cmd.args[0]), mapper.mapY(cmd.args[1])] };
        break;
      case 'lineTo':
        result[i] = { key: 'lineTo', args: [mapper.mapX(cmd.args[0]), mapper.mapY(cmd.args[1])] };
        break;
      case 'curveTo': {
        const [cx, cy, ax, ay] = cmd.args;
        result[i] = { key: 'curveTo', args: [mapper.mapX(cx), mapper.mapY(cy), mapper.mapX(ax), mapper.mapY(ay)] };
        break;
      }
      case 'cubicCurveTo': {
        const [cx1, cy1, cx2, cy2, ax, ay] = cmd.args;
        result[i] = {
          key: 'cubicCurveTo',
          args: [
            mapper.mapX(cx1),
            mapper.mapY(cy1),
            mapper.mapX(cx2),
            mapper.mapY(cy2),
            mapper.mapX(ax),
            mapper.mapY(ay),
          ],
        };
        break;
      }
      case 'drawRect': {
        const [x, y, w, h] = cmd.args;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result[i] = { key: 'drawRect', args: [mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my] };
        break;
      }
      case 'drawRoundRect': {
        const [x, y, w, h, eW, eH] = cmd.args;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result[i] = { key: 'drawRoundRect', args: [mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my, eW, eH] };
        break;
      }
      case 'drawEllipse': {
        const [x, y, w, h] = cmd.args;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result[i] = { key: 'drawEllipse', args: [mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my] };
        break;
      }
      case 'drawCircle': {
        const [x, y, r] = cmd.args;
        result[i] = { key: 'drawCircle', args: [mapper.mapX(x), mapper.mapY(y), r] };
        break;
      }
      case 'drawPath': {
        const [pathCmds, pathData, winding] = cmd.args;
        result[i] = { key: 'drawPath', args: [pathCmds, remapPathData(pathCmds, pathData, mapper), winding] };
        break;
      }
      default:
        result[i] = cmd;
    }
  }
  return result;
}

export const defaultCanvasScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasScale9Shape,
  drawMask: drawCanvasScale9Shape,
};

function applyStrippedTransform(
  state: CanvasRenderState,
  ctx: CanvasRenderingContext2D,
  t: Readonly<Matrix3x2Like>,
  scaleX: number,
  scaleY: number,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  if (state.roundPixels) {
    ctx.setTransform(a, b, c, d, Math.fround(t.tx), Math.fround(t.ty));
  } else {
    ctx.setTransform(a, b, c, d, t.tx, t.ty);
  }
}

function remapPathData(cmds: number[], data: number[], mapper: Scale9Mapper): number[] {
  const result: number[] = [];
  let di = 0;
  for (const pc of cmds) {
    switch (pc) {
      case 1: // MOVE_TO [x, y]
      case 2: // LINE_TO [x, y]
        result.push(mapper.mapX(data[di]), mapper.mapY(data[di + 1]));
        di += 2;
        break;
      case 3: // CURVE_TO [cx, cy, ax, ay]
        result.push(
          mapper.mapX(data[di]),
          mapper.mapY(data[di + 1]),
          mapper.mapX(data[di + 2]),
          mapper.mapY(data[di + 3]),
        );
        di += 4;
        break;
      case 4: // WIDE_MOVE_TO [?, ?, x, y]
      case 5: // WIDE_LINE_TO [?, ?, x, y]
        result.push(data[di], data[di + 1], mapper.mapX(data[di + 2]), mapper.mapY(data[di + 3]));
        di += 4;
        break;
      case 6: // CUBIC_CURVE_TO [cx1, cy1, cx2, cy2, ax, ay]
        result.push(
          mapper.mapX(data[di]),
          mapper.mapY(data[di + 1]),
          mapper.mapX(data[di + 2]),
          mapper.mapY(data[di + 3]),
          mapper.mapX(data[di + 4]),
          mapper.mapY(data[di + 5]),
        );
        di += 6;
        break;
      default:
        break;
    }
  }
  return result;
}
