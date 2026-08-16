import { createMatrix, inverseMatrix } from '@flighthq/geometry/contract';
import {
  defaultShapeBoundsCubicCurveTo,
  defaultShapeBoundsCurveTo,
  defaultShapeBoundsDrawCircle,
  defaultShapeBoundsDrawEllipse,
  defaultShapeBoundsDrawPath,
  defaultShapeBoundsDrawRectangle,
  defaultShapeBoundsFlush,
  defaultShapeBoundsLineStyle,
  defaultShapeBoundsLineTo,
  defaultShapeBoundsMoveTo,
  normalizeShapeStrokeMiterLimit,
  normalizeShapeStrokeWidth,
} from '@flighthq/shape/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type { CanvasShapeCommand, Matrix, Texture } from '@flighthq/types/contract';

const _fillMatrixInverse: Matrix = createMatrix();

import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

export const defaultCanvasBeginTextureFill: CanvasShapeCommand<'beginTextureFill'> = {
  fillBounds: defaultShapeBoundsFlush,
  key: 'beginTextureFill',
  strokeBounds: defaultShapeBoundsFlush,
  draw(context, state, buf, i) {
    const texture = buf[i] as Texture;
    const matrix = buf[i + 1] as Matrix | null;
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
    const pattern = createBitmapPattern(context, texture, state.canvasTextureResolvers, state.allowSmoothing);
    state.hasFill = pattern !== null;
    state.fillStyle = pattern ?? '';
    state.fillMatrix = matrix;
    // A singular fill matrix takes the SAME path as no matrix at all: draw the fill untransformed.
    // `inverseMatrix` does not produce NaN here — it zeroes a/b/c/d and negates tx/ty — so ignoring the
    // return would map every fill coordinate through a defined-but-wrong matrix and paint wrong pixels
    // with no error and nothing to search for. Falling back to the existing untransformed path is the
    // honest answer: identity would silently resize and reposition the fill, which is a different wrong
    // answer rather than a neutral one. Importers tally the degenerate matrix at their own boundary,
    // where a diagnostics sink exists; this is the last line of defence for an app-supplied matrix.
    if (matrix !== null && inverseMatrix(_fillMatrixInverse, matrix)) {
      state.fillMatrixInverse = _fillMatrixInverse;
    } else {
      state.fillMatrixInverse = null;
    }
    state.bitmapSrc = resolveCanvasTextureWindowSource(state.canvasTextureResolvers, texture);
    state.bitmapW = Math.abs(texture.uvScale.x * getTextureWidth(texture));
    state.bitmapH = Math.abs(texture.uvScale.y * getTextureHeight(texture));
  },
};

export const defaultCanvasBeginFill: CanvasShapeCommand<'beginFill'> = {
  fillBounds: defaultShapeBoundsFlush,
  key: 'beginFill',
  strokeBounds: defaultShapeBoundsFlush,
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
  fillBounds: defaultShapeBoundsFlush,
  key: 'beginGradientFill',
  strokeBounds: defaultShapeBoundsFlush,
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
  fillBounds: defaultShapeBoundsCubicCurveTo,
  key: 'cubicCurveTo',
  strokeBounds: defaultShapeBoundsCubicCurveTo,
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
  fillBounds: defaultShapeBoundsCurveTo,
  key: 'curveTo',
  strokeBounds: defaultShapeBoundsCurveTo,
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
  fillBounds: defaultShapeBoundsDrawCircle,
  key: 'drawCircle',
  strokeBounds: defaultShapeBoundsDrawCircle,
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
  fillBounds: defaultShapeBoundsDrawEllipse,
  key: 'drawEllipse',
  strokeBounds: defaultShapeBoundsDrawEllipse,
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
  fillBounds: defaultShapeBoundsDrawPath,
  key: 'drawPath',
  strokeBounds: defaultShapeBoundsDrawPath,
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
        case 7: // CLOSE — consumes no operands, so the data cursor does not advance
          // Without this the verb falls through the switch and the subpath is stroked as if it were open,
          // losing its CLOSING SEGMENT entirely: a stroked rect drew three sides. It reached every backend,
          // not just this one, because scene2d-gl and scene2d-wgpu rasterize through these same commands
          // whenever a stroke is closed — the tessellators deliberately defer closed rings to raster.
          context.closePath();
          break;
      }
    }
  },
};

export const defaultCanvasDrawRectangle: CanvasShapeCommand<'drawRectangle'> = {
  fillBounds: defaultShapeBoundsDrawRectangle,
  key: 'drawRectangle',
  strokeBounds: defaultShapeBoundsDrawRectangle,
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
  fillBounds: defaultShapeBoundsDrawRectangle,
  key: 'drawRoundRectangle',
  strokeBounds: defaultShapeBoundsDrawRectangle,
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const width = buf[i + 2] as number;
    const height = buf[i + 3] as number;
    const ellipseWidth = buf[i + 4] as number;
    const ellipseHeight = buf[i + 5] as number;
    // Canvas accepts signed rectangle dimensions and flips the path, but radii are magnitudes and a
    // negative one throws. Clamp the authored ellipse size against the absolute edge lengths so a
    // backwards rectangle follows the same geometry instead of reaching roundRect with a bad radius.
    const radius = Math.max(
      0,
      Math.min(ellipseWidth / 2, ellipseHeight / 2, Math.abs(width) / 2, Math.abs(height) / 2),
    );
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
  fillBounds: defaultShapeBoundsFlush,
  key: 'endFill',
  strokeBounds: defaultShapeBoundsFlush,
  draw(_ctx, state) {
    if (state.hasPendingPath) state.flush();
    state.hasFill = false;
    state.fillMatrix = null;
    state.fillMatrixInverse = null;
    state.bitmapSrc = null;
  },
};

export const defaultCanvasLineTextureStyle: CanvasShapeCommand<'lineTextureStyle'> = {
  fillBounds: null,
  key: 'lineTextureStyle',
  strokeBounds: null,
  draw(context, state, buf, i) {
    const texture = buf[i] as Texture;
    const pattern = createBitmapPattern(context, texture, state.canvasTextureResolvers, state.allowSmoothing);
    if (pattern !== null) {
      state.strokeStyle = pattern;
      state.hasStroke = true;
    }
  },
};

export const defaultCanvasLineGradientStyle: CanvasShapeCommand<'lineGradientStyle'> = {
  fillBounds: null,
  key: 'lineGradientStyle',
  strokeBounds: null,
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
  fillBounds: defaultShapeBoundsFlush,
  key: 'lineStyle',
  strokeBounds: defaultShapeBoundsLineStyle,
  draw(context, state, buf, i) {
    // Canvas ignores nonpositive/nonfinite assignments and retains whichever prior Shape wrote the
    // context. Zero remains Shape's explicit stroke-off sentinel; other invalid widths become 1 and
    // invalid miter limits become Canvas's default 10 so one Shape never inherits another's style.
    const thickness = normalizeShapeStrokeWidth(buf[i] as number);
    const color = buf[i + 1] as number;
    const alpha = buf[i + 2] as number;
    const caps = buf[i + 5] as string;
    const joints = buf[i + 6] as string;
    const miterLimit = normalizeShapeStrokeMiterLimit(buf[i + 7] as number);
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
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
  fillBounds: defaultShapeBoundsLineTo,
  key: 'lineTo',
  strokeBounds: defaultShapeBoundsLineTo,
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
  fillBounds: defaultShapeBoundsMoveTo,
  key: 'moveTo',
  strokeBounds: defaultShapeBoundsMoveTo,
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
  defaultCanvasLineGradientStyle,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
];

// Texture-backed shape styles are an explicit assembly so ordinary vector shapes do not retain
// Texture source resolution. Register this alongside defaultCanvasShapeCommands when bitmap fills
// or bitmap strokes are present.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultCanvasTextureShapeCommands: CanvasShapeCommand<any>[] = [
  defaultCanvasBeginTextureFill,
  defaultCanvasLineTextureStyle,
];

function rgbaString(color: number, alpha: number): string {
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  const a = ((color & 0xff) / 0xff) * alpha;
  return `rgba(${r},${g},${b},${a})`;
}
