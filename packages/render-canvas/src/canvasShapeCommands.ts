import { createMatrix, inverseMatrix } from '@flighthq/geometry';
import type { CanvasShapeCommand, ImageSource, Matrix } from '@flighthq/types';

const _fillMatrixInverse: Matrix = createMatrix();

import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';

export const defaultCanvasBeginBitmapFill: CanvasShapeCommand<'beginBitmapFill'> = {
  key: 'beginBitmapFill',
  draw(context, state, buf, i) {
    const bitmap = buf[i] as ImageSource;
    const matrix = buf[i + 1] as Matrix | null;
    const repeat = buf[i + 2] as boolean;
    const smooth = buf[i + 3] as boolean;
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
    const pattern = createBitmapPattern(context, bitmap, repeat, smooth);
    state.hasFill = pattern !== null;
    state.fillStyle = pattern ?? '';
    state.fillMatrix = matrix;
    if (matrix !== null) {
      inverseMatrix(_fillMatrixInverse, matrix);
      state.fillMatrixInverse = _fillMatrixInverse;
    } else {
      state.fillMatrixInverse = null;
    }
    state.bitmapSrc = bitmap.src;
    state.bitmapW = bitmap.width;
    state.bitmapH = bitmap.height;
  },
};

export const defaultCanvasBeginFill: CanvasShapeCommand<'beginFill'> = {
  key: 'beginFill',
  draw(_ctx, state, buf, i) {
    const color = buf[i] as number;
    const alpha = buf[i + 1] as number;
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
    state.hasFill = alpha >= 0.005;
    state.fillStyle = state.hasFill ? rgbaString(color, alpha) : '';
    state.fillMatrix = null;
    state.fillMatrixInverse = null;
    state.bitmapSrc = null;
  },
};

export const defaultCanvasBeginGradientFill: CanvasShapeCommand<'beginGradientFill'> = {
  key: 'beginGradientFill',
  draw(context, state, buf, i) {
    const gradientType = buf[i] as never;
    const colors = buf[i + 1] as number[];
    const alphas = buf[i + 2] as number[];
    const ratios = buf[i + 3] as number[];
    const matrix = buf[i + 4] as Matrix | null;
    const spreadMethod = buf[i + 5] as never;
    const interpolationMethod = buf[i + 6] as never;
    const focalPointRatio = buf[i + 7] as number;
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
    const pattern = createGradientPattern(
      context,
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
  },
};

export const defaultCanvasCubicCurveTo: CanvasShapeCommand<'cubicCurveTo'> = {
  key: 'cubicCurveTo',
  draw(context, state, buf, i) {
    const controlX1 = buf[i] as number;
    const controlY1 = buf[i + 1] as number;
    const controlX2 = buf[i + 2] as number;
    const controlY2 = buf[i + 3] as number;
    const anchorX = buf[i + 4] as number;
    const anchorY = buf[i + 5] as number;
    if (!state.hasCurrentPoint) {
      context.moveTo(0, 0);
      state.hasCurrentPoint = true;
    }
    context.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, anchorX, anchorY);
    state.hasPendingPath = true;
  },
};

export const defaultCanvasCurveTo: CanvasShapeCommand<'curveTo'> = {
  key: 'curveTo',
  draw(context, state, buf, i) {
    const controlX = buf[i] as number;
    const controlY = buf[i + 1] as number;
    const anchorX = buf[i + 2] as number;
    const anchorY = buf[i + 3] as number;
    if (!state.hasCurrentPoint) {
      context.moveTo(0, 0);
      state.hasCurrentPoint = true;
    }
    context.quadraticCurveTo(controlX, controlY, anchorX, anchorY);
    state.hasPendingPath = true;
  },
};

export const defaultCanvasDrawCircle: CanvasShapeCommand<'drawCircle'> = {
  key: 'drawCircle',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const radius = buf[i + 2] as number;
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, Math.PI * 2, true);
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const defaultCanvasDrawEllipse: CanvasShapeCommand<'drawEllipse'> = {
  key: 'drawEllipse',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const width = buf[i + 2] as number;
    const height = buf[i + 3] as number;
    const ex = x + width / 2;
    const ey = y + height / 2;
    context.moveTo(ex + width / 2, ey);
    context.ellipse(ex, ey, width / 2, height / 2, 0, 0, Math.PI * 2);
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const defaultCanvasDrawPath: CanvasShapeCommand<'drawPath'> = {
  key: 'drawPath',
  draw(context, state, buf, i) {
    const commands = buf[i] as number[];
    const data = buf[i + 1] as number[];
    const winding = buf[i + 2] as string;
    state.windingRule = winding === 'nonZero' ? 'nonzero' : 'evenodd';
    let di = 0;
    for (const pc of commands) {
      switch (pc) {
        case 0: // NO_OP
          break;
        case 1: // MOVE_TO
          context.moveTo(data[di], data[di + 1]);
          di += 2;
          state.hasPendingPath = true;
          state.hasCurrentPoint = true;
          break;
        case 2: // LINE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.lineTo(data[di], data[di + 1]);
          di += 2;
          state.hasPendingPath = true;
          break;
        case 3: // CURVE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.quadraticCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3]);
          di += 4;
          state.hasPendingPath = true;
          break;
        case 4: // WIDE_MOVE_TO
          context.moveTo(data[di + 2], data[di + 3]);
          di += 4;
          state.hasPendingPath = true;
          state.hasCurrentPoint = true;
          break;
        case 5: // WIDE_LINE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.lineTo(data[di + 2], data[di + 3]);
          di += 4;
          state.hasPendingPath = true;
          break;
        case 6: // CUBIC_CURVE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.bezierCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3], data[di + 4], data[di + 5]);
          di += 6;
          state.hasPendingPath = true;
          break;
      }
    }
  },
};

export const defaultCanvasDrawRectangle: CanvasShapeCommand<'drawRectangle'> = {
  key: 'drawRectangle',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const width = buf[i + 2] as number;
    const height = buf[i + 3] as number;
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
        context.drawImage(state.bitmapSrc, sl, st, sr - sl, sb - st, x, y, width, height);
        return;
      }
    }
    context.rect(x, y, width, height);
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const defaultCanvasDrawRoundRectangle: CanvasShapeCommand<'drawRoundRectangle'> = {
  key: 'drawRoundRectangle',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const width = buf[i + 2] as number;
    const height = buf[i + 3] as number;
    const ellipseWidth = buf[i + 4] as number;
    const ellipseHeight = buf[i + 5] as number;
    const rx = Math.min(ellipseWidth / 2, width / 2);
    const ry = Math.min(ellipseHeight / 2, height / 2);
    const radius = Math.min(rx, ry);
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
    } else {
      context.rect(x, y, width, height);
    }
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const defaultCanvasEndFill: CanvasShapeCommand<'endFill'> = {
  key: 'endFill',
  draw(_ctx, state) {
    if (state.hasPendingPath) state.flush();
    state.hasFill = false;
    state.fillMatrix = null;
    state.fillMatrixInverse = null;
    state.bitmapSrc = null;
  },
};

export const defaultCanvasLineBitmapStyle: CanvasShapeCommand<'lineBitmapStyle'> = {
  key: 'lineBitmapStyle',
  draw(context, state, buf, i) {
    const bitmap = buf[i] as ImageSource;
    const repeat = buf[i + 2] as boolean;
    const smooth = buf[i + 3] as boolean;
    const pattern = createBitmapPattern(context, bitmap, repeat, smooth);
    if (pattern !== null) {
      state.strokeStyle = pattern;
      state.hasStroke = true;
    }
  },
};

export const defaultCanvasLineGradientStyle: CanvasShapeCommand<'lineGradientStyle'> = {
  key: 'lineGradientStyle',
  draw(context, state, buf, i) {
    const gradientType = buf[i] as never;
    const colors = buf[i + 1] as number[];
    const alphas = buf[i + 2] as number[];
    const ratios = buf[i + 3] as number[];
    const matrix = buf[i + 4] as Matrix | null;
    const spreadMethod = buf[i + 5] as never;
    const interpolationMethod = buf[i + 6] as never;
    const focalPointRatio = buf[i + 7] as number;
    const pattern = createGradientPattern(
      context,
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
  },
};

export const defaultCanvasLineStyle: CanvasShapeCommand<'lineStyle'> = {
  key: 'lineStyle',
  draw(context, state, buf, i) {
    const thickness = buf[i] as number;
    const color = buf[i + 1] as number;
    const alpha = buf[i + 2] as number;
    const caps = buf[i + 5] as string;
    const joints = buf[i + 6] as string;
    const miterLimit = buf[i + 7] as number;
    state.hasStroke = thickness > 0;
    if (state.hasStroke) {
      state.strokeWidth = thickness;
      state.strokeStyle = rgbaString(color, alpha);
      context.lineCap = caps === 'none' ? 'butt' : (caps as CanvasLineCap);
      context.lineJoin = joints as CanvasLineJoin;
      context.miterLimit = miterLimit;
    }
  },
};

export const defaultCanvasLineTo: CanvasShapeCommand<'lineTo'> = {
  key: 'lineTo',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    if (!state.hasCurrentPoint) {
      context.moveTo(0, 0);
      state.hasCurrentPoint = true;
    }
    context.lineTo(x, y);
    state.hasPendingPath = true;
  },
};

export const defaultCanvasMoveTo: CanvasShapeCommand<'moveTo'> = {
  key: 'moveTo',
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    context.moveTo(x, y);
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultCanvasShapeCommands: CanvasShapeCommand<any>[] = [
  defaultCanvasBeginBitmapFill,
  defaultCanvasBeginFill,
  defaultCanvasBeginGradientFill,
  defaultCanvasCubicCurveTo,
  defaultCanvasCurveTo,
  defaultCanvasDrawCircle,
  defaultCanvasDrawEllipse,
  defaultCanvasDrawPath,
  defaultCanvasDrawRectangle,
  defaultCanvasDrawRoundRectangle,
  defaultCanvasEndFill,
  defaultCanvasLineBitmapStyle,
  defaultCanvasLineGradientStyle,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
];

function rgbaString(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
