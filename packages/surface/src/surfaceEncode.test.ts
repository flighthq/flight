import { createSurface } from './surface';
import { encodeSurface } from './surfaceEncode';

describe('encodeSurface', () => {
  it('returns a non-empty Uint8Array for a simple image', () => {
    const img = createSurface(2, 2, 0x112233ff);
    const bytes = encodeSurface(img);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('accepts jpeg format', () => {
    const img = createSurface(2, 2, 0x112233ff);
    const bytes = encodeSurface(img, 'jpeg');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
