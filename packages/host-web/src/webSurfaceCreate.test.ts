import {
  createWebSurfaceCreateCapability,
  initializeWebSurfaceCreateCapability,
  webSurfaceCreateCapability,
} from './webSurfaceCreate';

describe('createWebSurfaceCreateCapability', () => {
  it('returns a capability whose createSurface creates a canvas with the requested dimensions', () => {
    const cap = createWebSurfaceCreateCapability();
    const canvas = cap.createSurface(800, 600);

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('destroySurface zeroes the backing store', () => {
    const cap = createWebSurfaceCreateCapability();
    const canvas = cap.createSurface(100, 100);

    cap.destroySurface(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

describe('initializeWebSurfaceCreateCapability', () => {
  it('populates an entity construction with surface methods', () => {
    const out = {} as Parameters<typeof initializeWebSurfaceCreateCapability>[0];
    initializeWebSurfaceCreateCapability(out);

    expect(typeof out.createSurface).toBe('function');
    expect(typeof out.destroySurface).toBe('function');
  });
});

describe('webSurfaceCreateCapability', () => {
  it('is a pre-built instance with the same behavior', () => {
    const canvas = webSurfaceCreateCapability.createSurface(200, 150);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });
});
