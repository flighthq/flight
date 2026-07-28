import { createBitmap } from './bitmap';
import { encodeBitmap } from './bitmapEncode';

describe('encodeBitmap', () => {
  it('returns a non-empty Uint8Array for a simple image', () => {
    const img = createBitmap(2, 2, 0x112233ff);
    const bytes = encodeBitmap(img);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('accepts jpeg format', () => {
    const img = createBitmap(2, 2, 0x112233ff);
    const bytes = encodeBitmap(img, 'jpeg');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
