import { createNullRendererData } from '@flighthq/render-core';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Matrix3x2Like,
  Scale9Shape,
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

export function remapScale9Commands(commands: unknown[], mapper: Scale9Mapper): unknown[] {
  const result: unknown[] = [];
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;

    switch (key) {
      case 'moveTo':
        result.push('moveTo', 2, mapper.mapX(commands[i + 2] as number), mapper.mapY(commands[i + 3] as number));
        break;
      case 'lineTo':
        result.push('lineTo', 2, mapper.mapX(commands[i + 2] as number), mapper.mapY(commands[i + 3] as number));
        break;
      case 'curveTo':
        result.push(
          'curveTo',
          4,
          mapper.mapX(commands[i + 2] as number),
          mapper.mapY(commands[i + 3] as number),
          mapper.mapX(commands[i + 4] as number),
          mapper.mapY(commands[i + 5] as number),
        );
        break;
      case 'cubicCurveTo':
        result.push(
          'cubicCurveTo',
          6,
          mapper.mapX(commands[i + 2] as number),
          mapper.mapY(commands[i + 3] as number),
          mapper.mapX(commands[i + 4] as number),
          mapper.mapY(commands[i + 5] as number),
          mapper.mapX(commands[i + 6] as number),
          mapper.mapY(commands[i + 7] as number),
        );
        break;
      case 'drawRect': {
        const x = commands[i + 2] as number;
        const y = commands[i + 3] as number;
        const w = commands[i + 4] as number;
        const h = commands[i + 5] as number;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result.push('drawRect', 4, mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my);
        break;
      }
      case 'drawRoundRect': {
        const x = commands[i + 2] as number;
        const y = commands[i + 3] as number;
        const w = commands[i + 4] as number;
        const h = commands[i + 5] as number;
        const eW = commands[i + 6] as number;
        const eH = commands[i + 7] as number;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result.push('drawRoundRect', 6, mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my, eW, eH);
        break;
      }
      case 'drawEllipse': {
        const x = commands[i + 2] as number;
        const y = commands[i + 3] as number;
        const w = commands[i + 4] as number;
        const h = commands[i + 5] as number;
        const mx = mapper.mapX(x);
        const my = mapper.mapY(y);
        result.push('drawEllipse', 4, mx, my, mapper.mapX(x + w) - mx, mapper.mapY(y + h) - my);
        break;
      }
      case 'drawCircle':
        result.push(
          'drawCircle',
          3,
          mapper.mapX(commands[i + 2] as number),
          mapper.mapY(commands[i + 3] as number),
          commands[i + 4],
        );
        break;
      case 'drawPath': {
        const pathCmds = commands[i + 2] as number[];
        const pathData = commands[i + 3] as number[];
        const winding = commands[i + 4];
        result.push('drawPath', 3, pathCmds, remapPathData(pathCmds, pathData, mapper), winding);
        break;
      }
      default:
        for (let j = 0; j < argCount + 2; j++) result.push(commands[i + j]);
        break;
    }

    i += argCount + 2;
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
