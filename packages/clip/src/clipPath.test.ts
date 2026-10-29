import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { flattenClipPath } from './clipPath.ts';

describe('flattenClipPath', () => {
  it('writes flattened contours into the caller-owned array', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 1, 2);
    appendPathLineTo(path, 3, 4);
    appendPathLineTo(path, 5, 2);
    const contours: number[][] = [];
    flattenClipPath(contours, path);
    expect(contours).toEqual([[1, 2, 3, 4, 5, 2]]);
  });
});
