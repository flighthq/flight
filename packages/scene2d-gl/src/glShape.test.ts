import { createImageResource } from '@flighthq/image/contract';
import type * as FlightNodeModule from '@flighthq/node/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import {
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapePath,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createShape,
} from '@flighthq/shape/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, PathCommand } from '@flighthq/types/contract';

import { enableGlStrokePathTessellation } from './enableGlStrokePathTessellation';
import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import type * as GlShapeModule from './glShape';
import { registerGlShapeRasterizer } from './glShapeRasterizer';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

const noopRasterizer = (): void => {};
import { scopeModuleMocks } from './moduleMockTestHelper';

// @flighthq/node's bounds/revision queries expect a real BoundsNode; these tests drive drawGlShape
// with lightweight fake proxies, so the two queries are stubbed. scopeModuleMocks scopes the stub to
// this file (registry reset before the mock applies, unmock + reset after), so under a shared
// (isolate:false) worker it never leaks into the many real consumers of these functions (node,
// interaction, shape, text) — and a sibling that pre-evaluated ./glShape still picks up the stub.
let defaultGlMorphShapeRenderer: typeof GlShapeModule.defaultGlMorphShapeRenderer;
let defaultGlShapeRenderer: typeof GlShapeModule.defaultGlShapeRenderer;
let drawGlShape: typeof GlShapeModule.drawGlShape;

scopeModuleMocks(['@flighthq/node']);

beforeAll(async () => {
  vi.doMock('@flighthq/node/contract', async (importOriginal) => ({
    ...(await importOriginal<typeof FlightNodeModule>()),
    getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
    getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
  }));
  ({ defaultGlMorphShapeRenderer, defaultGlShapeRenderer, drawGlShape } = await import('./glShape'));
});

// Mirrors createGlShapeData: the rasterization surface is absent until a shape actually needs one.
function makeShapeData() {
  return {
    surface: null,
    lastContentId: -1,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  };
}

function makeShapeNode(data: Record<string, unknown> = {}, rendererData: unknown = null): RenderProxy2D {
  return {
    source: {
      data: {
        commands: [],
        version: 0,
        ...data,
      },
    },
    rendererData: rendererData,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlShapeRenderer', () => {
  it('provides the MorphShape renderer alias', () => {
    expect(defaultGlMorphShapeRenderer).toBe(defaultGlShapeRenderer);
  });

  it('declares BatchFormat.Quad', () => {
    expect(defaultGlShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultGlShapeRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawGlShape', () => {
    expect(defaultGlShapeRenderer.submit).toBe(drawGlShape);
  });
});

describe('drawGlShape', () => {
  it('draws a solid fill and open solid stroke as GPU meshes in one shape', () => {
    const { state, gl } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00cc00ff);
    appendShapeLineStyle(shape, 0);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    appendShapeEndFill(shape);
    appendShapeLineStyle(shape, 4, 0xff0000ff);
    appendShapeMoveTo(shape, 8, 4);
    appendShapeLineTo(shape, 40, 4);

    drawGlShape(state, makeShapeNode({ commands: shape.data.commands, version: 1 }, makeShapeData()));

    expect(gl.drawElements).toHaveBeenCalledTimes(2);
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('draws a closed solid stroke ring as one GPU mesh', () => {
    const { state, gl } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    enableGlStrokePathTessellation(state);
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);

    drawGlShape(state, makeShapeNode({ commands: shape.data.commands, version: 1 }, makeShapeData()));

    expect(gl.drawElements).toHaveBeenCalledTimes(1);
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('keeps a closed stroke on the raster lane until stroke-path tessellation is enabled', () => {
    const { state, gl } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);

    drawGlShape(state, makeShapeNode({ commands: shape.data.commands, version: 1 }, makeShapeData()));

    expect(gl.drawElements).not.toHaveBeenCalled();
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
  });

  it('rasterizes at the state pixel ratio, so the fallback is not soft on a dense display', () => {
    const { state } = createGlState({ pixelRatio: 3 });
    registerGlStandardMaterial(state);
    const rasterized: { width: number; height: number; transform: DOMMatrix }[] = [];
    registerGlShapeRasterizer(state, (context) => {
      rasterized.push({
        width: context.canvas.width,
        height: context.canvas.height,
        transform: context.getTransform(),
      });
    });
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);

    // The stubbed bounds are 64x48; a shape on the raster lane must back that with 3x the pixels and
    // pre-scale the replay to match, or the quad samples a 1x raster stretched over a 3x screen area.
    drawGlShape(state, makeShapeNode({ commands: shape.data.commands, version: 1 }, makeShapeData()));

    expect(rasterized).toHaveLength(1);
    expect(rasterized[0].width).toBe(192);
    expect(rasterized[0].height).toBe(144);
    expect(rasterized[0].transform.a).toBe(3);
    expect(rasterized[0].transform.d).toBe(3);
  });

  it('re-rasterizes when only the pixel ratio changes, since the cached raster is the wrong density', () => {
    const { state } = createGlState({ pixelRatio: 1 });
    registerGlStandardMaterial(state);
    let rasterCount = 0;
    registerGlShapeRasterizer(state, () => void rasterCount++);
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    const proxy = makeShapeNode({ commands: shape.data.commands, version: 1 }, makeShapeData());

    drawGlShape(state, proxy);
    drawGlShape(state, proxy);
    expect(rasterCount).toBe(1);

    (state as { pixelRatio: number }).pixelRatio = 2;
    drawGlShape(state, proxy);

    expect(rasterCount).toBe(2);
  });

  it('falls back to the raster quad for a self-intersecting stroke centerline', () => {
    const { state, gl } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    enableGlStrokePathTessellation(state);
    registerGlStandardMaterial(state);
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapePath(
      shape,
      [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
      [8, 8, 40, 40, 8, 40, 40, 8],
      'nonZero',
    );

    const rendererData = makeShapeData();
    const proxy = makeShapeNode({ commands: shape.data.commands, version: 1 }, rendererData);

    drawGlShape(state, proxy);
    drawGlShape(state, proxy);

    expect(gl.drawElements).not.toHaveBeenCalled();
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(2);
  });

  it('returns early without writing to batch when commands array is empty', () => {
    const { state } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}] }, null));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    drawGlShape(state, makeShapeNode({ commands: [{}] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('writes one instance to the quad-batch writer when shape has valid commands and bounds', () => {
    const { state } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct size into instance data', () => {
    const { state } = createGlState();
    registerGlShapeRasterizer(state, noopRasterizer);
    registerGlStandardMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    const d = getGlRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(d[6]).toBe(64); // width from mocked bounds
    expect(d[7]).toBe(48); // height from mocked bounds
  });
});
