import { registerGlBlendMode, registerGlQuadMaterialRenderer } from '@flighthq/render-gl/contract';
import { registerNodeRenderer } from '@flighthq/render/contract';
import type {
  GlQuadMaterialRenderer,
  NodeRenderer,
  Scene2DKindUsage,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import {
  BlendMode,
  RenderRegistryTable,
  RequirementFacet,
  SceneCoverage,
  StandardMaterialKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainGlScene2DCoverage, hasGlScene2DCoverage } from './explainGlScene2DCoverage.ts';
import { createGlState } from './glTestHelper.ts';

const materialRenderer = {} as unknown as GlQuadMaterialRenderer;
const nodeRenderer: NodeRenderer = { createData: () => null, submit: () => {} } as unknown as NodeRenderer;
const coverageCatalog: SceneCoverageCatalog = [
  {
    kind: BlendMode.Multiply,
    registrations: [{ module: '@flighthq/scene2d-gl', registrar: 'registerGlMultiplyBlendMode' }],
    registry: RenderRegistryTable.BlendRealization,
  },
  {
    kind: 'acme.Custom',
    registrations: [{ module: '@acme/gl', registrar: 'registerAcmeGlMaterial' }],
    registry: RenderRegistryTable.MaterialRenderer,
  },
];

function usage(overrides: Partial<Scene2DKindUsage> = {}): Scene2DKindUsage {
  return { blendModes: [], materialKinds: [], nodeKinds: [], shapeCommandKeys: [], ...overrides };
}

function entries(state: ReturnType<typeof createGlState>['state'], u: Scene2DKindUsage): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainGlScene2DCoverage(out, state, u, coverageCatalog);
  return out;
}

describe('explainGlScene2DCoverage', () => {
  it('includes the shared node-renderer answer rather than restating it', () => {
    // Composition, not duplication: the base check owns node kinds, and this one must surface them.
    const { state } = createGlState();
    registerNodeRenderer(state, 'Shape', nodeRenderer);
    expect(entries(state, usage({ nodeKinds: ['Shape'] }))).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      facet: RequirementFacet.SceneNodeKind,
      kind: 'Shape',
      registry: RenderRegistryTable.NodeRenderer,
    });
  });

  it('reports an unregistered blend mode as a remediable fallback', () => {
    const { state } = createGlState();
    expect(entries(state, usage({ blendModes: [BlendMode.Multiply] }))).toEqual([
      {
        coverage: SceneCoverage.FallbackRemediable,
        facet: RequirementFacet.SceneBlendMode,
        kind: BlendMode.Multiply,
        module: '@flighthq/scene2d-gl',
        registrar: 'registerGlMultiplyBlendMode',
        registry: RenderRegistryTable.BlendRealization,
      },
    ]);
  });

  it('reports a registered blend mode as Satisfied', () => {
    const { state } = createGlState();
    registerGlBlendMode(state, BlendMode.Multiply, {} as never);
    expect(entries(state, usage({ blendModes: [BlendMode.Multiply] }))).toEqual([
      {
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneBlendMode,
        kind: BlendMode.Multiply,
        registry: RenderRegistryTable.BlendRealization,
      },
    ]);
  });

  it('reports an unregistered material as actionable when nothing can absorb it', () => {
    const { state } = createGlState();
    expect(entries(state, usage({ materialKinds: ['acme.Custom'] }))).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'acme.Custom',
      module: '@acme/gl',
      registrar: 'registerAcmeGlMaterial',
      registry: RenderRegistryTable.MaterialRenderer,
    });
  });

  it('downgrades the material gap to Fallback once a standard renderer can absorb it', () => {
    const { state } = createGlState();
    registerGlQuadMaterialRenderer(state, StandardMaterialKind, materialRenderer);
    expect(entries(state, usage({ materialKinds: ['acme.Custom'] }))).toContainEqual({
      coverage: SceneCoverage.FallbackRemediable,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'acme.Custom',
      module: '@acme/gl',
      registrar: 'registerAcmeGlMaterial',
      registry: RenderRegistryTable.MaterialRenderer,
    });
  });
});

describe('hasGlScene2DCoverage', () => {
  it('is false when only the shared half is unserved, so composition cannot hide a gap', () => {
    const { state } = createGlState();
    registerGlBlendMode(state, BlendMode.Multiply, {} as never);
    expect(hasGlScene2DCoverage(state, usage({ blendModes: [BlendMode.Multiply], nodeKinds: ['Shape'] }))).toBe(false);
  });

  it('is false when only the GL half is unserved', () => {
    const { state } = createGlState();
    registerNodeRenderer(state, 'Shape', nodeRenderer);
    expect(hasGlScene2DCoverage(state, usage({ blendModes: [BlendMode.Multiply], nodeKinds: ['Shape'] }))).toBe(false);
  });

  it('is true once both halves are served', () => {
    const { state } = createGlState();
    registerNodeRenderer(state, 'Shape', nodeRenderer);
    registerGlBlendMode(state, BlendMode.Multiply, {} as never);
    expect(hasGlScene2DCoverage(state, usage({ blendModes: [BlendMode.Multiply], nodeKinds: ['Shape'] }))).toBe(true);
  });

  it('agrees with the explain tier, so the two can never disagree', () => {
    const { state } = createGlState();
    registerNodeRenderer(state, 'Shape', nodeRenderer);
    const u = usage({ materialKinds: ['acme.Custom'], nodeKinds: ['Shape'] });
    const out: SceneCoverageEntry[] = [];
    explainGlScene2DCoverage(out, state, u, coverageCatalog);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasGlScene2DCoverage(state, u)).toBe(gaps.length === 0);
  });
});
