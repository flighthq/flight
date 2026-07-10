import { createVector2 } from '@flighthq/geometry';
import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d';
import { getCamera2DParallaxPoint } from './parallax';

describe('getCamera2DParallaxPoint', () => {
  it('returns no offset at factor 0 (screen-locked layer)', () => {
    const camera = createCamera2D(800, 600, { x: 100, y: 50 });
    const out = createVector2();
    getCamera2DParallaxPoint(camera, 0, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(0, 9);
  });

  it('returns the full camera screen offset at factor 1 (world-locked layer)', () => {
    const camera = createCamera2D(800, 600, { x: 100, y: 50 });
    const out = createVector2();
    getCamera2DParallaxPoint(camera, 1, out);
    expect(out.x).toBeCloseTo(-100, 9);
    expect(out.y).toBeCloseTo(-50, 9);
  });

  it('returns half the camera offset at factor 0.5', () => {
    const camera = createCamera2D(800, 600, { x: 100, y: 50 });
    const out = createVector2();
    getCamera2DParallaxPoint(camera, 0.5, out);
    expect(out.x).toBeCloseTo(-50, 9);
    expect(out.y).toBeCloseTo(-25, 9);
  });
});
