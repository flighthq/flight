import { registerRenderer } from '@flighthq/render/contract';
import type {
  CanvasMaterialRenderer,
  Renderer,
  Scene2DKindUsage,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import { BlendMode, RenderRegistry, RequirementFacet, SceneCoverage } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerCanvasMaterialRenderer } from './canvasMaterialRegistry';
import { createCanvasRenderState } from './canvasTestSupport';
import { explainCanvasScene2DCoverage, hasCanvasScene2DCoverage } from './explainCanvasScene2DCoverage';

const materialRenderer = { getState: () => ({}) } as unknown as CanvasMaterialRenderer;
const nodeRenderer: Renderer = { createData: () => null, submit: () => {} } as unknown as Renderer;
const coverageCatalog: SceneCoverageCatalog = [
  {
    kind: 'acme.Custom',
    registrations: [{ module: '@acme/canvas', registrar: 'registerAcmeCanvasMaterial' }],
    registry: RenderRegistry.MaterialRenderer,
  },
];

function makeState() {
  return createCanvasRenderState(document.createElement('canvas'));
}

function usage(overrides: Partial<Scene2DKindUsage> = {}): Scene2DKindUsage {
  return { blendModes: [], materialKinds: [], nodeKinds: [], shapeCommandKeys: [], ...overrides };
}

function entries(
  state: ReturnType<typeof makeState>,
  u: Scene2DKindUsage,
  catalog: SceneCoverageCatalog = coverageCatalog,
): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainCanvasScene2DCoverage(out, state, u, catalog);
  return out;
}

describe('explainCanvasScene2DCoverage', () => {
  it('includes the shared node-renderer answer rather than restating it', () => {
    const state = makeState();
    registerRenderer(state, 'Shape', nodeRenderer);
    expect(entries(state, usage({ nodeKinds: ['Shape'] }))).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      facet: RequirementFacet.SceneNodeKind,
      kind: 'Shape',
      registry: RenderRegistry.NodeRenderer,
    });
  });

  it('reports an unregistered material as a remediable fallback, since the node still draws', () => {
    // The Canvas/GPU asymmetry: a Canvas material only adds draw state on top of a draw the node
    // renderer already performs, so its absence loses the material's contribution and nothing else.
    expect(entries(makeState(), usage({ materialKinds: ['acme.Custom'] }))).toEqual([
      {
        coverage: SceneCoverage.FallbackRemediable,
        facet: RequirementFacet.SceneMaterialKind,
        kind: 'acme.Custom',
        module: '@acme/canvas',
        registrar: 'registerAcmeCanvasMaterial',
        registry: RenderRegistry.MaterialRenderer,
      },
    ]);
  });

  it('reports an uncatalogued material as an unavailable fallback, with no remedy fields', () => {
    expect(entries(makeState(), usage({ materialKinds: ['acme.Custom'] }), [])).toEqual([
      {
        coverage: SceneCoverage.FallbackUnavailable,
        facet: RequirementFacet.SceneMaterialKind,
        kind: 'acme.Custom',
        registry: RenderRegistry.MaterialRenderer,
      },
    ]);
  });

  it('reports a registered material as Satisfied', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, 'acme.Custom', materialRenderer);
    expect(entries(state, usage({ materialKinds: ['acme.Custom'] }))).toEqual([
      {
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneMaterialKind,
        kind: 'acme.Custom',
        registry: RenderRegistry.MaterialRenderer,
      },
    ]);
  });

  it('reports no blend entries at all, since Canvas composites every mode natively', () => {
    const found = entries(makeState(), usage({ blendModes: [BlendMode.Multiply] }));
    expect(found).toEqual([]);
  });
});

describe('hasCanvasScene2DCoverage', () => {
  it('is false when only the shared half is unserved, so composition cannot hide a gap', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, 'acme.Custom', materialRenderer);
    expect(hasCanvasScene2DCoverage(state, usage({ materialKinds: ['acme.Custom'], nodeKinds: ['acme.Node'] }))).toBe(
      false,
    );
  });

  it('is false when only the Canvas half is unserved', () => {
    const state = makeState();
    registerRenderer(state, 'acme.Node', nodeRenderer);
    expect(hasCanvasScene2DCoverage(state, usage({ materialKinds: ['acme.Custom'], nodeKinds: ['acme.Node'] }))).toBe(
      false,
    );
  });

  it('is true once both halves are served', () => {
    const state = makeState();
    registerRenderer(state, 'acme.Node', nodeRenderer);
    registerCanvasMaterialRenderer(state, 'acme.Custom', materialRenderer);
    expect(hasCanvasScene2DCoverage(state, usage({ materialKinds: ['acme.Custom'], nodeKinds: ['acme.Node'] }))).toBe(
      true,
    );
  });

  it('is true for a scene using only blend modes, which need nothing registered here', () => {
    expect(hasCanvasScene2DCoverage(makeState(), usage({ blendModes: [BlendMode.Multiply] }))).toBe(true);
  });
});
