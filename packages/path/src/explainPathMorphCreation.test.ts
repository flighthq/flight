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
});
