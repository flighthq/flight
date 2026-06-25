import { createMatrix } from '@flighthq/geometry';

import { createCanvasRenderState } from './canvasRenderState';
import {
  beginCanvasRenderTarget,
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  endCanvasRenderTarget,
  resizeCanvasRenderTarget,
} from './canvasRenderTarget';

function makeState() {
  return createCanvasRenderState(document.createElement('canvas'));
}

describe('beginCanvasRenderTarget', () => {
  it('switches the state canvas to the target canvas', () => {
    const state = makeState();
    const target = createCanvasRenderTarget(64, 48);
    const renderTransform = createMatrix();

    beginCanvasRenderTarget(state, target, renderTransform);

    expect(state.canvas).toBe(target.canvas);
  });

  it('sets renderTransform2D to the provided transform', () => {
    const state = makeState();
    const target = createCanvasRenderTarget(64, 48);
    const renderTransform = createMatrix();
    renderTransform.tx = 10;
    renderTransform.ty = 20;

    beginCanvasRenderTarget(state, target, renderTransform);

    expect(state.renderTransform2D!.tx).toBe(10);
    expect(state.renderTransform2D!.ty).toBe(20);
  });

  it('supports nested pairs', () => {
    const state = makeState();
    const outerCanvas = state.canvas;
    const targetA = createCanvasRenderTarget(64, 48);
    const targetB = createCanvasRenderTarget(32, 32);

    beginCanvasRenderTarget(state, targetA, createMatrix());
    expect(state.canvas).toBe(targetA.canvas);

    beginCanvasRenderTarget(state, targetB, createMatrix());
    expect(state.canvas).toBe(targetB.canvas);

    endCanvasRenderTarget(state);
    expect(state.canvas).toBe(targetA.canvas);

    endCanvasRenderTarget(state);
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

describe('endCanvasRenderTarget', () => {
  it('restores the original canvas', () => {
    const state = makeState();
    const originalCanvas = state.canvas;
    const target = createCanvasRenderTarget(64, 48);

    beginCanvasRenderTarget(state, target, createMatrix());
    endCanvasRenderTarget(state);

    expect(state.canvas).toBe(originalCanvas);
  });

  it('restores the original renderTransform2D', () => {
    const state = makeState();
    const originalTx = state.renderTransform2D?.tx ?? 0;
    const target = createCanvasRenderTarget(64, 48);
    const renderTransform = createMatrix();
    renderTransform.tx = 99;

    beginCanvasRenderTarget(state, target, renderTransform);
    endCanvasRenderTarget(state);

    expect(state.renderTransform2D?.tx).toBe(originalTx);
  });

  it('does not mutate the outer renderTransform2D matrix', () => {
    const state = makeState();
    const outerTransform = state.renderTransform2D!;
    const target = createCanvasRenderTarget(64, 48);
    const renderTransform = createMatrix();
    renderTransform.tx = 50;

    beginCanvasRenderTarget(state, target, renderTransform);
    endCanvasRenderTarget(state);

    expect(state.renderTransform2D).toBe(outerTransform);
    expect(outerTransform.tx).not.toBe(50);
  });

  it('without a matching begin is a no-op', () => {
    const state = makeState();
    const original = state.canvas;
    expect(() => endCanvasRenderTarget(state)).not.toThrow();
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
