import { createVector2 } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d.ts';
import { unprojectCamera2DPoint } from './projection2d.ts';
import { zoomCamera2DAtScreenPoint } from './zoom.ts';

describe('zoomCamera2DAtScreenPoint', () => {
  it('keeps the world point under a screen corner fixed while zooming', () => {
    const camera = createCamera2D();
    const before = createVector2();
    unprojectCamera2DPoint(camera, 800, 600, 0, 0, before);

    zoomCamera2DAtScreenPoint(camera, 800, 600, 0, 0, 2);

    const after = createVector2();
    unprojectCamera2DPoint(camera, 800, 600, 0, 0, after);
    expect(camera.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    // The invariant corner is the top-left world point of the default view.
    expect(after.x).toBeCloseTo(-400, 9);
    expect(after.y).toBeCloseTo(-300, 9);
  });

  it('keeps an arbitrary screen point fixed under a rotated camera', () => {
    const camera = createCamera2D({ x: 30, y: -20, zoom: 1.5, rotation: Math.PI / 5 });
    const before = createVector2();
    unprojectCamera2DPoint(camera, 800, 600, 250, 175, before);

    zoomCamera2DAtScreenPoint(camera, 800, 600, 250, 175, 3);

    const after = createVector2();
    unprojectCamera2DPoint(camera, 800, 600, 250, 175, after);
    expect(camera.zoom).toBe(3);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
