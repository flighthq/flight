import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';

import {
  createWgpuScale9ShapeData,
  defaultWgpuScale9ShapeRenderer,
  destroyWgpuScale9ShapeData,
  drawWgpuScale9Shape,
  drawWgpuScale9ShapeMask,
} from './wgpuScale9Shape';

const grid = { height: 80, width: 80, x: 10, y: 10 };

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuScale9ShapeData', () => {
  it('creates renderer data with no texture entry yet', () => {
    const data = createWgpuScale9ShapeData({} as never, createScale9Shape(grid)) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWgpuScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(defaultWgpuScale9ShapeRenderer.createData).toBe(createWgpuScale9ShapeData);
    expect(defaultWgpuScale9ShapeRenderer.destroyData).toBe(destroyWgpuScale9ShapeData);
    expect(defaultWgpuScale9ShapeRenderer.submit).toBe(drawWgpuScale9Shape);
  });
});

describe('destroyWgpuScale9ShapeData', () => {
  it('destroys the texture it owns', () => {
    const destroy = vi.fn();
    destroyWgpuScale9ShapeData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWgpuScale9ShapeData({} as never, { entry: null } as never)).not.toThrow();
  });
});

describe('drawWgpuScale9Shape', () => {
  it('returns early when commands are empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('rasterizes and draws a filled shape without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('drawWgpuScale9ShapeMask', () => {
  it('delegates to the Scale9 draw path', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9ShapeMask(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
