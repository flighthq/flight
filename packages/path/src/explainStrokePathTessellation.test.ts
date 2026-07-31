import { explainStrokePathTessellation } from './explainStrokePathTessellation';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';

describe('explainStrokePathTessellation', () => {
  it('reports a supported simple closed ring', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    expect(explainStrokePathTessellation(path, { width: 10 })).toEqual({
      reason: 'ok',
      subpath: null,
      supported: true,
    });
  });

  it('identifies the self-intersecting subpath behind a null mesh', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 40, 40);
    appendPathLineTo(path, 0, 40);
    appendPathLineTo(path, 40, 0);
    appendPathClose(path);
    expect(explainStrokePathTessellation(path, { width: 8 })).toEqual({
      reason: 'self-intersecting-centerline',
      subpath: 0,
      supported: false,
    });
  });

  it('reports invalid style input without throwing', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    expect(explainStrokePathTessellation(path, { width: 0 })).toEqual({
      reason: 'invalid-style',
      subpath: null,
      supported: false,
    });
  });
});
