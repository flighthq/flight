import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d';

describe('createCamera2D', () => {
  it('uses identity defaults for an unconfigured camera', () => {
    const camera = createCamera2D(800, 600);
    expect(camera.viewportWidth).toBe(800);
    expect(camera.viewportHeight).toBe(600);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
    expect(camera.rotation).toBe(0);
  });

  it('applies overrides from options', () => {
    const camera = createCamera2D(1024, 768, { x: 10, y: 20, zoom: 2, rotation: Math.PI / 4 });
    expect(camera.x).toBe(10);
    expect(camera.y).toBe(20);
    expect(camera.zoom).toBe(2);
    expect(camera.rotation).toBeCloseTo(Math.PI / 4, 12);
  });
});
