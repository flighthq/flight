import { createCanvasSurfaceFromNativeHandle } from '@flighthq/surface/contract';
import type { CanvasSurface } from '@flighthq/types/contract';

import { beginCanvasRenderPass, endCanvasRenderPass } from './canvasRenderPass';
import {
  createCanvasScreenRenderTarget,
  disposeCanvasScreenRenderTarget,
  initializeCanvasScreenRenderTarget,
  isCanvasScreenRenderTarget,
} from './canvasScreenRenderTarget';
import {
  canvasTestHost,
  createCanvasRenderStateWithoutPass,
  createCanvasTextureRenderTarget,
} from './canvasTestSupport';

function makeSurface(width = 320, height = 240): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const surface = createCanvasSurfaceFromNativeHandle(canvasTestHost, canvas);
  if (surface === null) throw new Error('Failed to create test surface');
  return surface;
}

describe('createCanvasScreenRenderTarget', () => {
  it('takes the host surface and carries its canvas, context and extent', () => {
    const surface = makeSurface(320, 240);

    const screen = createCanvasScreenRenderTarget(surface);

    expect(screen.canvas).toBe(surface.context.canvas);
    expect(screen.context).toBe(surface.context);
    expect(screen.colorAttachments).toBe(1);
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(240);
  });

  it("declares the surface as the caller's, not Flight's", () => {
    expect(createCanvasScreenRenderTarget(makeSurface()).surfaceOwnership).toBe('caller');
  });
});

describe('disposeCanvasScreenRenderTarget', () => {
  it("unbinds without collapsing the caller's canvas", () => {
    const surface = makeSurface(200, 100);
    const screen = createCanvasScreenRenderTarget(surface);

    disposeCanvasScreenRenderTarget(screen);

    expect(surface.context.canvas.width).toBe(200);
    expect(surface.context.canvas.height).toBe(100);
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

    endCanvasRenderPass(beginCanvasRenderPass(state, screen));
    endCanvasRenderPass(beginCanvasRenderPass(state, texture));
  });
});
