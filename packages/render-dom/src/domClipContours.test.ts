import { createMatrix } from '@flighthq/geometry';
import type { DOMClipContourEntry } from '@flighthq/types';

import { buildDOMContourClipPath, pushDOMClipContours } from './domClipContours';

const identityMap = (x: number, y: number): readonly [number, number] => [x, y];

describe('buildDOMContourClipPath', () => {
  it('emits a polygon() for a single contour', () => {
    const entry: DOMClipContourEntry = {
      kind: 'contour',
      contours: [[0, 0, 10, 0, 10, 10, 0, 10]],
      winding: 'nonZero',
    };
    expect(buildDOMContourClipPath(entry, identityMap)).toBe('polygon(0px 0px, 10px 0px, 10px 10px, 0px 10px)');
  });

  it('emits a path() with fill-rule for multiple contours', () => {
    const entry: DOMClipContourEntry = {
      kind: 'contour',
      contours: [
        [0, 0, 10, 0, 10, 10],
        [2, 2, 4, 2, 4, 4],
      ],
      winding: 'evenOdd',
    };
    const result = buildDOMContourClipPath(entry, identityMap);
    expect(result.startsWith("path('evenodd', '")).toBe(true);
    expect(result).toContain('M0 0 L10 0 L10 10 Z');
    expect(result).toContain('M2 2 L4 2 L4 4 Z');
  });

  it('maps points through the provided mapper', () => {
    const entry: DOMClipContourEntry = { kind: 'contour', contours: [[0, 0, 2, 0, 2, 2]], winding: 'nonZero' };
    const shift = (x: number, y: number): readonly [number, number] => [x + 5, y + 1];
    expect(buildDOMContourClipPath(entry, shift)).toBe('polygon(5px 1px, 7px 1px, 7px 3px)');
  });
});

describe('pushDOMClipContours', () => {
  it('pushes a contour entry with points transformed to stage space', () => {
    const stack: DOMClipContourEntry[] = [];
    const transform = createMatrix();
    transform.tx = 100;
    transform.ty = 50;
    pushDOMClipContours(stack, [[0, 0, 10, 0, 10, 10]], 'nonZero', transform);
    expect(stack.length).toBe(1);
    expect(stack[0].kind).toBe('contour');
    expect(stack[0].winding).toBe('nonZero');
    expect(stack[0].contours).toEqual([[100, 50, 110, 50, 110, 60]]);
  });

  it('applies the full affine transform to each point', () => {
    const stack: DOMClipContourEntry[] = [];
    const transform = createMatrix();
    transform.a = 2;
    transform.d = 3;
    pushDOMClipContours(stack, [[1, 1]], 'evenOdd', transform);
    expect(stack[0].contours).toEqual([[2, 3]]);
    expect(stack[0].winding).toBe('evenOdd');
  });
});
