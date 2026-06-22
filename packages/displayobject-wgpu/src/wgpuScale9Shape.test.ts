import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';

import {
  createWgpuScale9ShapeData,
  defaultWgpuScale9ShapeRenderer,
  destroyWgpuScale9ShapeData,
  drawWgpuScale9Shape,
  drawWgpuScale9ShapeMask,
  remapWgpuScale9Commands,
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
    prepareDisplayObjectRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('rasterizes and draws a filled shape without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    prepareDisplayObjectRender(state, shape);
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
    prepareDisplayObjectRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9ShapeMask(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('remapWgpuScale9Commands', () => {
  it('remaps coordinates with a compatible mapper', () => {
    const out: unknown[] = [];
    remapWgpuScale9Commands(out, ['drawRectangle', 4, 10, 20, 50, 30], {
      mapX: (x: number) => x * 2,
      mapY: (y: number) => y * 3,
    });

    expect(out).toEqual(['drawRectangle', 4, 20, 60, 100, 90]);
  });
});
