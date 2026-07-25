import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';

import {
  createGlScale9ShapeData,
  defaultGlScale9ShapeRenderer,
  destroyGlScale9ShapeData,
  drawGlScale9Shape,
  drawGlScale9ShapeMask,
  remapGlScale9Commands,
} from './glScale9Shape';
import { createGlState } from './glTestHelper';

const grid = { height: 80, width: 80, x: 10, y: 10 };

describe('createGlScale9ShapeData', () => {
  it('creates renderer data with a Gl texture', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);

    const data = createGlScale9ShapeData(state, shape);

    expect(data).not.toBeNull();
    expect(gl.createTexture).toHaveBeenCalled();
  });
});

describe('defaultGlScale9ShapeRenderer', () => {
  it('has submit and createData functions', () => {
    expect(defaultGlScale9ShapeRenderer.createData).toBe(createGlScale9ShapeData);
    expect(defaultGlScale9ShapeRenderer.submit).toBe(drawGlScale9Shape);
  });
});

describe('destroyGlScale9ShapeData', () => {
  it('deletes the texture it owns', () => {
    const { state, gl } = createGlState();
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;
    destroyGlScale9ShapeData(state, data);
    expect(gl.deleteTexture).toHaveBeenCalled();
  });
});

describe('drawGlScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when rendererData is null', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawGlScale9ShapeMask', () => {
  it('uses the same draw path as normal Scale9 rendering', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9ShapeMask(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('remapGlScale9Commands', () => {
  it('remaps coordinates with a compatible mapper', () => {
    const out: unknown[] = [];
    remapGlScale9Commands(out, ['drawRectangle', 4, 10, 20, 50, 30], {
      mapX: (x: number) => x * 2,
      mapY: (y: number) => y * 3,
    });

    expect(out).toEqual(['drawRectangle', 4, 20, 60, 100, 90]);
  });
});
