import { createMatrix, createVector2, matrixTransformPointXY } from '@flighthq/geometry';
import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d';
import { getCamera2DViewMatrix } from './viewMatrix';

describe('getCamera2DViewMatrix', () => {
  it('maps the camera center world point to the viewport center', () => {
    const camera = createCamera2D(800, 600);
    const view = createMatrix();
    getCamera2DViewMatrix(camera, view);
    const out = createVector2();
    matrixTransformPointXY(out, view, 0, 0);
    expect(out.x).toBeCloseTo(400, 9);
    expect(out.y).toBeCloseTo(300, 9);
  });

  it('projects a right-of-center world point at zoom 1', () => {
    const camera = createCamera2D(800, 600);
    const view = createMatrix();
    getCamera2DViewMatrix(camera, view);
    const out = createVector2();
    matrixTransformPointXY(out, view, 100, 0);
    expect(out.x).toBeCloseTo(500, 9);
    expect(out.y).toBeCloseTo(300, 9);
  });

  it('magnifies about the center at zoom 2', () => {
    const camera = createCamera2D(800, 600, { zoom: 2 });
    const view = createMatrix();
    getCamera2DViewMatrix(camera, view);
    const out = createVector2();
    matrixTransformPointXY(out, view, 100, 0);
    expect(out.x).toBeCloseTo(600, 9);
    expect(out.y).toBeCloseTo(300, 9);
  });

  it('rotates the view opposite the camera rotation', () => {
    // Camera3D rotated +90deg (CCW): a world point to the right appears above the center.
    const camera = createCamera2D(800, 600, { rotation: Math.PI / 2 });
    const view = createMatrix();
    getCamera2DViewMatrix(camera, view);
    const out = createVector2();
    matrixTransformPointXY(out, view, 100, 0);
    expect(out.x).toBeCloseTo(400, 9);
    expect(out.y).toBeCloseTo(200, 9);
  });
});
