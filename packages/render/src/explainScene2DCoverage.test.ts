import type { Renderer, Scene2DKindUsage, SceneCoverageCatalog, SceneCoverageEntry } from '@flighthq/types/contract';
import { RegistryEntryState, RenderRegistry, RequirementFacet, SceneCoverage } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainScene2DCoverage, hasScene2DCoverage } from './explainScene2DCoverage';
import { registerRenderer } from './renderer';
import { createRenderState } from './renderState';
import { getRenderStateRuntime } from './renderState';

const renderer: Renderer = { createData: () => null, submit: () => {} } as unknown as Renderer;
const coverageCatalog: SceneCoverageCatalog = [
  {
    kind: 'Shape',
    registrations: [
      { module: '@flighthq/scene2d', registrar: 'registerShapeRenderer' },
      { module: '@flighthq/scene2d-canvas', registrar: 'registerCanvasShapeCommands' },
    ],
    registry: RenderRegistry.NodeRenderer,
  },
  {
    kind: 'Sprite',
    registrations: [{ module: '@flighthq/scene2d', registrar: 'registerSpriteRenderer' }],
    registry: RenderRegistry.NodeRenderer,
  },
  {
    kind: 'beginFill',
    registrations: [{ module: '@flighthq/scene2d-canvas', registrar: 'registerCanvasShapeCommands' }],
    registry: RenderRegistry.ShapeCommandHandler,
  },
];

function usage(overrides: Partial<Scene2DKindUsage> = {}): Scene2DKindUsage {
  return { blendModes: [], materialKinds: [], nodeKinds: [], shapeCommandKeys: [], ...overrides };
}

function entries(
  state: ReturnType<typeof createRenderState>,
  u: Scene2DKindUsage,
  catalog: SceneCoverageCatalog = coverageCatalog,
): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainScene2DCoverage(out, state, u, catalog);
  return out;
}

// The registry lives on the base runtime; registering a real command means reaching through
// scene2d-canvas, which render cannot depend on, so the test installs the binding directly.
function wireShapeCommand(state: ReturnType<typeof createRenderState>, key: string): void {
  const runtime = getRenderStateRuntime(state);
  runtime.registries.canvasShapeCommands = {
    entries: new Map([[key, { state: RegistryEntryState.Bound, value: { key, draw: () => {} } as never }]]),
    onMiss: 'Unregistered',
    registry: 'CanvasShapeCommand',
    shape: 'keyed',
  };
}

describe('explainScene2DCoverage', () => {
  it('reports an unregistered node kind with the primary catalog remedy', () => {
    expect(entries(createRenderState(), usage({ nodeKinds: ['Shape'] }))).toEqual([
      {
        coverage: SceneCoverage.Unregistered,
        facet: RequirementFacet.SceneNodeKind,
        kind: 'Shape',
        module: '@flighthq/scene2d',
        registrar: 'registerShapeRenderer',
        registry: RenderRegistry.NodeRenderer,
      },
    ]);
  });

  it('reports an uncatalogued node kind as Unavailable, with no remedy fields', () => {
    expect(entries(createRenderState(), usage({ nodeKinds: ['Shape'] }), [])).toEqual([
      {
        coverage: SceneCoverage.Unavailable,
        facet: RequirementFacet.SceneNodeKind,
        kind: 'Shape',
        registry: RenderRegistry.NodeRenderer,
      },
    ]);
  });

  it('reports a registered node kind as Satisfied rather than omitting it', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    expect(entries(state, usage({ nodeKinds: ['Shape'] }))).toEqual([
      {
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneNodeKind,
        kind: 'Shape',
        registry: RenderRegistry.NodeRenderer,
      },
    ]);
  });

  it('reports an unhandled shape command key against the state that would replay it', () => {
    expect(entries(createRenderState(), usage({ shapeCommandKeys: ['beginFill'] }))).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneShapeCommand,
      kind: 'beginFill',
      module: '@flighthq/scene2d-canvas',
      registrar: 'registerCanvasShapeCommands',
      registry: RenderRegistry.ShapeCommandHandler,
    });
  });

  it('reports a wired shape command key as Satisfied', () => {
    const state = createRenderState();
    wireShapeCommand(state, 'beginFill');
    expect(entries(state, usage({ shapeCommandKeys: ['beginFill'] }))).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      facet: RequirementFacet.SceneShapeCommand,
      kind: 'beginFill',
      registry: RenderRegistry.ShapeCommandHandler,
    });
  });

  it('answers both registries in one manifest', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    const found = entries(state, usage({ nodeKinds: ['Shape', 'Sprite'], shapeCommandKeys: ['beginFill'] }));
    expect(found).toHaveLength(3);
    expect(found.filter((e) => e.coverage !== SceneCoverage.Satisfied).map((e) => e.kind)).toEqual([
      'Sprite',
      'beginFill',
    ]);
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const state = createRenderState();
    const u = usage({ nodeKinds: ['Shape'] });
    const out: SceneCoverageEntry[] = [];
    explainScene2DCoverage(out, state, u, coverageCatalog);
    const first = out.length;
    explainScene2DCoverage(out, state, u, coverageCatalog);
    expect(out).toHaveLength(first);
  });
});

describe('hasScene2DCoverage', () => {
  it('is false while any node kind is unserved', () => {
    expect(hasScene2DCoverage(createRenderState(), usage({ nodeKinds: ['Shape'] }))).toBe(false);
  });

  it('stays true when the manifest is all Satisfied entries, which are not shortfalls', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    wireShapeCommand(state, 'beginFill');
    const u = usage({ nodeKinds: ['Shape'], shapeCommandKeys: ['beginFill'] });
    const out: SceneCoverageEntry[] = [];
    explainScene2DCoverage(out, state, u, coverageCatalog);
    expect(out.every((e) => e.coverage === SceneCoverage.Satisfied)).toBe(true);
    expect(hasScene2DCoverage(state, u)).toBe(true);
  });

  it('agrees with the explain tier, so the two can never disagree', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    const u = usage({ nodeKinds: ['Shape', 'Sprite'] });
    const out: SceneCoverageEntry[] = [];
    explainScene2DCoverage(out, state, u, coverageCatalog);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasScene2DCoverage(state, u)).toBe(gaps.length === 0);
  });

  it('is true for a scene that names no kinds at all', () => {
    expect(hasScene2DCoverage(createRenderState(), usage())).toBe(true);
  });
});
