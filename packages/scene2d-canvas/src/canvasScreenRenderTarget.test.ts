import { beginCanvasRenderPass, endCanvasRenderPass } from './canvasRenderPass';
import { createCanvasRenderSurface } from './canvasRenderSurface';
import {
  createCanvasScreenRenderTarget,
  disposeCanvasScreenRenderTarget,
  initializeCanvasScreenRenderTarget,
  isCanvasScreenRenderTarget,
} from './canvasScreenRenderTarget';
import {
  canvasTestSurfaceCreator,
  createCanvasRenderStateWithoutPass,
  createCanvasTextureRenderTarget,
} from './canvasTestSupport';

function makeSurface(width = 320, height = 240) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return createCanvasRenderSurface(canvasTestSurfaceCreator, canvas);
}

describe('createCanvasScreenRenderTarget', () => {
  it('takes the host surface and carries its canvas, context and extent', () => {
    const surface = makeSurface(320, 240);

    const screen = createCanvasScreenRenderTarget(surface);

    expect(screen.canvas).toBe(surface.canvas);
    expect(screen.context).toBe(surface.context);
    expect(screen.colorAttachments).toBe(1);
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(240);
  });

  it('declares the surface as the caller’s, not Flight’s', () => {
    expect(createCanvasScreenRenderTarget(makeSurface()).surfaceOwnership).toBe('caller');
  });
});

describe('disposeCanvasScreenRenderTarget', () => {
  // ★ THE HOST STILL OWNS THE CANVAS. A texture target destroys the storage it allocated; a screen
  // target must not, because the element came from the caller and outlives the target. Collapsing it
  // here would blank the page's canvas on teardown.
  it('unbinds without collapsing the caller’s canvas', () => {
    const surface = makeSurface(200, 100);
    const screen = createCanvasScreenRenderTarget(surface);

    disposeCanvasScreenRenderTarget(screen);

    expect(surface.canvas.width).toBe(200);
    expect(surface.canvas.height).toBe(100);
    expect(screen.width).toBe(0);
  });
});

describe('initializeCanvasScreenRenderTarget', () => {
  it('is the construction initializer of createCanvasScreenRenderTarget', () => {
    expect(typeof initializeCanvasScreenRenderTarget).toBe('function');
  });
});

describe('isCanvasScreenRenderTarget', () => {
  it('separates the two realizations by the ownership they declare', () => {
    const state = createCanvasRenderStateWithoutPass();
    const screen = createCanvasScreenRenderTarget(makeSurface());
    const texture = createCanvasTextureRenderTarget(16, 16);

    expect(isCanvasScreenRenderTarget(screen)).toBe(true);
    expect(isCanvasScreenRenderTarget(texture)).toBe(false);

    // Both bind the same way — the split is about teardown, not about what a pass can draw into.
    endCanvasRenderPass(beginCanvasRenderPass(state, screen));
    endCanvasRenderPass(beginCanvasRenderPass(state, texture));
  });
});
