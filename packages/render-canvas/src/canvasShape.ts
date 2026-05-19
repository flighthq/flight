import { matrix3x2 } from '@flighthq/geometry';
import { createNullRendererData } from '@flighthq/render-core';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Graphics,
  Matrix3x2,
  Shape,
  ShapeCommand,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { createBitmapPattern, createGradientPattern } from './canvasGraphicsPattern';
import { buildScale9Mapper, type Scale9Mapper } from './canvasGraphicsScale9';
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

  const scale9Grid = source.scale9Grid;
  const t = renderNode.transform2D;
  const scale9Mapper =
    scale9Grid !== null && t.b === 0 && t.c === 0
      ? buildScale9Mapper(commands, scale9Grid, source.scaleX, source.scaleY)
      : null;

  if (scale9Mapper !== null) {
    // Remove the object's own scaleX/scaleY from the canvas transform — the 9-slice
    // mapper handles scaling in coordinate space, keeping corners pixel-accurate.
    const parentScaleX = source.scaleX !== 0 ? t.a / source.scaleX : 1;
    const parentScaleY = source.scaleY !== 0 ? t.d / source.scaleY : 1;
    context.setTransform(parentScaleX, 0, 0, parentScaleY, t.tx, t.ty);
  } else {
    setCanvasTransform(state, context, t);
  }

  renderGraphicsToCanvas(context, source.data.graphics, scale9Mapper);
}

export function renderGraphicsToCanvas(
  ctx: CanvasRenderingContext2D,
  graphics: Graphics,
  scale9?: Scale9Mapper | null,
): void {
  // Two-pass: all fills first, then all strokes on top — matches Flash rendering order.
  playCommands(ctx, graphics.commands, false, scale9 ?? null);
  playCommands(ctx, graphics.commands, true, scale9 ?? null);
}

export const defaultCanvasShapeRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasShape,
  drawMask: drawCanvasShape,
};

function playCommands(
  ctx: CanvasRenderingContext2D,
  commands: readonly ShapeCommand[],
  strokePass: boolean,
  scale9: Scale9Mapper | null,
): void {
  const mapX = scale9 ? (x: number) => scale9.mapX(x) : (x: number) => x;
  const mapY = scale9 ? (y: number) => scale9.mapY(y) : (y: number) => y;

  let hasFill = false;
  let hasStroke = false;
  let hasPendingPath = false;
  let fillStyle: string | CanvasPattern | CanvasGradient = '';
  let strokeStyle: string | CanvasPattern | CanvasGradient = '';
  let strokeWidth = 1;
  let windingRule: CanvasFillRule = 'evenodd';
  let pendingFillMatrix: Matrix3x2 | null = null;
  let pendingFillMatrixInverse: Matrix3x2 | null = null;
  // Bitmap fill state — used for the drawRect drawImage optimization.
  let bitmapSrc: CanvasImageSource | null = null;
  let bitmapW = 0;
  let bitmapH = 0;

  ctx.beginPath();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'beginFill':
        if (hasPendingPath && (hasFill || hasStroke)) {
          flushPath(
            ctx,
            hasFill,
            fillStyle,
            pendingFillMatrix,
            pendingFillMatrixInverse,
            hasStroke,
            strokeStyle,
            strokeWidth,
            windingRule,
            strokePass,
          );
          hasPendingPath = false;
        }
        hasFill = cmd.alpha >= 0.005;
        fillStyle = !strokePass && hasFill ? rgbaString(cmd.color, cmd.alpha) : '';
        pendingFillMatrix = null;
        pendingFillMatrixInverse = null;
        bitmapSrc = null;
        break;

      case 'beginBitmapFill': {
        if (hasPendingPath && (hasFill || hasStroke)) {
          flushPath(
            ctx,
            hasFill,
            fillStyle,
            pendingFillMatrix,
            pendingFillMatrixInverse,
            hasStroke,
            strokeStyle,
            strokeWidth,
            windingRule,
            strokePass,
          );
          hasPendingPath = false;
        }
        if (!strokePass) {
          const pattern = createBitmapPattern(ctx, cmd.bitmap, cmd.repeat, cmd.smooth);
          hasFill = pattern !== null;
          fillStyle = pattern ?? '';
          pendingFillMatrix = cmd.matrix;
          pendingFillMatrixInverse = cmd.matrix !== null ? invertMatrix(cmd.matrix) : null;
          bitmapSrc = cmd.bitmap.src;
          bitmapW = cmd.bitmap.width;
          bitmapH = cmd.bitmap.height;
        } else {
          hasFill = true; // still track for flush boundaries
          fillStyle = '';
          pendingFillMatrix = null;
          pendingFillMatrixInverse = null;
          bitmapSrc = null;
        }
        break;
      }

      case 'beginGradientFill': {
        if (hasPendingPath && (hasFill || hasStroke)) {
          flushPath(
            ctx,
            hasFill,
            fillStyle,
            pendingFillMatrix,
            pendingFillMatrixInverse,
            hasStroke,
            strokeStyle,
            strokeWidth,
            windingRule,
            strokePass,
          );
          hasPendingPath = false;
        }
        if (!strokePass) {
          const pattern = createGradientPattern(
            ctx,
            cmd.gradientType,
            cmd.colors,
            cmd.alphas,
            cmd.ratios,
            cmd.matrix,
            cmd.spreadMethod,
            cmd.interpolationMethod,
            cmd.focalPointRatio,
          );
          hasFill = pattern !== null;
          fillStyle = pattern ?? '';
        } else {
          hasFill = true; // still track for flush boundaries
          fillStyle = '';
        }
        pendingFillMatrix = null;
        pendingFillMatrixInverse = null;
        bitmapSrc = null;
        break;
      }

      case 'endFill':
        if (hasPendingPath) {
          flushPath(
            ctx,
            hasFill,
            fillStyle,
            pendingFillMatrix,
            pendingFillMatrixInverse,
            hasStroke,
            strokeStyle,
            strokeWidth,
            windingRule,
            strokePass,
          );
          hasPendingPath = false;
        }
        hasFill = false;
        pendingFillMatrix = null;
        pendingFillMatrixInverse = null;
        bitmapSrc = null;
        break;

      case 'lineStyle':
        hasStroke = cmd.thickness > 0;
        if (hasStroke) {
          strokeWidth = cmd.thickness;
          if (strokePass) {
            strokeStyle = rgbaString(cmd.color, cmd.alpha);
            ctx.lineCap = cmd.caps === 'none' ? 'butt' : cmd.caps;
            ctx.lineJoin = cmd.joints;
            ctx.miterLimit = cmd.miterLimit;
          }
        }
        break;

      case 'lineBitmapStyle': {
        if (strokePass) {
          const pattern = createBitmapPattern(ctx, cmd.bitmap, cmd.repeat, cmd.smooth);
          if (pattern !== null) {
            strokeStyle = pattern;
            hasStroke = true;
          }
        } else {
          hasStroke = true; // track for flush boundaries
        }
        break;
      }

      case 'lineGradientStyle': {
        if (strokePass) {
          const pattern = createGradientPattern(
            ctx,
            cmd.gradientType,
            cmd.colors,
            cmd.alphas,
            cmd.ratios,
            cmd.matrix,
            cmd.spreadMethod,
            cmd.interpolationMethod,
            cmd.focalPointRatio,
          );
          if (pattern !== null) {
            strokeStyle = pattern;
            hasStroke = true;
          }
        } else {
          hasStroke = true; // track for flush boundaries
        }
        break;
      }

      case 'moveTo':
        ctx.moveTo(mapX(cmd.x), mapY(cmd.y));
        hasPendingPath = true;
        break;

      case 'lineTo':
        ctx.lineTo(mapX(cmd.x), mapY(cmd.y));
        hasPendingPath = true;
        break;

      case 'curveTo':
        ctx.quadraticCurveTo(mapX(cmd.controlX), mapY(cmd.controlY), mapX(cmd.anchorX), mapY(cmd.anchorY));
        hasPendingPath = true;
        break;

      case 'cubicCurveTo':
        ctx.bezierCurveTo(
          mapX(cmd.controlX1),
          mapY(cmd.controlY1),
          mapX(cmd.controlX2),
          mapY(cmd.controlY2),
          mapX(cmd.anchorX),
          mapY(cmd.anchorY),
        );
        hasPendingPath = true;
        break;

      case 'drawCircle': {
        // Scale9Grid remaps center; radius stays unscaled (corners don't scale).
        const cx = mapX(cmd.x);
        const cy = mapY(cmd.y);
        ctx.moveTo(cx + cmd.radius, cy);
        ctx.arc(cx, cy, cmd.radius, 0, Math.PI * 2, true);
        hasPendingPath = true;
        break;
      }

      case 'drawEllipse': {
        const ex = mapX(cmd.x + cmd.width / 2);
        const ey = mapY(cmd.y + cmd.height / 2);
        const ew = mapX(cmd.x + cmd.width) - mapX(cmd.x);
        const eh = mapY(cmd.y + cmd.height) - mapY(cmd.y);
        ctx.moveTo(ex + ew / 2, ey);
        ctx.ellipse(ex, ey, ew / 2, eh / 2, 0, 0, Math.PI * 2);
        hasPendingPath = true;
        break;
      }

      case 'drawRect': {
        // Bitmap fill optimization: use drawImage directly when the rect lies within
        // the bitmap bounds and no scale9 remapping is active.
        if (!strokePass && !scale9 && bitmapSrc !== null) {
          let sl = cmd.x,
            st = cmd.y,
            sr = cmd.x + cmd.width,
            sb = cmd.y + cmd.height;
          let canOptimize = true;

          if (pendingFillMatrix !== null && pendingFillMatrixInverse !== null) {
            if (pendingFillMatrix.b !== 0 || pendingFillMatrix.c !== 0) {
              canOptimize = false;
            } else {
              const inv = pendingFillMatrixInverse;
              sl = inv.a * cmd.x + inv.c * cmd.y + inv.tx;
              st = inv.b * cmd.x + inv.d * cmd.y + inv.ty;
              sr = inv.a * (cmd.x + cmd.width) + inv.c * (cmd.y + cmd.height) + inv.tx;
              sb = inv.b * (cmd.x + cmd.width) + inv.d * (cmd.y + cmd.height) + inv.ty;
            }
          }

          if (canOptimize && sl >= 0 && st >= 0 && sr <= bitmapW && sb <= bitmapH) {
            if (hasPendingPath && (hasFill || hasStroke)) {
              flushPath(
                ctx,
                hasFill,
                fillStyle,
                pendingFillMatrix,
                pendingFillMatrixInverse,
                hasStroke,
                strokeStyle,
                strokeWidth,
                windingRule,
                strokePass,
              );
              hasPendingPath = false;
            }
            ctx.drawImage(bitmapSrc, sl, st, sr - sl, sb - st, cmd.x, cmd.y, cmd.width, cmd.height);
            break;
          }
        }
        const rx0 = mapX(cmd.x);
        const ry0 = mapY(cmd.y);
        ctx.rect(rx0, ry0, mapX(cmd.x + cmd.width) - rx0, mapY(cmd.y + cmd.height) - ry0);
        hasPendingPath = true;
        break;
      }

      case 'drawRoundRect': {
        const rrx0 = mapX(cmd.x);
        const rry0 = mapY(cmd.y);
        const rrw = mapX(cmd.x + cmd.width) - rrx0;
        const rrh = mapY(cmd.y + cmd.height) - rry0;
        const rx = Math.min(cmd.ellipseWidth / 2, cmd.width / 2);
        const ry = Math.min(cmd.ellipseHeight / 2, cmd.height / 2);
        const radius = Math.min(rx, ry);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rrx0, rry0, rrw, rrh, radius);
        } else {
          ctx.rect(rrx0, rry0, rrw, rrh);
        }
        hasPendingPath = true;
        break;
      }

      case 'drawPath': {
        windingRule = cmd.winding === 'nonZero' ? 'nonzero' : 'evenodd';
        let di = 0;
        for (const pc of cmd.commands) {
          switch (pc) {
            case 0: // NO_OP
              break;
            case 1: // MOVE_TO
              ctx.moveTo(mapX(cmd.data[di]), mapY(cmd.data[di + 1]));
              di += 2;
              hasPendingPath = true;
              break;
            case 2: // LINE_TO
              ctx.lineTo(mapX(cmd.data[di]), mapY(cmd.data[di + 1]));
              di += 2;
              hasPendingPath = true;
              break;
            case 3: // CURVE_TO
              ctx.quadraticCurveTo(
                mapX(cmd.data[di]),
                mapY(cmd.data[di + 1]),
                mapX(cmd.data[di + 2]),
                mapY(cmd.data[di + 3]),
              );
              di += 4;
              hasPendingPath = true;
              break;
            case 4: // WIDE_MOVE_TO
              ctx.moveTo(mapX(cmd.data[di + 2]), mapY(cmd.data[di + 3]));
              di += 4;
              hasPendingPath = true;
              break;
            case 5: // WIDE_LINE_TO
              ctx.lineTo(mapX(cmd.data[di + 2]), mapY(cmd.data[di + 3]));
              di += 4;
              hasPendingPath = true;
              break;
            case 6: // CUBIC_CURVE_TO
              ctx.bezierCurveTo(
                mapX(cmd.data[di]),
                mapY(cmd.data[di + 1]),
                mapX(cmd.data[di + 2]),
                mapY(cmd.data[di + 3]),
                mapX(cmd.data[di + 4]),
                mapY(cmd.data[di + 5]),
              );
              di += 6;
              hasPendingPath = true;
              break;
          }
        }
        break;
      }
    }
  }

  if (hasPendingPath && (hasFill || hasStroke)) {
    flushPath(
      ctx,
      hasFill,
      fillStyle,
      pendingFillMatrix,
      pendingFillMatrixInverse,
      hasStroke,
      strokeStyle,
      strokeWidth,
      windingRule,
      strokePass,
    );
  }
}

function flushPath(
  ctx: CanvasRenderingContext2D,
  hasFill: boolean,
  fillStyle: string | CanvasPattern | CanvasGradient,
  fillMatrix: Matrix3x2 | null,
  fillMatrixInverse: Matrix3x2 | null,
  hasStroke: boolean,
  strokeStyle: string | CanvasPattern | CanvasGradient,
  strokeWidth: number,
  windingRule: CanvasFillRule,
  strokePass: boolean,
): void {
  if (!strokePass && hasFill) {
    ctx.fillStyle = fillStyle;
    if (fillMatrix !== null && fillMatrixInverse !== null) {
      ctx.transform(fillMatrix.a, fillMatrix.b, fillMatrix.c, fillMatrix.d, fillMatrix.tx, fillMatrix.ty);
      ctx.fill(windingRule);
      ctx.transform(
        fillMatrixInverse.a,
        fillMatrixInverse.b,
        fillMatrixInverse.c,
        fillMatrixInverse.d,
        fillMatrixInverse.tx,
        fillMatrixInverse.ty,
      );
    } else {
      ctx.fill(windingRule);
    }
  }
  if (strokePass && hasStroke) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.beginPath();
}

function invertMatrix(m: Matrix3x2): Matrix3x2 {
  const out = matrix3x2.clone(m);
  matrix3x2.inverse(out, m);
  return out;
}

function rgbaString(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
