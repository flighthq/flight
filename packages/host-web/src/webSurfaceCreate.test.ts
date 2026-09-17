import {
  createWebSurfaceCreateCapability,
  initializeWebSurfaceCreateCapability,
  webSurfaceCreateCapability,
} from './webSurfaceCreate';

describe('createWebSurfaceCreateCapability', () => {
  it('returns a capability whose createRenderSurface creates a correctly sized canvas', () => {
    const cap = createWebSurfaceCreateCapability();
    const canvas = cap.createRenderSurface(400, 300, 2);

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('300px');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('destroyRenderSurface zeroes the backing store', () => {
    const cap = createWebSurfaceCreateCapability();
    const canvas = cap.createRenderSurface(100, 100, 1);

    cap.destroyRenderSurface(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

describe('initializeWebSurfaceCreateCapability', () => {
  it('populates an entity construction with surface methods', () => {
    const out = {} as Parameters<typeof initializeWebSurfaceCreateCapability>[0];
    initializeWebSurfaceCreateCapability(out);

    expect(typeof out.createRenderSurface).toBe('function');
    expect(typeof out.destroyRenderSurface).toBe('function');
  });
});

describe('webSurfaceCreateCapability', () => {
  it('is a pre-built instance with the same behavior', () => {
    const canvas = webSurfaceCreateCapability.createRenderSurface(200, 150, 1);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.style.width).toBe('200px');
    expect(canvas.style.height).toBe('150px');
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });
});
