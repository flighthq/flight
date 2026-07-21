import { createCamera2D } from '@flighthq/camera';
import { getCamera2DVisibleBounds } from '@flighthq/camera';
import { createRectangle } from '@flighthq/geometry';
import { describe, expect, it } from 'vitest';

import { updateCamera2DFollow } from './follow';

describe('updateCamera2DFollow', () => {
  it('does not move when the target is inside the deadzone', () => {
    const camera = createCamera2D(800, 600);
    updateCamera2DFollow(camera, 50, 30, 0.016, { deadzoneHalfWidth: 100, deadzoneHalfHeight: 100 });
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
  });

  it('moves partway toward the target with smoothing over one step', () => {
    const camera = createCamera2D(800, 600);
    updateCamera2DFollow(camera, 100, 0, 0.016, { smoothTime: 0.1 });
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.x).toBeLessThan(100);
    expect(camera.y).toBeCloseTo(0, 9);
  });

  it('snaps the target onto the deadzone edge when smoothTime is 0', () => {
    const camera = createCamera2D(800, 600);
    updateCamera2DFollow(camera, 300, 0, 0.016, { deadzoneHalfWidth: 100, smoothTime: 0 });
    // Goal moves the minimum so the target sits exactly on the deadzone edge (300 - 100).
    expect(camera.x).toBe(200);
    expect(camera.y).toBe(0);
  });

  it('clamps the camera so the visible bounds stay inside world bounds', () => {
    const camera = createCamera2D(800, 600);
    const worldBounds = createRectangle(0, 0, 2000, 2000);
    updateCamera2DFollow(camera, 1900, 1000, 0.016, { smoothTime: 0, worldBounds });
    // Half view is 400x300, so the center clamps to [400, 1600] x [300, 1700].
    expect(camera.x).toBe(1600);
    expect(camera.y).toBe(1000);
    const visible = createRectangle();
    getCamera2DVisibleBounds(camera, visible);
    expect(visible.x).toBeGreaterThanOrEqual(worldBounds.x - 1e-9);
    expect(visible.y).toBeGreaterThanOrEqual(worldBounds.y - 1e-9);
    expect(visible.x + visible.width).toBeLessThanOrEqual(worldBounds.x + worldBounds.width + 1e-9);
    expect(visible.y + visible.height).toBeLessThanOrEqual(worldBounds.y + worldBounds.height + 1e-9);
  });

  it('centers the camera on an axis where the world is smaller than the view', () => {
    const camera = createCamera2D(800, 600);
    // World is only 400 wide (< 800 view), so x centers on the world midpoint.
    const worldBounds = createRectangle(0, 0, 400, 2000);
    updateCamera2DFollow(camera, 1900, 1000, 0.016, { smoothTime: 0, worldBounds });
    expect(camera.x).toBe(200);
    expect(camera.y).toBe(1000);
  });
});
