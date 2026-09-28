import {
  createMatrix,
  createTransform2D,
  decomposeMatrixToTransform2D,
  multiplyMatrix,
} from '@flighthq/geometry/contract';
import type { Matrix, Node2D, Transform2D, XmlElement } from '@flighthq/types/contract';

import { svgAttribute, svgNumberAttribute, parseSvgLength, parseSvgNumberList } from './svgXml.ts';

/**
 * SVG's coordinate systems: the `transform` attribute, the viewport, and the `viewBox` fit.
 *
 * ★ MULTIPLICATION ORDER IS THE WHOLE OF IT. SVG composes an element's own transform onto its parent's, and a viewBox
 * onto the viewport it is fitted into, so every product here is written one way round and it is not the way round the
 * geometry package's `multiplyMatrix` happens to read. `multiplySvgMatrices` exists to name that order once rather
 * than leave each caller to get it right.
 */
export function applySvgTransform(target: Node2D, matrix: Readonly<Matrix> | null): void {
  if (matrix === null) return;
  const transform = createTransform2D();
  decomposeMatrixToTransform2D(transform, matrix);
  assignSvgTransform(target, transform);
}

export function assignSvgTransform(target: Node2D, transform: Readonly<Transform2D>): void {
  target.pivotX = transform.pivotX;
  target.pivotY = transform.pivotY;
  target.rotation = transform.rotation;
  target.scaleX = transform.scaleX;
  target.scaleY = transform.scaleY;
  target.skewX = transform.skewX;
  target.skewY = transform.skewY;
  target.x = transform.x;
  target.y = transform.y;
}

export function createSvgViewBoxMatrix(
  viewBox: readonly number[],
  viewport: Readonly<{ height: number; width: number; x: number; y: number }>,
  preserveAspectRatioValue: string,
): Matrix {
  const { height, width, x, y } = viewport;
  let sx = viewBox[2] === 0 ? 1 : width / viewBox[2];
  let sy = viewBox[3] === 0 ? 1 : height / viewBox[3];
  const preserveAspectRatio = preserveAspectRatioValue.trim();
  if (preserveAspectRatio === 'none') {
    return createMatrix(sx, 0, 0, sy, x - viewBox[0] * sx, y - viewBox[1] * sy);
  }

  const parts = preserveAspectRatio.split(/\s+/);
  const alignment = parts[0] === 'defer' ? (parts[1] ?? 'xMidYMid') : parts[0];
  const mode = parts.includes('slice') ? 'slice' : 'meet';
  const uniformScale = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  sx = uniformScale;
  sy = uniformScale;
  const spareX = width - viewBox[2] * sx;
  const spareY = height - viewBox[3] * sy;
  const alignX = alignment.includes('xMax') ? spareX : alignment.includes('xMid') ? spareX / 2 : 0;
  const alignY = alignment.includes('YMax') ? spareY : alignment.includes('YMid') ? spareY / 2 : 0;
  return createMatrix(sx, 0, 0, sy, x + alignX - viewBox[0] * sx, y + alignY - viewBox[1] * sy);
}

export function createSvgViewportMatrix(
  element: Readonly<XmlElement>,
  viewport?: Readonly<{ height?: number; width?: number; x?: number; y?: number }>,
): Matrix | null {
  const x = viewport?.x ?? svgNumberAttribute(element, 'x', 0);
  const y = viewport?.y ?? svgNumberAttribute(element, 'y', 0);
  const viewBox = parseSvgNumberList(svgAttribute(element, 'viewBox') ?? '');
  if (viewBox.length < 4) return x === 0 && y === 0 ? null : createMatrix(1, 0, 0, 1, x, y);
  const width = viewport?.width ?? parseSvgLength(svgAttribute(element, 'width'), viewBox[2]);
  const height = viewport?.height ?? parseSvgLength(svgAttribute(element, 'height'), viewBox[3]);
  return createSvgViewBoxMatrix(
    viewBox,
    { height, width, x, y },
    svgAttribute(element, 'preserveAspectRatio') ?? 'xMidYMid meet',
  );
}

export function multiplySvgMatrices(a: Readonly<Matrix>, b: Readonly<Matrix>): Matrix {
  const out = createMatrix();
  multiplyMatrix(out, a, b);
  return out;
}

export function parseSvgTransform(value: string | null): Matrix | null {
  if (value === null || value.trim() === '') return null;
  let result = createMatrix();
  const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value)) !== null) {
    matched = true;
    const values = parseSvgNumberList(match[2]);
    let operation = createMatrix();
    if (match[1] === 'matrix' && values.length >= 6) {
      operation = createMatrix(values[0], values[1], values[2], values[3], values[4], values[5]);
    } else if (match[1] === 'translate') {
      operation.tx = values[0] ?? 0;
      operation.ty = values[1] ?? 0;
    } else if (match[1] === 'scale') {
      operation.a = values[0] ?? 1;
      operation.d = values[1] ?? values[0] ?? 1;
    } else if (match[1] === 'rotate') {
      const radians = ((values[0] ?? 0) * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const rotation = createMatrix(cosine, sine, -sine, cosine);
      if (values.length >= 3) {
        operation = multiplySvgMatrices(
          createMatrix(1, 0, 0, 1, values[1], values[2]),
          multiplySvgMatrices(rotation, createMatrix(1, 0, 0, 1, -values[1], -values[2])),
        );
      } else {
        operation = rotation;
      }
    } else if (match[1] === 'skewX') {
      operation.c = Math.tan(((values[0] ?? 0) * Math.PI) / 180);
    } else if (match[1] === 'skewY') {
      operation.b = Math.tan(((values[0] ?? 0) * Math.PI) / 180);
    } else {
      continue;
    }
    result = multiplySvgMatrices(result, operation);
  }
  return matched ? result : null;
}
