import { createMatrix4, createPerspectiveMatrix4, setOrthographicMatrix4 } from '@flighthq/geometry';
import type { OrthographicProjection, PerspectiveProjection } from '@flighthq/types';

import {
  createOrthographicProjection,
  createPerspectiveProjection,
  isOrthographicProjection,
  isPerspectiveProjection,
  setProjectionMatrix4,
} from './projection';

describe('createOrthographicProjection', () => {
  it('builds an orthographic descriptor from half-extents', () => {
    const projection = createOrthographicProjection({ halfHeight: 3, halfWidth: 4 });
    expect(projection.kind).toBe('orthographic');
    expect(projection.halfWidth).toBe(4);
    expect(projection.halfHeight).toBe(3);
  });
});

describe('createPerspectiveProjection', () => {
  it('builds a perspective descriptor from fovY and aspect', () => {
    const projection = createPerspectiveProjection({ aspect: 1.5, fovY: Math.PI / 3 });
    expect(projection.kind).toBe('perspective');
    expect(projection.fovY).toBeCloseTo(Math.PI / 3);
    expect(projection.aspect).toBe(1.5);
  });

  it('defaults aspect to 1 when omitted', () => {
    const projection = createPerspectiveProjection({ fovY: 1 });
    expect(projection.aspect).toBe(1);
  });
});

describe('isOrthographicProjection', () => {
  it('is true for orthographic and false for perspective', () => {
    const ortho = createOrthographicProjection({ halfHeight: 1, halfWidth: 1 });
    const persp = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    expect(isOrthographicProjection(ortho)).toBe(true);
    expect(isOrthographicProjection(persp)).toBe(false);
  });
});

describe('isPerspectiveProjection', () => {
  it('is true for perspective and false for orthographic', () => {
    const persp = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const ortho = createOrthographicProjection({ halfHeight: 1, halfWidth: 1 });
    expect(isPerspectiveProjection(persp)).toBe(true);
    expect(isPerspectiveProjection(ortho)).toBe(false);
  });
});

describe('setProjectionMatrix4', () => {
  it('matches geometry perspective builder using tan(fovY/2)', () => {
    const fovY = Math.PI / 2;
    const aspect = 1.6;
    const near = 0.1;
    const far = 100;
    const projection: PerspectiveProjection = createPerspectiveProjection({ aspect, fovY });

    const out = createMatrix4();
    setProjectionMatrix4(out, projection, aspect, near, far);

    const expected = createPerspectiveMatrix4(Math.tan(fovY * 0.5), aspect, near, far);
    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('uses the passed aspect over the projection stored aspect for perspective', () => {
    const fovY = 1;
    const projection = createPerspectiveProjection({ aspect: 1, fovY });

    const out = createMatrix4();
    setProjectionMatrix4(out, projection, 2, 0.5, 50);

    const expected = createPerspectiveMatrix4(Math.tan(fovY * 0.5), 2, 0.5, 50);
    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('matches geometry orthographic builder using symmetric half-extents', () => {
    const projection: OrthographicProjection = createOrthographicProjection({ halfHeight: 3, halfWidth: 5 });
    const near = 1;
    const far = 20;

    const out = createMatrix4();
    setProjectionMatrix4(out, projection, 99, near, far);

    const expected = createMatrix4();
    setOrthographicMatrix4(expected, -5, 5, -3, 3, near, far);
    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});
