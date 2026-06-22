import { defaultCanvasShapeCommands, registerCanvasShapeCommands } from '@flighthq/displayobject-canvas';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape';
import { ShapeKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomShapeRenderer, drawDomShape } from './domShape';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDomShapeRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDomShapeRenderer.submit).toBe('function');
    expect(typeof defaultDomShapeRenderer.createData).toBe('function');
  });
});

describe('drawDomShape', () => {
  it('does not produce an element when commands array is empty', () => {
    const state = makeState();
    const shape = createShape();
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const el = drawGetEl(state, () => drawDomShape(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces a canvas element when the shape has draw commands', () => {
    const state = makeState();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 50, 50);
    appendShapeEndFill(shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const el = drawGetEl(state, () => drawDomShape(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });

  it('sets canvas size to at least 1x1 for zero-size shapes', () => {
    const state = makeState();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 0, 0);
    appendShapeEndFill(shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const canvas = drawGetEl(state, () => drawDomShape(state, renderProxy)) as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThanOrEqual(1);
    expect(canvas.height).toBeGreaterThanOrEqual(1);
  });

  it('reuses the same canvas element across multiple draws', () => {
    const state = makeState();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 40, 40);
    appendShapeEndFill(shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const firstCanvas = drawGetEl(state, () => drawDomShape(state, renderProxy));
    const secondCanvas = drawGetEl(state, () => drawDomShape(state, renderProxy));

    expect(firstCanvas).toBe(secondCanvas);
  });
});
