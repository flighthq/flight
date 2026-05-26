import { describe, expect, it } from 'vitest';

import { createImageData } from './imageData';
import { encodeImageData } from './encode';

describe('encodeImageData', () => {
  it('returns a non-empty Uint8Array for a simple image', () => {
    const img = createImageData(2, 2, 0xff112233);
    const bytes = encodeImageData(img);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('accepts jpeg format', () => {
    const img = createImageData(2, 2, 0xff112233);
    const bytes = encodeImageData(img, 'jpeg');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
