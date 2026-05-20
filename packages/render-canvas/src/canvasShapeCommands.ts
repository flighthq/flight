import { matrix3x2 } from '@flighthq/geometry';
import type {
  CanvasShapeDrawState,
  CapsStyle,
  GradientType,
  GraphicsPathWinding,
  ImageSource,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix3x2,
  SpreadMethod,
} from '@flighthq/types';
import type { CanvasShapeCommandMap, CanvasShapeHandler } from '@flighthq/types';

import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';

export const defaultCanvasBeginBitmapFill: CanvasShapeHandler<'beginBitmapFill'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null,
  repeat: boolean,
  smooth: boolean,
) => {
  if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
  const pattern = createBitmapPattern(ctx, bitmap, repeat, smooth);
  state.hasFill = pattern !== null;
  state.fillStyle = pattern ?? '';
  state.fillMatrix = matrix;
  state.fillMatrixInverse = matrix !== null ? invertMatrix(matrix) : null;
  state.bitmapSrc = bitmap.src;
  state.bitmapW = bitmap.width;
  state.bitmapH = bitmap.height;
};

export const defaultCanvasBeginFill: CanvasShapeHandler<'beginFill'> = (
  _ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  color: number,
  alpha: number,
) => {
  if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
  state.hasFill = alpha >= 0.005;
  state.fillStyle = state.hasFill ? rgbaString(color, alpha) : '';
  state.fillMatrix = null;
  state.fillMatrixInverse = null;
  state.bitmapSrc = null;
};

export const defaultCanvasBeginGradientFill: CanvasShapeHandler<'beginGradientFill'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null,
  spreadMethod: SpreadMethod,
  interpolationMethod: InterpolationMethod,
  focalPointRatio: number,
) => {
  if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
  const pattern = createGradientPattern(
    ctx,
    gradientType,
    colors,
    alphas,
    ratios,
    matrix,
    spreadMethod,
    interpolationMethod,
    focalPointRatio,
  );
  state.hasFill = pattern !== null;
  state.fillStyle = pattern ?? '';
  state.fillMatrix = null;
  state.fillMatrixInverse = null;
  state.bitmapSrc = null;
};

export const defaultCanvasCubicCurveTo: CanvasShapeHandler<'cubicCurveTo'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
) => {
  if (!state.hasCurrentPoint) {
    ctx.moveTo(0, 0);
    state.hasCurrentPoint = true;
  }
  ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, anchorX, anchorY);
  state.hasPendingPath = true;
};

export const defaultCanvasCurveTo: CanvasShapeHandler<'curveTo'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
) => {
  if (!state.hasCurrentPoint) {
    ctx.moveTo(0, 0);
    state.hasCurrentPoint = true;
  }
  ctx.quadraticCurveTo(controlX, controlY, anchorX, anchorY);
  state.hasPendingPath = true;
};

export const defaultCanvasDrawCircle: CanvasShapeHandler<'drawCircle'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
  radius: number,
) => {
  ctx.moveTo(x + radius, y);
  ctx.arc(x, y, radius, 0, Math.PI * 2, true);
  state.hasPendingPath = true;
  state.hasCurrentPoint = true;
};

export const defaultCanvasDrawEllipse: CanvasShapeHandler<'drawEllipse'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const ex = x + width / 2;
  const ey = y + height / 2;
  ctx.moveTo(ex + width / 2, ey);
  ctx.ellipse(ex, ey, width / 2, height / 2, 0, 0, Math.PI * 2);
  state.hasPendingPath = true;
  state.hasCurrentPoint = true;
};

export const defaultCanvasDrawPath: CanvasShapeHandler<'drawPath'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  commands: number[],
  data: number[],
  winding: GraphicsPathWinding,
) => {
  state.windingRule = winding === 'nonZero' ? 'nonzero' : 'evenodd';
  let di = 0;
  for (const pc of commands) {
    switch (pc) {
      case 0: // NO_OP
        break;
      case 1: // MOVE_TO
        ctx.moveTo(data[di], data[di + 1]);
        di += 2;
        state.hasPendingPath = true;
        state.hasCurrentPoint = true;
        break;
      case 2: // LINE_TO
        if (!state.hasCurrentPoint) {
          ctx.moveTo(0, 0);
          state.hasCurrentPoint = true;
        }
        ctx.lineTo(data[di], data[di + 1]);
        di += 2;
        state.hasPendingPath = true;
        break;
      case 3: // CURVE_TO
        if (!state.hasCurrentPoint) {
          ctx.moveTo(0, 0);
          state.hasCurrentPoint = true;
        }
        ctx.quadraticCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3]);
        di += 4;
        state.hasPendingPath = true;
        break;
      case 4: // WIDE_MOVE_TO
        ctx.moveTo(data[di + 2], data[di + 3]);
        di += 4;
        state.hasPendingPath = true;
        state.hasCurrentPoint = true;
        break;
      case 5: // WIDE_LINE_TO
        if (!state.hasCurrentPoint) {
          ctx.moveTo(0, 0);
          state.hasCurrentPoint = true;
        }
        ctx.lineTo(data[di + 2], data[di + 3]);
        di += 4;
        state.hasPendingPath = true;
        break;
      case 6: // CUBIC_CURVE_TO
        if (!state.hasCurrentPoint) {
          ctx.moveTo(0, 0);
          state.hasCurrentPoint = true;
        }
        ctx.bezierCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3], data[di + 4], data[di + 5]);
        di += 6;
        state.hasPendingPath = true;
        break;
    }
  }
};

export const defaultCanvasDrawRect: CanvasShapeHandler<'drawRect'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  if (state.bitmapSrc !== null) {
    let sl = x,
      st = y,
      sr = x + width,
      sb = y + height;
    let canOptimize = true;
    if (state.fillMatrix !== null && state.fillMatrixInverse !== null) {
      if (state.fillMatrix.b !== 0 || state.fillMatrix.c !== 0) {
        canOptimize = false;
      } else {
        const inv = state.fillMatrixInverse;
        sl = inv.a * x + inv.c * y + inv.tx;
        st = inv.b * x + inv.d * y + inv.ty;
        sr = inv.a * (x + width) + inv.c * (y + height) + inv.tx;
        sb = inv.b * (x + width) + inv.d * (y + height) + inv.ty;
      }
    }
    if (canOptimize && sl >= 0 && st >= 0 && sr <= state.bitmapW && sb <= state.bitmapH) {
      if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
      ctx.drawImage(state.bitmapSrc, sl, st, sr - sl, sb - st, x, y, width, height);
      return;
    }
  }
  ctx.rect(x, y, width, height);
  state.hasPendingPath = true;
  state.hasCurrentPoint = true;
};

export const defaultCanvasDrawRoundRect: CanvasShapeHandler<'drawRoundRect'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
) => {
  const rx = Math.min(ellipseWidth / 2, width / 2);
  const ry = Math.min(ellipseHeight / 2, height / 2);
  const radius = Math.min(rx, ry);
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  state.hasPendingPath = true;
  state.hasCurrentPoint = true;
};

export const defaultCanvasEndFill: CanvasShapeHandler<'endFill'> = (
  _ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
) => {
  if (state.hasPendingPath) state.flush();
  state.hasFill = false;
  state.fillMatrix = null;
  state.fillMatrixInverse = null;
  state.bitmapSrc = null;
};

export const defaultCanvasLineBitmapStyle: CanvasShapeHandler<'lineBitmapStyle'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  bitmap: ImageSource,
  _matrix: Matrix3x2 | null,
  repeat: boolean,
  smooth: boolean,
) => {
  const pattern = createBitmapPattern(ctx, bitmap, repeat, smooth);
  if (pattern !== null) {
    state.strokeStyle = pattern;
    state.hasStroke = true;
  }
};

export const defaultCanvasLineGradientStyle: CanvasShapeHandler<'lineGradientStyle'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null,
  spreadMethod: SpreadMethod,
  interpolationMethod: InterpolationMethod,
  focalPointRatio: number,
) => {
  const pattern = createGradientPattern(
    ctx,
    gradientType,
    colors,
    alphas,
    ratios,
    matrix,
    spreadMethod,
    interpolationMethod,
    focalPointRatio,
  );
  if (pattern !== null) {
    state.strokeStyle = pattern;
    state.hasStroke = true;
  }
};

export const defaultCanvasLineTo: CanvasShapeHandler<'lineTo'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
) => {
  if (!state.hasCurrentPoint) {
    ctx.moveTo(0, 0);
    state.hasCurrentPoint = true;
  }
  ctx.lineTo(x, y);
  state.hasPendingPath = true;
};

export const defaultCanvasLineStyle: CanvasShapeHandler<'lineStyle'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  thickness: number,
  color: number,
  alpha: number,
  _pixelHinting: boolean,
  _scaleMode: LineScaleMode,
  caps: CapsStyle,
  joints: JointStyle,
  miterLimit: number,
) => {
  state.hasStroke = thickness > 0;
  if (state.hasStroke) {
    state.strokeWidth = thickness;
    state.strokeStyle = rgbaString(color, alpha);
    ctx.lineCap = caps === 'none' ? 'butt' : caps;
    ctx.lineJoin = joints;
    ctx.miterLimit = miterLimit;
  }
};

export const defaultCanvasMoveTo: CanvasShapeHandler<'moveTo'> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  x: number,
  y: number,
) => {
  ctx.moveTo(x, y);
  state.hasPendingPath = true;
  state.hasCurrentPoint = true;
};

export const defaultCanvasShapeCommands: CanvasShapeCommandMap = {
  beginBitmapFill: defaultCanvasBeginBitmapFill,
  beginFill: defaultCanvasBeginFill,
  beginGradientFill: defaultCanvasBeginGradientFill,
  cubicCurveTo: defaultCanvasCubicCurveTo,
  curveTo: defaultCanvasCurveTo,
  drawCircle: defaultCanvasDrawCircle,
  drawEllipse: defaultCanvasDrawEllipse,
  drawPath: defaultCanvasDrawPath,
  drawRect: defaultCanvasDrawRect,
  drawRoundRect: defaultCanvasDrawRoundRect,
  endFill: defaultCanvasEndFill,
  lineBitmapStyle: defaultCanvasLineBitmapStyle,
  lineGradientStyle: defaultCanvasLineGradientStyle,
  lineTo: defaultCanvasLineTo,
  lineStyle: defaultCanvasLineStyle,
  moveTo: defaultCanvasMoveTo,
};

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
