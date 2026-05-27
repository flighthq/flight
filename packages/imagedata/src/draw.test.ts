import { describe, expect, it } from 'vitest';

import { drawImageData } from './draw';
import { createImageData } from './imageData';

describe('drawImageData', () => {
  it('does not throw when drawing onto a canvas', () => {
    const src = createImageData(2, 2, 0xff112233);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawImageData(canvas, src, 0, 0)).not.toThrow();
  });

  it('does not throw when drawing at an offset', () => {
    const src = createImageData(2, 2, 0xff112233);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    expect(() => drawImageData(canvas, src, 2, 2)).not.toThrow();
  });
});
