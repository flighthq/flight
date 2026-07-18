import { createMatrix } from '@flighthq/geometry';

import { createCanvasRenderState } from './canvasRenderState';
import {
  beginCanvasRenderPass,
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  endCanvasRenderPass,
  resizeCanvasRenderTarget,
  setCanvasRenderTransform2D,
} from './canvasRenderTarget';

function makeState() {
  return createCanvasRenderState(document.createElement('canvas'));
}

describe('beginCanvasRenderPass', () => {
  it('switches the state canvas to the target canvas', () => {
    const state = makeState();
    const target = createCanvasRenderTarget(64, 48);

    beginCanvasRenderPass(state, target);

    expect(state.canvas).toBe(target.canvas);
  });

  it('clears the target by default and preserves it with preserveColor', () => {
    const state = makeState();
    const target = createCanvasRenderTarget(64, 48);
    const clearRect = vi.spyOn(target.context, 'clearRect');

    beginCanvasRenderPass(state, target);
    expect(clearRect).toHaveBeenCalledWith(0, 0, target.width, target.height);
    endCanvasRenderPass(state);

    clearRect.mockClear();
    beginCanvasRenderPass(state, target, { preserveColor: true });
    expect(clearRect).not.toHaveBeenCalled();
    endCanvasRenderPass(state);
  });

  it('supports nested pairs', () => {
    const state = makeState();
    const outerCanvas = state.canvas;
    const targetA = createCanvasRenderTarget(64, 48);
    const targetB = createCanvasRenderTarget(32, 32);

    beginCanvasRenderPass(state, targetA);
    expect(state.canvas).toBe(targetA.canvas);

    beginCanvasRenderPass(state, targetB);
    expect(state.canvas).toBe(targetB.canvas);

    endCanvasRenderPass(state);
    expect(state.canvas).toBe(targetA.canvas);

    endCanvasRenderPass(state);
    expect(state.canvas).toBe(outerCanvas);
  });
});

describe('createCanvasRenderTarget', () => {
  it('creates a canvas with the requested dimensions', () => {
    const target = createCanvasRenderTarget(128, 64);
    expect(target.canvas.width).toBe(128);
    expect(target.canvas.height).toBe(64);
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });

  it('enforces a minimum size of 1', () => {
    const target = createCanvasRenderTarget(0, 0);
    expect(target.canvas.width).toBe(1);
    expect(target.canvas.height).toBe(1);
  });

  it('ceils fractional dimensions', () => {
    const target = createCanvasRenderTarget(10.3, 20.9);
    expect(target.canvas.width).toBe(11);
    expect(target.canvas.height).toBe(21);
  });
});

describe('destroyCanvasRenderTarget', () => {
  it('collapses the canvas to zero size', () => {
    const target = createCanvasRenderTarget(64, 32);
    destroyCanvasRenderTarget(target);
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });

  it('sets target width and height to zero', () => {
    const target = createCanvasRenderTarget(128, 64);
    destroyCanvasRenderTarget(target);
    expect(target.width).toBe(0);
    expect(target.height).toBe(0);
  });
});

describe('endCanvasRenderPass', () => {
  it('restores the original canvas', () => {
    const state = makeState();
    const originalCanvas = state.canvas;
    const target = createCanvasRenderTarget(64, 48);

    beginCanvasRenderPass(state, target);
    endCanvasRenderPass(state);

    expect(state.canvas).toBe(originalCanvas);
  });

  it('without a matching begin is a no-op', () => {
    const state = makeState();
    const original = state.canvas;
    expect(() => endCanvasRenderPass(state)).not.toThrow();
    expect(state.canvas).toBe(original);
  });
});

describe('resizeCanvasRenderTarget', () => {
  it('updates the canvas and target dimensions', () => {
    const target = createCanvasRenderTarget(64, 64);
    resizeCanvasRenderTarget(target, 256, 128);
    expect(target.canvas.width).toBe(256);
    expect(target.canvas.height).toBe(128);
    expect(target.width).toBe(256);
    expect(target.height).toBe(128);
  });
});

describe('setCanvasRenderTransform2D', () => {
  it('installs a copy of the transform, restored by the enclosing pass', () => {
    const state = makeState();
    const original = state.renderTransform2D;
    const target = createCanvasRenderTarget(64, 48);
    const transform = createMatrix();
    transform.tx = 99;

    beginCanvasRenderPass(state, target);
    setCanvasRenderTransform2D(state, transform);
    expect(state.renderTransform2D?.tx).toBe(99);
    expect(state.renderTransform2D).not.toBe(transform);
    endCanvasRenderPass(state);

    expect(state.renderTransform2D).toBe(original);
  });

  it('does not mutate the outer transform matrix', () => {
    const state = makeState();
    const outer = state.renderTransform2D!;
    const target = createCanvasRenderTarget(64, 48);
    const transform = createMatrix();
    transform.tx = 50;

    beginCanvasRenderPass(state, target);
    setCanvasRenderTransform2D(state, transform);
    endCanvasRenderPass(state);

    expect(state.renderTransform2D).toBe(outer);
    expect(outer.tx).not.toBe(50);
  });
});
