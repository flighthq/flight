import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { explainOffsetPath, explainSimplifyPath } from './explainPathBoolean';

describe('explainOffsetPath', () => {
  it('distinguishes empty, invalid, collapsed, and viable results', () => {
    expect(explainOffsetPath(createPath(), 1)?.reason).toBe('empty-input');
    const square = createPath();
    appendPathMoveTo(square, 0, 0);
    appendPathLineTo(square, 1, 0);
    appendPathLineTo(square, 1, 1);
    appendPathLineTo(square, 0, 1);
    appendPathClose(square);
    expect(explainOffsetPath(square, Number.NaN)?.reason).toBe('non-finite-delta');
    expect(explainOffsetPath(square, -1)?.reason).toBe('collapsed-or-degenerate');
    expect(explainOffsetPath(square, 1)).toBeNull();
  });
});

describe('explainSimplifyPath', () => {
  it('distinguishes empty input from a viable region', () => {
    expect(explainSimplifyPath(createPath())?.reason).toBe('empty-input');
    const triangle = createPath();
    appendPathMoveTo(triangle, 0, 0);
    appendPathLineTo(triangle, 1, 0);
    appendPathLineTo(triangle, 0, 1);
    appendPathClose(triangle);
    expect(explainSimplifyPath(triangle)).toBeNull();
  });
});
