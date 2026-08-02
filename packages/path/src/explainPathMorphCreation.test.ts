import { explainPathMorphCreation } from './explainPathMorphCreation';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('explainPathMorphCreation', () => {
  it('reports a compatible pair', () => {
    expect(explainPathMorphCreation(createPath(), createPath())).toStrictEqual({
      contour: null,
      reason: 'ok',
      supported: true,
    });
  });

  it('reports a winding mismatch', () => {
    expect(explainPathMorphCreation(createPath('nonZero'), createPath('evenOdd'))).toStrictEqual({
      contour: null,
      reason: 'winding-mismatch',
      supported: false,
    });
  });

  it('reports a contour-count mismatch', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    expect(explainPathMorphCreation(start, createPath())).toStrictEqual({
      contour: null,
      reason: 'contour-count-mismatch',
      supported: false,
    });
  });

  it('reports the first contour with different closedness', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 1, 0);
    appendPathMoveTo(start, 10, 10);
    appendPathLineTo(start, 11, 10);
    appendPathClose(start);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 1, 0);
    appendPathMoveTo(end, 10, 10);
    appendPathLineTo(end, 11, 10);

    expect(explainPathMorphCreation(start, end)).toStrictEqual({
      contour: 1,
      reason: 'contour-closedness-mismatch',
      supported: false,
    });
  });

  it('reports a non-zero path that reverses only a subset of its contours', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 20, 0);
    appendPathLineTo(start, 20, 20);
    appendPathLineTo(start, 0, 20);
    appendPathClose(start);
    appendPathMoveTo(start, 5, 5);
    appendPathLineTo(start, 15, 5);
    appendPathLineTo(start, 15, 15);
    appendPathLineTo(start, 5, 15);
    appendPathClose(start);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 20, 0);
    appendPathLineTo(end, 20, 20);
    appendPathLineTo(end, 0, 20);
    appendPathClose(end);
    appendPathMoveTo(end, 5, 5);
    appendPathLineTo(end, 5, 15);
    appendPathLineTo(end, 15, 15);
    appendPathLineTo(end, 15, 5);
    appendPathClose(end);

    expect(explainPathMorphCreation(start, end)).toStrictEqual({
      contour: 1,
      reason: 'contour-orientation-mismatch',
      supported: false,
    });
  });
});
