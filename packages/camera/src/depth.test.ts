import { createCamera3D } from './camera';
import { getCamera3DLinearDepth, getCamera3DViewSpaceZ } from './depth';
import { createOrthographicProjection, createPerspectiveProjection } from './projection';

function makeCamera(near = 0.1, far = 100) {
  return createCamera3D({
    far,
    near,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
}

describe('getCamera3DLinearDepth', () => {
  it('returns a negative value for the near plane (ndcZ = -1)', () => {
    const camera = makeCamera(1, 100);
    const depth = getCamera3DLinearDepth(camera, -1);
    // Near plane: viewZ should be -near
    expect(depth).toBeCloseTo(-1, 3);
  });

  it('returns a negative value for the far plane (ndcZ = 1)', () => {
    const camera = makeCamera(1, 100);
    const depth = getCamera3DLinearDepth(camera, 1);
    // Far plane: viewZ should be -far
    expect(depth).toBeCloseTo(-100, 2);
  });

  it('returns 0 when near equals far (degenerate clip range)', () => {
    const camera = makeCamera(10, 10);
    expect(getCamera3DLinearDepth(camera, 0)).toBe(0);
  });

  it('returns a value between -near and -far for a midpoint ndcZ', () => {
    const camera = makeCamera(1, 100);
    // ndcZ = 0 is between near and far planes.
    const depth = getCamera3DLinearDepth(camera, 0);
    expect(depth).toBeLessThan(-1);
    expect(depth).toBeGreaterThan(-100);
  });

  it('linearly maps orthographic NDC depth to the clip range', () => {
    const camera = createCamera3D({
      far: 101,
      near: 1,
      projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
    });

    expect(getCamera3DLinearDepth(camera, -1)).toBeCloseTo(-1);
    expect(getCamera3DLinearDepth(camera, 0)).toBeCloseTo(-51);
    expect(getCamera3DLinearDepth(camera, 1)).toBeCloseTo(-101);
  });
});

describe('getCamera3DViewSpaceZ', () => {
  it('returns a positive value for the near plane (ndcZ = -1)', () => {
    const camera = makeCamera(1, 100);
    const z = getCamera3DViewSpaceZ(camera, -1);
    expect(z).toBeCloseTo(1, 3);
  });

  it('returns a positive value for the far plane (ndcZ = 1)', () => {
    const camera = makeCamera(1, 100);
    const z = getCamera3DViewSpaceZ(camera, 1);
    expect(z).toBeCloseTo(100, 2);
  });

  it('is the negation of getCamera3DLinearDepth', () => {
    const camera = makeCamera(0.1, 50);
    const ndcZ = 0.5;
    expect(getCamera3DViewSpaceZ(camera, ndcZ)).toBeCloseTo(-getCamera3DLinearDepth(camera, ndcZ), 5);
  });

  it('returns 0 for degenerate clip range', () => {
    const camera = makeCamera(5, 5);
    expect(getCamera3DViewSpaceZ(camera, 0)).toBeCloseTo(0, 5);
  });
});
