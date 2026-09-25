import { describe, expect, it } from 'vitest';

import { createCamera2D, initializeCamera2D, setCamera2DLookAt } from './camera2d.ts';

describe('createCamera2D', () => {
  it('uses identity defaults for an unconfigured camera', () => {
    const camera = createCamera2D();
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
    expect(camera.rotation).toBe(0);
  });

  it('applies overrides from options', () => {
    const camera = createCamera2D({ x: 10, y: 20, zoom: 2, rotation: Math.PI / 4 });
    expect(camera.x).toBe(10);
    expect(camera.y).toBe(20);
    expect(camera.zoom).toBe(2);
    expect(camera.rotation).toBeCloseTo(Math.PI / 4, 12);
  });
});
describe('initializeCamera2D', () => {
  it('is the construction initializer of createCamera2D', () => {
    expect(typeof initializeCamera2D).toBe('function');
  });
});

describe('setCamera2DLookAt', () => {
  it('centers the camera on a world position', () => {
    const camera = createCamera2D();
    setCamera2DLookAt(camera, 100, 200);
    expect(camera.x).toBe(100);
    expect(camera.y).toBe(200);
  });

  it('overwrites a previous position', () => {
    const camera = createCamera2D({ x: 50, y: 60 });
    setCamera2DLookAt(camera, -10, 30);
    expect(camera.x).toBe(-10);
    expect(camera.y).toBe(30);
  });
});
