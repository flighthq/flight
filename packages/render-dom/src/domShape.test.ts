import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { defaultCanvasShapeCommands, registerCanvasShapeCommands } from '@flighthq/render-canvas';
import { ShapeKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMShapeRenderer, drawDOMShape, drawDOMShapeMask } from './domShape';
import type { DOMRenderStateInternal } from './internal';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('defaultDOMShapeRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDOMShapeRenderer.submit).toBe('function');
    expect(typeof defaultDOMShapeRenderer.createData).toBe('function');
  });
});

describe('drawDOMShape', () => {
  it('does not produce an element when commands array is empty', () => {
    const state = makeState();
    const shape = createShape();
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const el = drawGetEl(state, () => drawDOMShape(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces a canvas element when the shape has draw commands', () => {
    const state = makeState();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 50, 50);
    appendShapeEndFill(shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    const el = drawGetEl(state, () => drawDOMShape(state, renderProxy));

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

    const canvas = drawGetEl(state, () => drawDOMShape(state, renderProxy)) as HTMLCanvasElement;
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

    const firstCanvas = drawGetEl(state, () => drawDOMShape(state, renderProxy));
    const secondCanvas = drawGetEl(state, () => drawDOMShape(state, renderProxy));

    expect(firstCanvas).toBe(secondCanvas);
  });
});

describe('drawDOMShapeMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const shape = createShape();
    const renderProxy = getOrCreateRenderProxy2D(state, shape);
    expect(() => drawDOMShapeMask(state, renderProxy)).not.toThrow();
  });
});
