import { defaultCanvasShapeCommands, registerCanvasShapeCommands } from '@flighthq/render-canvas';
import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { beginShapeFill, createShape, drawShapeRectangle, endShapeFill } from '@flighthq/scenegraph-display';
import { ShapeKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMShapeRenderer, drawDOMShape, drawDOMShapeMask } from './domShape';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
  return state;
}

describe('defaultDOMShapeRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultDOMShapeRenderer.draw).toBe('function');
    expect(typeof defaultDOMShapeRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMShapeRenderer.createData).toBe('function');
  });
});

describe('drawDOMShape', () => {
  it('does not append anything when commands array is empty', () => {
    const state = makeState();
    const shape = createShape();
    const renderNode = getDisplayObjectRenderNode(state, shape);

    drawDOMShape(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends a canvas element when the shape has draw commands', () => {
    const state = makeState();
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapeRectangle(shape, 0, 0, 50, 50);
    endShapeFill(shape);
    const renderNode = getDisplayObjectRenderNode(state, shape);

    drawDOMShape(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('CANVAS');
  });

  it('sets canvas size to at least 1x1 for zero-size shapes', () => {
    const state = makeState();
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapeRectangle(shape, 0, 0, 0, 0);
    endShapeFill(shape);
    const renderNode = getDisplayObjectRenderNode(state, shape);

    drawDOMShape(state, renderNode);

    const canvas = state.element.children[0] as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThanOrEqual(1);
    expect(canvas.height).toBeGreaterThanOrEqual(1);
  });

  it('reuses the same canvas element across multiple draws', () => {
    const state = makeState();
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapeRectangle(shape, 0, 0, 40, 40);
    endShapeFill(shape);
    const renderNode = getDisplayObjectRenderNode(state, shape);

    drawDOMShape(state, renderNode);
    const firstCanvas = state.element.children[0];

    while (state.element.firstChild) state.element.removeChild(state.element.firstChild);
    drawDOMShape(state, renderNode);
    const secondCanvas = state.element.children[0];

    expect(firstCanvas).toBe(secondCanvas);
  });
});

describe('drawDOMShapeMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const shape = createShape();
    const renderNode = getDisplayObjectRenderNode(state, shape);
    expect(() => drawDOMShapeMask(state, renderNode)).not.toThrow();
  });
});
