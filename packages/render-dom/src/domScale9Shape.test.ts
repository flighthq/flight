import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D } from '@flighthq/render';

import { createDOMRenderState } from './domRenderState';
import {
  createDOMScale9ShapeData,
  defaultDOMScale9ShapeRenderer,
  drawDOMScale9Shape,
  drawDOMScale9ShapeMask,
} from './domScale9Shape';
import type { DOMRenderStateInternal } from './internal';

const grid = { height: 80, width: 80, x: 10, y: 10 };

function getCurrentElement(state: ReturnType<typeof createDOMRenderState>): HTMLElement | null {
  return (state as DOMRenderStateInternal).domCurrentElement;
}

describe('createDOMScale9ShapeData', () => {
  it('creates empty renderer data', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);

    const data = createDOMScale9ShapeData(state, shape);

    expect(data.canvas).toBeNull();
    expect(data.context).toBeNull();
  });
});

describe('defaultDOMScale9ShapeRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(defaultDOMScale9ShapeRenderer.createData).toBe(createDOMScale9ShapeData);
    expect(defaultDOMScale9ShapeRenderer.submit).toBe(drawDOMScale9Shape);
  });
});

describe('drawDOMScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);
    data.rendererData = createDOMScale9ShapeData(state, shape);

    drawDOMScale9Shape(state, data);

    expect(getCurrentElement(state)).toBeNull();
  });

  it('returns early when rendererData is null', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawDOMScale9Shape(state, data);

    expect(getCurrentElement(state)).toBeNull();
  });

  it('renders remapped commands into a canvas and strips object scale from the transform', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    shape.scaleX = 2;
    shape.scaleY = 3;
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);
    data.rendererData = createDOMScale9ShapeData(state, shape);
    data.transform2D.a = 2;
    data.transform2D.d = 3;

    drawDOMScale9Shape(state, data);

    const element = getCurrentElement(state) as HTMLCanvasElement;
    expect(element.tagName).toBe('CANVAS');
    expect(element.width).toBe(200);
    expect(element.height).toBe(300);
    expect(element.style.transform).toBe('matrix(1,0,0,1,0,0)');
  });
});

describe('drawDOMScale9ShapeMask', () => {
  it('uses the Scale9 draw path', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);
    data.rendererData = createDOMScale9ShapeData(state, shape);

    drawDOMScale9ShapeMask(state, data);

    expect(getCurrentElement(state)).toBeNull();
  });
});
