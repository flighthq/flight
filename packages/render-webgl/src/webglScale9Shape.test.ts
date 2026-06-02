import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/scene-display';

import {
  createWebGLScale9ShapeData,
  defaultWebGLScale9ShapeRenderer,
  drawWebGLScale9Shape,
  drawWebGLScale9ShapeMask,
  remapWebGLScale9Commands,
} from './webglScale9Shape';
import { makeWebGLState } from './webglTestHelper';

const grid = { height: 80, width: 80, x: 10, y: 10 };

describe('createWebGLScale9ShapeData', () => {
  it('creates renderer data with a WebGL texture', () => {
    const { state, gl } = makeWebGLState();
    const shape = createScale9Shape(grid);

    const data = createWebGLScale9ShapeData(state, shape);

    expect(data).not.toBeNull();
    expect(gl.createTexture).toHaveBeenCalled();
  });
});

describe('defaultWebGLScale9ShapeRenderer', () => {
  it('has draw, drawMask, and createData functions', () => {
    expect(defaultWebGLScale9ShapeRenderer.createData).toBe(createWebGLScale9ShapeData);
    expect(defaultWebGLScale9ShapeRenderer.draw).toBe(drawWebGLScale9Shape);
    expect(defaultWebGLScale9ShapeRenderer.drawMask).toBe(drawWebGLScale9ShapeMask);
  });
});

describe('drawWebGLScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const { state, gl } = makeWebGLState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateDisplayObjectRenderNode(state, shape);

    drawWebGLScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when rendererData is null', () => {
    const { state, gl } = makeWebGLState();
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateDisplayObjectRenderNode(state, shape);

    drawWebGLScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLScale9ShapeMask', () => {
  it('uses the same draw path as normal Scale9 rendering', () => {
    const { state, gl } = makeWebGLState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateDisplayObjectRenderNode(state, shape);

    drawWebGLScale9ShapeMask(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('remapWebGLScale9Commands', () => {
  it('remaps coordinates with a compatible mapper', () => {
    const out: unknown[] = [];
    remapWebGLScale9Commands(out, ['drawRectangle', 4, 10, 20, 50, 30], {
      mapX: (x: number) => x * 2,
      mapY: (y: number) => y * 3,
    });

    expect(out).toEqual(['drawRectangle', 4, 20, 60, 100, 90]);
  });
});
