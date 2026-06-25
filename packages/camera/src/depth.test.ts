import { createCamera } from './camera';
import { getCameraLinearDepth, getCameraViewSpaceZ } from './depth';
import { createPerspectiveProjection } from './projection';

function makeCamera(near = 0.1, far = 100) {
  return createCamera({
    far,
    near,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
}

describe('getCameraLinearDepth', () => {
  it('returns a negative value for the near plane (ndcZ = -1)', () => {
    const camera = makeCamera(1, 100);
    const depth = getCameraLinearDepth(camera, -1);
    // Near plane: viewZ should be -near
    expect(depth).toBeCloseTo(-1, 3);
  });

  it('returns a negative value for the far plane (ndcZ = 1)', () => {
    const camera = makeCamera(1, 100);
    const depth = getCameraLinearDepth(camera, 1);
    // Far plane: viewZ should be -far
    expect(depth).toBeCloseTo(-100, 2);
  });

  it('returns 0 when near equals far (degenerate clip range)', () => {
    const camera = makeCamera(10, 10);
    expect(getCameraLinearDepth(camera, 0)).toBe(0);
  });

  it('returns a value between -near and -far for a midpoint ndcZ', () => {
    const camera = makeCamera(1, 100);
    // ndcZ = 0 is between near and far planes.
    const depth = getCameraLinearDepth(camera, 0);
    expect(depth).toBeLessThan(-1);
    expect(depth).toBeGreaterThan(-100);
  });
});

describe('getCameraViewSpaceZ', () => {
  it('returns a positive value for the near plane (ndcZ = -1)', () => {
    const camera = makeCamera(1, 100);
    const z = getCameraViewSpaceZ(camera, -1);
    expect(z).toBeCloseTo(1, 3);
  });

  it('returns a positive value for the far plane (ndcZ = 1)', () => {
    const camera = makeCamera(1, 100);
    const z = getCameraViewSpaceZ(camera, 1);
    expect(z).toBeCloseTo(100, 2);
  });

  it('is the negation of getCameraLinearDepth', () => {
    const camera = makeCamera(0.1, 50);
    const ndcZ = 0.5;
    expect(getCameraViewSpaceZ(camera, ndcZ)).toBeCloseTo(-getCameraLinearDepth(camera, ndcZ), 5);
  });

  it('returns 0 for degenerate clip range', () => {
    const camera = makeCamera(5, 5);
    expect(getCameraViewSpaceZ(camera, 0)).toBeCloseTo(0, 5);
  });
});
