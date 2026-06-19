import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  createWebGPUScale9ShapeData,
  defaultWebGPUScale9ShapeRenderer,
  destroyWebGPUScale9ShapeData,
  drawWebGPUScale9Shape,
  drawWebGPUScale9ShapeMask,
  remapWebGPUScale9Commands,
} from './webgpuScale9Shape';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

const grid = { height: 80, width: 80, x: 10, y: 10 };

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPUScale9ShapeData', () => {
  it('creates renderer data with no texture entry yet', () => {
    const data = createWebGPUScale9ShapeData({} as never, createScale9Shape(grid)) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWebGPUScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(defaultWebGPUScale9ShapeRenderer.createData).toBe(createWebGPUScale9ShapeData);
    expect(defaultWebGPUScale9ShapeRenderer.destroyData).toBe(destroyWebGPUScale9ShapeData);
    expect(defaultWebGPUScale9ShapeRenderer.submit).toBe(drawWebGPUScale9Shape);
  });
});

describe('destroyWebGPUScale9ShapeData', () => {
  it('destroys the texture it owns', () => {
    const destroy = vi.fn();
    destroyWebGPUScale9ShapeData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWebGPUScale9ShapeData({} as never, { entry: null } as never)).not.toThrow();
  });
});

describe('drawWebGPUScale9Shape', () => {
  it('returns early when commands are empty', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const shape = createScale9Shape(grid);
    prepareDisplayObjectRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWebGPUScale9Shape(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('rasterizes and draws a filled shape without throwing', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    prepareDisplayObjectRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWebGPUScale9Shape(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPUScale9ShapeMask', () => {
  it('delegates to the Scale9 draw path', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const shape = createScale9Shape(grid);
    prepareDisplayObjectRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWebGPUScale9ShapeMask(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('remapWebGPUScale9Commands', () => {
  it('remaps coordinates with a compatible mapper', () => {
    const out: unknown[] = [];
    remapWebGPUScale9Commands(out, ['drawRectangle', 4, 10, 20, 50, 30], {
      mapX: (x: number) => x * 2,
      mapY: (y: number) => y * 3,
    });

    expect(out).toEqual(['drawRectangle', 4, 20, 60, 100, 90]);
  });
});
