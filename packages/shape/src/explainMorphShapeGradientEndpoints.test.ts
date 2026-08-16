import {
  explainMorphShapeGradientEndpoints,
  getMorphShapeGradientEndpointIssue,
} from './explainMorphShapeGradientEndpoints';

describe('explainMorphShapeGradientEndpoints', () => {
  it('reports compatible equal-length gradient stops', () => {
    expect(
      explainMorphShapeGradientEndpoints(
        { alphas: [1], colors: [0], ratios: [0] },
        { alphas: [1], colors: [0xffffffff], ratios: [255] },
      ),
    ).toStrictEqual({ endStopCount: 1, reason: 'ok', startStopCount: 1, supported: true });
  });

  it.each([
    [{ alphas: [], colors: [], ratios: [] }, { alphas: [], colors: [], ratios: [] }, 'empty-gradient'],
    [
      { alphas: [], colors: [0], ratios: [0] },
      { alphas: [1], colors: [0], ratios: [0] },
      'start-stop-component-count-mismatch',
    ],
    [
      { alphas: [1], colors: [0], ratios: [0] },
      { alphas: [], colors: [0], ratios: [0] },
      'end-stop-component-count-mismatch',
    ],
    [
      { alphas: [1], colors: [0], ratios: [0] },
      { alphas: [1, 1], colors: [0, 1], ratios: [0, 255] },
      'stop-count-mismatch',
    ],
  ])('reports incompatible topology as %s', (start, end, reason) => {
    expect(explainMorphShapeGradientEndpoints(start, end)).toMatchObject({ reason, supported: false });
  });
});

describe('getMorphShapeGradientEndpointIssue', () => {
  it('provides a string-free compatibility seam for paint construction', () => {
    expect(
      getMorphShapeGradientEndpointIssue(
        { alphas: [1], colors: [0], ratios: [0] },
        { alphas: [1], colors: [0xffffffff], ratios: [255] },
      ),
    ).toBe(0);
  });
});
