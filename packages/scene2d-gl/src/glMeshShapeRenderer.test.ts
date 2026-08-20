import type * as FlightNodeModule from '@flighthq/node/contract';
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

import { defaultGlMeshShapeRenderer, drawGlMeshShape } from './glMeshShapeRenderer';
import { registerGlShapeRasterizer } from './glShapeRasterizer';
import { createGlState } from './glTestHelper';

function makeShapeData() {
  return { surface: null, lastContentId: -1, lastPixelRatio: 0, lastW: 0, lastH: 0, meshVersion: -1, meshes: null };
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

function solidShape() {
  const shape = createShape();
  appendShapeBeginFill(shape, 0x00cc00ff);
  appendShapeRectangle(shape, 8, 8, 32, 24);
  appendShapeEndFill(shape);
  return shape;
}

function gradientShape() {
  const shape = createShape();
  appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255], null);
  appendShapeRectangle(shape, 8, 8, 32, 24);
  appendShapeEndFill(shape);
  return shape;
}

describe('defaultGlMeshShapeRenderer', () => {
  it('declares BatchFormat.Quad and the shared shape data lifecycle', () => {
    expect(defaultGlMeshShapeRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof defaultGlMeshShapeRenderer.createData).toBe('function');
    expect(typeof defaultGlMeshShapeRenderer.destroyData).toBe('function');
  });

  it('never rasterizes, even with a rasterizer registered and a fill that cannot tessellate', () => {
    // The whole point of pinning this strategy: a registered rasterizer is not consulted, so an app can
    // choose the GPU path and know the canvas replay is dead weight it did not ship.
    const { state } = createGlState();
    const rasterizer = vi.fn();
    registerGlShapeRasterizer(state, rasterizer);
    defaultGlMeshShapeRenderer.submit!(state, makeShapeNode({ commands: gradientShape().data.commands, version: 1 }));
    expect(rasterizer).not.toHaveBeenCalled();
  });

  it('reports a ShapeRasterizer miss rather than silently dropping an untessellatable fill', () => {
    const { state } = createGlState();
    enableRenderRegistryGuards(state);
    defaultGlMeshShapeRenderer.submit!(state, makeShapeNode({ commands: gradientShape().data.commands, version: 1 }));
    expect(explainRenderRegistryMisses(state).misses).toContainEqual({
      kind: 'Shape',
      registry: RenderRegistry.ShapeRasterizer,
    });
  });
});

describe('drawGlMeshShape', () => {
  it('draws a solid fill as a GPU mesh and reports that it drew', () => {
    const { state, gl } = createGlState();
    const drew = drawGlMeshShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }));
    expect(drew).toBe(true);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('reports false for a fill with no tessellated form, which is the hybrid fall-through signal', () => {
    const { state } = createGlState();
    expect(drawGlMeshShape(state, makeShapeNode({ commands: gradientShape().data.commands, version: 1 }))).toBe(false);
  });

  it('reports false for an empty command list and for absent renderer data', () => {
    const { state } = createGlState();
    expect(drawGlMeshShape(state, makeShapeNode({ commands: [], version: 1 }))).toBe(false);
    expect(drawGlMeshShape(state, makeShapeNode({ commands: solidShape().data.commands, version: 1 }, null))).toBe(
      false,
    );
  });
});
