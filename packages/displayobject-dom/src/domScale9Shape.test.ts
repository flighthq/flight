import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { createDomScale9ShapeData, defaultDomScale9ShapeRenderer, drawDomScale9Shape } from './domScale9Shape';

const grid = { height: 80, width: 80, x: 10, y: 10 };

function getCurrentElement(state: ReturnType<typeof createDomRenderState>): HTMLElement | null {
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('createDomScale9ShapeData', () => {
  it('creates empty renderer data', () => {
    const state = createDomRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);

    const data = createDomScale9ShapeData(state, shape);

    expect(data.canvas).toBeNull();
    expect(data.context).toBeNull();
  });
});

describe('defaultDomScale9ShapeRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(defaultDomScale9ShapeRenderer.createData).toBe(createDomScale9ShapeData);
    expect(defaultDomScale9ShapeRenderer.submit).toBe(drawDomScale9Shape);
  });
});

describe('drawDomScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const state = createDomRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);
    data.rendererData = createDomScale9ShapeData(state, shape);

    drawDomScale9Shape(state, data);

    expect(getCurrentElement(state)).toBeNull();
  });

  it('returns early when rendererData is null', () => {
    const state = createDomRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawDomScale9Shape(state, data);

    expect(getCurrentElement(state)).toBeNull();
  });

  it('renders remapped commands into a canvas and strips object scale from the transform', () => {
    const state = createDomRenderState(document.createElement('div'));
    const shape = createScale9Shape(grid);
    shape.scaleX = 2;
    shape.scaleY = 3;
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);
    data.rendererData = createDomScale9ShapeData(state, shape);
    data.transform2D.a = 2;
    data.transform2D.d = 3;

    drawDomScale9Shape(state, data);

    const element = getCurrentElement(state) as HTMLCanvasElement;
    expect(element.tagName).toBe('CANVAS');
    expect(element.width).toBe(200);
    expect(element.height).toBe(300);
    expect(element.style.transform).toBe('matrix(1,0,0,1,0,0)');
  });
});
