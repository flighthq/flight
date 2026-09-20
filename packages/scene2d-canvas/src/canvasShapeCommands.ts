import { createMatrix, inverseMatrix } from '@flighthq/geometry/contract';
import {
  defaultShapeBoundsCubicCurveTo,
  defaultShapeBoundsDrawCircle,
  defaultShapeBoundsDrawEllipse,
  defaultShapeBoundsDrawPath,
  defaultShapeBoundsDrawRectangle,
  defaultShapeBoundsDrawRoundedRectangle,
  defaultShapeBoundsFlush,
  defaultShapeBoundsLineStyle,
  defaultShapeBoundsLineTo,
  defaultShapeBoundsMoveTo,
  defaultShapeBoundsQuadraticCurveTo,
  normalizeShapeStrokeMiterLimit,
  normalizeShapeStrokeWidth,
} from '@flighthq/shape/contract';
import { getTextureViewSize } from '@flighthq/texture/contract';
import type { CanvasShapeCommand, LineScaleMode, Matrix, Texture } from '@flighthq/types/contract';

const _fillMatrixInverse: Matrix = createMatrix();

import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

export const canvasBeginTextureFill: CanvasShapeCommand<'beginTextureFill'> = {
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
    getTextureViewSize(textureFillViewSize, texture);
    state.bitmapW = textureFillViewSize.x;
    state.bitmapH = textureFillViewSize.y;
  },
};

const textureFillViewSize = { x: 0, y: 0 };

export const canvasBeginFill: CanvasShapeCommand<'beginFill'> = {
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

export const canvasBeginGradientFill: CanvasShapeCommand<'beginGradientFill'> = {
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
      state.canvasTextureResolvers,
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

export const canvasCubicCurveTo: CanvasShapeCommand<'cubicCurveTo'> = {
  fillBounds: defaultShapeBoundsCubicCurveTo,
  key: 'cubicCurveTo',
  strokeBounds: defaultShapeBoundsCubicCurveTo,
  draw(context, state, buf, i) {
    const controlX1 = buf[i] as number;
    const controlY1 = buf[i + 1] as number;
    const controlX2 = buf[i + 2] as number;
    const controlY2 = buf[i + 3] as number;
    const x = buf[i + 4] as number;
    const y = buf[i + 5] as number;
    if (!state.hasCurrentPoint) {
      context.moveTo(0, 0);
      state.hasCurrentPoint = true;
    }
    context.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, x, y);
    state.currentX = x;
    state.currentY = y;
    state.hasPendingPath = true;
  },
};

export const canvasQuadraticCurveTo: CanvasShapeCommand<'quadraticCurveTo'> = {
  fillBounds: defaultShapeBoundsQuadraticCurveTo,
  key: 'quadraticCurveTo',
  strokeBounds: defaultShapeBoundsQuadraticCurveTo,
  draw(context, state, buf, i) {
    const controlX = buf[i] as number;
    const controlY = buf[i + 1] as number;
    const x = buf[i + 2] as number;
    const y = buf[i + 3] as number;
    if (!state.hasCurrentPoint) {
      context.moveTo(0, 0);
      state.hasCurrentPoint = true;
    }
    context.quadraticCurveTo(controlX, controlY, x, y);
    state.currentX = x;
    state.currentY = y;
    state.hasPendingPath = true;
  },
};

export const canvasDrawCircle: CanvasShapeCommand<'drawCircle'> = {
  fillBounds: defaultShapeBoundsDrawCircle,
  key: 'drawCircle',
  strokeBounds: defaultShapeBoundsDrawCircle,
  draw(context, state, buf, i) {
    const centerX = buf[i] as number;
    const centerY = buf[i + 1] as number;
    const radius = buf[i + 2] as number;
    context.moveTo(centerX + radius, centerY);
    context.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    state.currentX = centerX + radius;
    state.currentY = centerY;
    state.subpathStartX = state.currentX;
    state.subpathStartY = state.currentY;
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const canvasDrawEllipse: CanvasShapeCommand<'drawEllipse'> = {
  fillBounds: defaultShapeBoundsDrawEllipse,
  key: 'drawEllipse',
  strokeBounds: defaultShapeBoundsDrawEllipse,
  draw(context, state, buf, i) {
    const centerX = buf[i] as number;
    const centerY = buf[i + 1] as number;
    const radiusX = Math.abs(buf[i + 2] as number);
    const radiusY = Math.abs(buf[i + 3] as number);
    context.moveTo(centerX + radiusX, centerY);
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    state.currentX = centerX + radiusX;
    state.currentY = centerY;
    state.subpathStartX = state.currentX;
    state.subpathStartY = state.currentY;
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const canvasDrawPath: CanvasShapeCommand<'drawPath'> = {
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
          state.currentX = data[di];
          state.currentY = data[di + 1];
          state.subpathStartX = state.currentX;
          state.subpathStartY = state.currentY;
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
          state.currentX = data[di];
          state.currentY = data[di + 1];
          di += 2;
          state.hasPendingPath = true;
          break;
        case 3: // QUADRATIC_CURVE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.quadraticCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3]);
          state.currentX = data[di + 2];
          state.currentY = data[di + 3];
          di += 4;
          state.hasPendingPath = true;
          break;
        case 4: // WIDE_MOVE_TO
          context.moveTo(data[di + 2], data[di + 3]);
          state.currentX = data[di + 2];
          state.currentY = data[di + 3];
          state.subpathStartX = state.currentX;
          state.subpathStartY = state.currentY;
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
          state.currentX = data[di + 2];
          state.currentY = data[di + 3];
          di += 4;
          state.hasPendingPath = true;
          break;
        case 6: // CUBIC_CURVE_TO
          if (!state.hasCurrentPoint) {
            context.moveTo(0, 0);
            state.hasCurrentPoint = true;
          }
          context.bezierCurveTo(data[di], data[di + 1], data[di + 2], data[di + 3], data[di + 4], data[di + 5]);
          state.currentX = data[di + 4];
          state.currentY = data[di + 5];
          di += 6;
          state.hasPendingPath = true;
          break;
        case 7: // CLOSE — consumes no operands, so the data cursor does not advance
          // Without this the verb falls through the switch and the subpath is stroked as if it were open,
          // losing its CLOSING SEGMENT entirely: a stroked rect drew three sides. It reached every backend,
          // not just this one, because scene2d-gl and scene2d-wgpu rasterize through these same commands
          // whenever a stroke is closed — the tessellators deliberately defer closed rings to raster.
          context.closePath();
          state.currentX = state.subpathStartX;
          state.currentY = state.subpathStartY;
          break;
      }
    }
  },
};

export const canvasDrawRectangle: CanvasShapeCommand<'drawRectangle'> = {
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
    state.currentX = x;
    state.currentY = y;
    state.subpathStartX = x;
    state.subpathStartY = y;
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const canvasDrawRoundedRectangle: CanvasShapeCommand<'drawRoundedRectangle'> = {
  fillBounds: defaultShapeBoundsDrawRoundedRectangle,
  key: 'drawRoundedRectangle',
  strokeBounds: defaultShapeBoundsDrawRoundedRectangle,
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    const width = buf[i + 2] as number;
    const height = buf[i + 3] as number;
    const authoredRadius = buf[i + 4] as number;
    // Canvas accepts signed rectangle dimensions and flips the path, but radii are magnitudes and a
    // negative one throws. Clamp the authored radius against the absolute edge lengths so a
    // backwards rectangle follows the same geometry instead of reaching roundRect with a bad radius.
    const radius = Math.max(0, Math.min(authoredRadius, Math.abs(width) / 2, Math.abs(height) / 2));
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
    } else {
      context.rect(x, y, width, height);
    }
    state.currentX = x + radius;
    state.currentY = y;
    state.subpathStartX = state.currentX;
    state.subpathStartY = state.currentY;
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

export const canvasEndFill: CanvasShapeCommand<'endFill'> = {
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

export const canvasLineTextureStyle: CanvasShapeCommand<'lineTextureStyle'> = {
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

export const canvasLineGradientStyle: CanvasShapeCommand<'lineGradientStyle'> = {
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
      state.canvasTextureResolvers,
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

export const canvasLineStyle: CanvasShapeCommand<'lineStyle'> = {
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
    const scaleMode = buf[i + 4] as LineScaleMode;
    const caps = buf[i + 5] as string;
    const joints = buf[i + 6] as string;
    const miterLimit = normalizeShapeStrokeMiterLimit(buf[i + 7] as number);
    if (state.hasPendingPath && (state.hasFill || state.hasStroke)) state.flush();
    state.hasStroke = thickness > 0;
    if (state.hasStroke) {
      state.strokeWidth = thickness;
      state.lineScaleMode = scaleMode;
      state.strokeStyle = rgbaString(color, alpha);
      context.lineCap = caps === 'none' ? 'butt' : (caps as CanvasLineCap);
      context.lineJoin = joints as CanvasLineJoin;
      context.miterLimit = miterLimit;
    }
  },
};

export const canvasLineTo: CanvasShapeCommand<'lineTo'> = {
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
    state.currentX = x;
    state.currentY = y;
    state.hasPendingPath = true;
  },
};

export const canvasMoveTo: CanvasShapeCommand<'moveTo'> = {
  fillBounds: defaultShapeBoundsMoveTo,
  key: 'moveTo',
  strokeBounds: defaultShapeBoundsMoveTo,
  draw(context, state, buf, i) {
    const x = buf[i] as number;
    const y = buf[i + 1] as number;
    context.moveTo(x, y);
    state.currentX = x;
    state.currentY = y;
    state.subpathStartX = x;
    state.subpathStartY = y;
    state.hasPendingPath = true;
    state.hasCurrentPoint = true;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const canvasShapeCommands: CanvasShapeCommand<any>[] = [
  canvasBeginFill,
  canvasBeginGradientFill,
  canvasCubicCurveTo,
  canvasDrawCircle,
  canvasDrawEllipse,
  canvasDrawPath,
  canvasDrawRectangle,
  canvasDrawRoundedRectangle,
  canvasEndFill,
  canvasLineGradientStyle,
  canvasLineStyle,
  canvasLineTo,
  canvasMoveTo,
  canvasQuadraticCurveTo,
];

// Texture-backed shape styles are an explicit assembly so ordinary vector shapes do not retain
// Texture source resolution. Register this alongside canvasShapeCommands when bitmap fills
// or bitmap strokes are present.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const canvasTextureShapeCommands: CanvasShapeCommand<any>[] = [canvasBeginTextureFill, canvasLineTextureStyle];

function rgbaString(color: number, alpha: number): string {
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  const a = ((color & 0xff) / 0xff) * alpha;
  return `rgba(${r},${g},${b},${a})`;
}
