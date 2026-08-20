import type * as FlightNodeModule from '@flighthq/node/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock, renderWgpuBackground } from '@flighthq/render-wgpu/contract';
import { enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createShape,
} from '@flighthq/shape/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry } from '@flighthq/types/contract';

// ★ A HOISTED MOCK, NOT A HAND-ROLLED ONE. This file is in REGISTRY_ISOLATED_TESTS, so it already runs
// with its own module registry — the hermeticity the `scopeModuleMocks` + `vi.doMock` + dynamic-import
// dance bought by hand comes from the platform here, with no hook. The dance was not merely redundant:
// it rebuilt the subject's entire transitive module graph inside a FIXED `beforeAll` deadline, which is
// unbounded work against a fixed clock and the shape of flake that tiering exists to remove.
vi.mock('@flighthq/node/contract', async (importOriginal) => ({
  ...(await importOriginal<typeof FlightNodeModule>()),
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: { data?: { version?: number } } | null | undefined) =>
    source?.data?.version ?? 0,
}));

import { defaultWgpuMeshShapeRenderer, drawWgpuMeshShape } from './wgpuMeshShapeRenderer';
import { registerWgpuShapeRasterizer } from './wgpuShapeRasterizer';

beforeAll(() => installWgpuMock());

function makeShapeData() {
  return {
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
    meshBuffers: {
      vertexBuffers: [],
      vertexCapacities: [],
      indexBuffers: [],
      indexCapacities: [],
      uniformBuffers: [],
      bindGroups: [],
      colorScaleBiasUniformBuffers: [],
      colorScaleBiasBindGroups: [],
    },
  };
}

function makeShapeProxy(data: Record<string, unknown>, rendererData: unknown = makeShapeData()): RenderProxy2D {
  return {
    source: { data: { commands: [], version: 0, ...data } },
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

function makeMeshPassSpy(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setStencilReference: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function gradientShape() {
  const shape = createShape();
  appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255], null);
  appendShapeRectangle(shape, 8, 8, 32, 24);
  appendShapeEndFill(shape);
  return shape;
}

describe('defaultWgpuMeshShapeRenderer', () => {
  it('declares BatchFormat.Quad and the shared shape data lifecycle', () => {
    expect(defaultWgpuMeshShapeRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof defaultWgpuMeshShapeRenderer.createData).toBe('function');
    expect(typeof defaultWgpuMeshShapeRenderer.destroyData).toBe('function');
  });

  it('never rasterizes, even with a rasterizer registered and a fill that cannot tessellate', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    const rasterizer = vi.fn();
    registerWgpuShapeRasterizer(state, rasterizer);

    defaultWgpuMeshShapeRenderer.submit!(
      state,
      makeShapeProxy({ commands: gradientShape().data.commands, version: 1 }),
    );

    expect(rasterizer).not.toHaveBeenCalled();
  });

  it('reports a ShapeRasterizer miss rather than silently dropping an untessellatable fill', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    enableRenderRegistryGuards(state);

    defaultWgpuMeshShapeRenderer.submit!(
      state,
      makeShapeProxy({ commands: gradientShape().data.commands, version: 1 }),
    );

    expect(explainRenderRegistryMisses(state).misses).toContainEqual({
      kind: 'Shape',
      registry: RenderRegistry.ShapeRasterizer,
    });
  });
});

describe('drawWgpuMeshShape', () => {
  it('draws a solid fill as a GPU mesh and reports that it drew', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const pass = makeMeshPassSpy();
    getWgpuRenderStateRuntime(state).renderPass = pass;
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00cc00ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    appendShapeEndFill(shape);

    expect(drawWgpuMeshShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }))).toBe(true);
    expect(pass.drawIndexed).toHaveBeenCalled();
  });

  it('reports false for a fill with no tessellated form, which is the hybrid fall-through signal', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    expect(drawWgpuMeshShape(state, makeShapeProxy({ commands: gradientShape().data.commands, version: 1 }))).toBe(
      false,
    );
  });

  it('reports false with no render pass, an empty command list, or absent renderer data', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00cc00ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    appendShapeEndFill(shape);

    getWgpuRenderStateRuntime(state).renderPass = null;
    expect(drawWgpuMeshShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }))).toBe(false);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    expect(drawWgpuMeshShape(state, makeShapeProxy({ commands: [], version: 1 }))).toBe(false);
    expect(drawWgpuMeshShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }, null))).toBe(false);
  });
});
