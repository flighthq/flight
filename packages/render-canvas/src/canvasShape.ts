import { createNullRendererData } from '@flighthq/render-core';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Graphics,
  Shape,
  ShapeCommand,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasShape(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Shape;
  const { commands } = source.data.graphics;
  if (commands.length === 0) return;

  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  renderGraphicsToCanvas(context, source.data.graphics);
}

export function renderGraphicsToCanvas(ctx: CanvasRenderingContext2D, graphics: Graphics): void {
  renderShapeCommandsToCanvas(ctx, graphics.commands);
}

export const defaultCanvasShapeRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasShape,
  drawMask: drawCanvasShape,
};

function renderShapeCommandsToCanvas(ctx: CanvasRenderingContext2D, commands: readonly ShapeCommand[]): void {
  let hasFill = false;
  let hasStroke = false;
  let hasPendingPath = false;
  let fillStyle = '';
  let strokeStyle = '';
  let strokeWidth = 1;

  ctx.beginPath();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'beginFill':
        if (hasPendingPath && (hasFill || hasStroke)) {
          flushPath(ctx, hasFill, fillStyle, hasStroke, strokeStyle, strokeWidth);
          hasPendingPath = false;
        }
        hasFill = cmd.alpha >= 0.005;
        if (hasFill) {
          fillStyle = rgbaString(cmd.color, cmd.alpha);
        }
        break;

      case 'endFill':
        if (hasPendingPath) {
          flushPath(ctx, hasFill, fillStyle, hasStroke, strokeStyle, strokeWidth);
          hasPendingPath = false;
        }
        hasFill = false;
        break;

      case 'lineStyle':
        hasStroke = cmd.thickness > 0;
        if (hasStroke) {
          strokeStyle = rgbaString(cmd.color, cmd.alpha);
          strokeWidth = cmd.thickness;
        }
        break;

      case 'moveTo':
        ctx.moveTo(cmd.x, cmd.y);
        hasPendingPath = true;
        break;

      case 'lineTo':
        ctx.lineTo(cmd.x, cmd.y);
        hasPendingPath = true;
        break;

      case 'curveTo':
        ctx.quadraticCurveTo(cmd.controlX, cmd.controlY, cmd.anchorX, cmd.anchorY);
        hasPendingPath = true;
        break;

      case 'cubicCurveTo':
        ctx.bezierCurveTo(cmd.controlX1, cmd.controlY1, cmd.controlX2, cmd.controlY2, cmd.anchorX, cmd.anchorY);
        hasPendingPath = true;
        break;

      case 'drawCircle':
        ctx.moveTo(cmd.x + cmd.radius, cmd.y);
        ctx.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2, true);
        hasPendingPath = true;
        break;

      case 'drawEllipse': {
        const cx = cmd.x + cmd.width / 2;
        const cy = cmd.y + cmd.height / 2;
        ctx.moveTo(cmd.x + cmd.width, cy);
        ctx.ellipse(cx, cy, cmd.width / 2, cmd.height / 2, 0, 0, Math.PI * 2);
        hasPendingPath = true;
        break;
      }

      case 'drawRect':
        ctx.rect(cmd.x, cmd.y, cmd.width, cmd.height);
        hasPendingPath = true;
        break;

      case 'drawRoundRect': {
        const rx = Math.min(cmd.ellipseWidth / 2, cmd.width / 2);
        const ry = Math.min(cmd.ellipseHeight / 2, cmd.height / 2);
        const radius = Math.min(rx, ry);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, radius);
        } else {
          ctx.rect(cmd.x, cmd.y, cmd.width, cmd.height);
        }
        hasPendingPath = true;
        break;
      }
    }
  }

  if (hasPendingPath && (hasFill || hasStroke)) {
    flushPath(ctx, hasFill, fillStyle, hasStroke, strokeStyle, strokeWidth);
  }
}

function flushPath(
  ctx: CanvasRenderingContext2D,
  hasFill: boolean,
  fillStyle: string,
  hasStroke: boolean,
  strokeStyle: string,
  strokeWidth: number,
): void {
  if (hasFill) {
    ctx.fillStyle = fillStyle;
    ctx.fill('evenodd');
  }
  if (hasStroke) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.beginPath();
}

function rgbaString(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
