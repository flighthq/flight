import { createSurface } from '@flighthq/surface';

import { applySurfaceBevelFilter } from './bevel';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// 5x1 strip with a single alpha edge: transparent | transparent | opaque | opaque | opaque.
function edgeStrip() {
  const s = createSurface(5, 1);
  for (let x = 2; x < 5; x++) s.data[x * 4 + 3] = 255;
  return s;
}

describe('applySurfaceBevelFilter', () => {
  it('highlights the light-facing edge and shades the opposite edge', () => {
    // Light from the left (angle π). With blurX=2 the blurred alpha is
    // [0, 85, 170, 255, 255]; the gradient highlights the left edge of the
    // shape and shadows the right edge.
    const source = edgeStrip();
    const out = new Uint8ClampedArray(5 * 4);
    const blurBuffer = new Uint8ClampedArray(5 * 4);
    applySurfaceBevelFilter(out, blurBuffer, region(source), {
      angle: Math.PI,
      distance: 1,
      blurX: 2,
      blurY: 0,
      type: 'full',
      highlightColor: 0xffffff,
      shadowColor: 0x000000,
    });
    // Left edge: white highlight.
    expect(out[2 * 4 + 0]).toBe(255);
    expect(out[2 * 4 + 1]).toBe(255);
    expect(out[2 * 4 + 2]).toBe(255);
    expect(out[2 * 4 + 3]).toBe(170);
    // Right edge of the strip faces away from the light: black shadow.
    expect(out[4 * 4 + 0]).toBe(0);
    expect(out[4 * 4 + 1]).toBe(0);
    expect(out[4 * 4 + 2]).toBe(0);
    expect(out[4 * 4 + 3]).toBe(255);
  });

  it("'inner' type clips the bevel to inside the shape", () => {
    const source = edgeStrip();
    const out = new Uint8ClampedArray(5 * 4);
    const blurBuffer = new Uint8ClampedArray(5 * 4);
    applySurfaceBevelFilter(out, blurBuffer, region(source), {
      angle: Math.PI,
      distance: 1,
      blurX: 2,
      blurY: 0,
      type: 'inner',
    });
    // x0/x1 are outside the shape (source alpha 0) → clipped to 0.
    expect(out[0 * 4 + 3]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(0);
    // x2 is inside the shape → highlight survives.
    expect(out[2 * 4 + 3]).toBe(170);
  });
});
