import {
  createCanvasTextureRenderTarget,
  destroyCanvasTextureRenderTarget,
  initializeCanvasTextureRenderTarget,
  resizeCanvasTextureRenderTarget,
} from './canvasTestSupport';

describe('createCanvasTextureRenderTarget', () => {
  it('creates a canvas with the requested dimensions', () => {
    const target = createCanvasTextureRenderTarget(128, 64);
    expect(target.canvas.width).toBe(128);
    expect(target.canvas.height).toBe(64);
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });

  it('enforces a minimum size of 1', () => {
    const target = createCanvasTextureRenderTarget(0, 0);
    expect(target.canvas.width).toBe(1);
    expect(target.canvas.height).toBe(1);
  });

  it('ceils fractional dimensions', () => {
    const target = createCanvasTextureRenderTarget(10.3, 20.9);
    expect(target.canvas.width).toBe(11);
    expect(target.canvas.height).toBe(21);
  });

  // Teardown asks the target who owns its surface rather than guessing from its shape, so the two
  // realizations have to declare it: freeing a host's canvas and leaking Flight's own are the two
  // mistakes the split exists to prevent.
  it('declares Flight ownership of the surface it allocated', () => {
    expect(createCanvasTextureRenderTarget(16, 16).surfaceOwnership).toBe('flight');
  });
});

describe('destroyCanvasTextureRenderTarget', () => {
  it('collapses the canvas to zero size', () => {
    const target = createCanvasTextureRenderTarget(64, 32);
    destroyCanvasTextureRenderTarget(target);
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });

  it('sets target width and height to zero', () => {
    const target = createCanvasTextureRenderTarget(128, 64);
    destroyCanvasTextureRenderTarget(target);
    expect(target.width).toBe(0);
    expect(target.height).toBe(0);
  });
});

describe('initializeCanvasTextureRenderTarget', () => {
  it('is the construction initializer of createCanvasTextureRenderTarget', () => {
    expect(typeof initializeCanvasTextureRenderTarget).toBe('function');
  });
});

describe('resizeCanvasTextureRenderTarget', () => {
  it('updates the canvas and target dimensions', () => {
    const target = createCanvasTextureRenderTarget(64, 64);
    resizeCanvasTextureRenderTarget(target, 256, 128);
    expect(target.canvas.width).toBe(256);
    expect(target.canvas.height).toBe(128);
    expect(target.width).toBe(256);
    expect(target.height).toBe(128);
  });
});
