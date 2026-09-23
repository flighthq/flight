import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import * as flightNode from '@flighthq/node/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { enableRenderRegistriesGuards, explainRenderRegistriesMisses } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape/contract';
import type { CanvasSurface, HostCanvasCapability, HostImageCapability, RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistryTable } from '@flighthq/types/contract';

beforeEach(() => {
  vi.spyOn(flightNode, 'getNodeLocalBoundsRectangle').mockImplementation((() => ({
    x: 0,
    y: 0,
    width: 64,
    height: 48,
  })) as never);
  vi.spyOn(flightNode, 'getNodeLocalContentRevision').mockImplementation(
    ((source: { data?: { version?: number } } | null | undefined) => source?.data?.version ?? 0) as never,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { glRasterShapeRenderer, drawGlRasterShape } from './glRasterShapeRenderer';
import { registerGlShapeRasterizer } from './glShapeRasterizer';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

function createTestSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { context: canvas.getContext('2d')! } as unknown as CanvasSurface;
}

function createTestCanvasHost(): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface() {},
    release() {},
  };
}

function createTestImageHost(): HostImageCapability {
  return {
    createImageFromSurface(surface) {
      return createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
    },
    loadImageFromUrl: () => Promise.reject(new Error('not implemented')),
  };
}

function setTestRasterHosts(state: { canvasHost: unknown; imageHost: unknown }): void {
  state.canvasHost = createTestCanvasHost();
  state.imageHost = createTestImageHost();
}

function makeShapeData() {
  return {
    image: null,
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  };
}

function makeShapeNode(data: Record<string, unknown>, rendererData: unknown = makeShapeData()): RenderProxy2D {
  return {
    source: { data: { commands: [], version: 0, ...data } },
    rendererData,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

// A plain solid rectangle — precisely the shape the mesh strategy would tessellate.
function solidShape() {
  const shape = createShape();
  appendShapeBeginFill(shape, 0x00cc00ff);
  appendShapeRectangle(shape, 8, 8, 32, 24);
  appendShapeEndFill(shape);
  return shape;
}

describe('drawGlRasterShape', () => {
  it('rasterizes a fill the mesh path could have tessellated, which is what pinning this strategy means', () => {
    // The behavioural difference from glShapeRenderer: no tessellation is attempted first, so a
    // solid rectangle still goes through the canvas replay.
    const { state, gl } = createGlState();
    setTestRasterHosts(state);
    registerGlStandardMaterial(state);
    const rasterizer = vi.fn();
    registerGlShapeRasterizer(state, rasterizer);

    drawGlRasterShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }));

    expect(rasterizer).toHaveBeenCalledTimes(1);
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('replays the whole command stream, not the subset a mesh path could not express', () => {
    // Why a rasterizing state needs the full canvas command vocabulary rather than some gap set.
    const { state } = createGlState();
    setTestRasterHosts(state);
    registerGlStandardMaterial(state);
    const shape = solidShape();
    let replayed: readonly unknown[] = [];
    registerGlShapeRasterizer(state, (_ctx, commands) => {
      replayed = commands;
    });

    drawGlRasterShape(state, makeShapeNode({ commands: shape.data.commands, version: 1 }));

    expect(replayed).toEqual(shape.data.commands);
  });

  it('reports a ShapeRasterizer miss when no rasterizer is registered', () => {
    const { state } = createGlState();
    enableRenderRegistriesGuards(state);
    drawGlRasterShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }));
    expect(explainRenderRegistriesMisses(state).misses).toContainEqual({
      kind: 'Shape',
      registry: RenderRegistryTable.ShapeRasterizer,
    });
  });

  it('preserves expected surface absence without rasterizing or writing a batch', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const rasterizer = vi.fn();
    registerGlShapeRasterizer(state, rasterizer);

    drawGlRasterShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }));

    expect(rasterizer).not.toHaveBeenCalled();
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('does nothing for an empty command list or absent renderer data', () => {
    const { state } = createGlState();
    const rasterizer = vi.fn();
    registerGlShapeRasterizer(state, rasterizer);
    drawGlRasterShape(state, makeShapeNode({ commands: [], version: 1 }));
    drawGlRasterShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }, null));
    expect(rasterizer).not.toHaveBeenCalled();
  });
});

describe('glRasterShapeRenderer', () => {
  it('declares BatchFormat.Quad and the shared shape data lifecycle', () => {
    expect(glRasterShapeRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof glRasterShapeRenderer.createData).toBe('function');
    expect(typeof glRasterShapeRenderer.destroyData).toBe('function');
    expect(glRasterShapeRenderer.submit).toBe(drawGlRasterShape);
  });
});
