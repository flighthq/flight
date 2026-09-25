import { createVector2 } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d.ts';
import { projectCamera2DPoint, unprojectCamera2DPoint } from './projection2d.ts';

describe('projectCamera2DPoint', () => {
  it('projects the camera center to the viewport center', () => {
    const camera = createCamera2D();
    const out = createVector2();
    projectCamera2DPoint(camera, 800, 600, 0, 0, out);
    expect(out.x).toBeCloseTo(400, 9);
    expect(out.y).toBeCloseTo(300, 9);
  });

  it('accounts for zoom', () => {
    const camera = createCamera2D({ zoom: 2 });
    const out = createVector2();
    projectCamera2DPoint(camera, 800, 600, 100, 0, out);
    expect(out.x).toBeCloseTo(600, 9);
    expect(out.y).toBeCloseTo(300, 9);
  });
});

describe('unprojectCamera2DPoint', () => {
  it('unprojects the viewport center to the camera position', () => {
    const camera = createCamera2D({ x: 25, y: 40 });
    const out = createVector2();
    unprojectCamera2DPoint(camera, 800, 600, 400, 300, out);
    expect(out.x).toBeCloseTo(25, 9);
    expect(out.y).toBeCloseTo(40, 9);
  });

  it('round-trips project then unproject across zooms and rotations', () => {
    const cameras = [
      createCamera2D(),
      createCamera2D({ x: 120, y: -80, zoom: 2 }),
      createCamera2D({ x: -50, y: 200, zoom: 0.5, rotation: Math.PI / 3 }),
      createCamera2D({ x: 10, y: 10, zoom: 1.5, rotation: -Math.PI / 6 }),
    ];
    const viewports: ReadonlyArray<readonly [number, number]> = [
      [800, 600],
      [800, 600],
      [1024, 768],
      [640, 480],
    ];
    const points: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [100, 0],
      [-250, 175],
      [512, -333],
    ];
    const screen = createVector2();
    const world = createVector2();
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      const [vw, vh] = viewports[i];
      for (const [px, py] of points) {
        projectCamera2DPoint(camera, vw, vh, px, py, screen);
        unprojectCamera2DPoint(camera, vw, vh, screen.x, screen.y, world);
        expect(world.x).toBeCloseTo(px, 6);
        expect(world.y).toBeCloseTo(py, 6);
      }
    }
  });
});
