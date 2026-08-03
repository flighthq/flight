import { registerGlBlendMode, registerGlMaterialRenderer } from '@flighthq/render-gl/contract';
import { registerRenderer } from '@flighthq/render/contract';
import type { GlMaterialRenderer, Renderer, Scene2DKindUsage, SceneCoverageEntry } from '@flighthq/types/contract';
import { BlendMode, RenderRegistry, SceneCoverage, StandardMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainGlScene2DCoverage, hasGlScene2DCoverage } from './explainGlScene2DCoverage';
import { createGlState } from './glTestHelper';

const materialRenderer = {} as unknown as GlMaterialRenderer;
const nodeRenderer: Renderer = { createData: () => null, submit: () => {} } as unknown as Renderer;

function usage(overrides: Partial<Scene2DKindUsage> = {}): Scene2DKindUsage {
  return { blendModes: [], materialKinds: [], nodeKinds: [], shapeCommandKeys: [], ...overrides };
}

function entries(state: ReturnType<typeof createGlState>['state'], u: Scene2DKindUsage): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainGlScene2DCoverage(out, state, u);
  return out;
}

describe('explainGlScene2DCoverage', () => {
  it('includes the shared node-renderer answer rather than restating it', () => {
    // Composition, not duplication: the base check owns node kinds, and this one must surface them.
    const { state } = createGlState();
    registerRenderer(state, 'Shape', nodeRenderer);
    expect(entries(state, usage({ nodeKinds: ['Shape'] }))).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      kind: 'Shape',
      registry: RenderRegistry.NodeRenderer,
    });
  });

  it('reports an unregistered blend mode as Fallback, since the node draws but composites as Normal', () => {
    const { state } = createGlState();
    expect(entries(state, usage({ blendModes: [BlendMode.Multiply] }))).toEqual([
      { coverage: SceneCoverage.Fallback, kind: BlendMode.Multiply, registry: RenderRegistry.BlendRealization },
    ]);
  });

  it('reports a registered blend mode as Satisfied', () => {
    const { state } = createGlState();
    registerGlBlendMode(state, BlendMode.Multiply, {} as never);
    expect(entries(state, usage({ blendModes: [BlendMode.Multiply] }))).toEqual([
      { coverage: SceneCoverage.Satisfied, kind: BlendMode.Multiply, registry: RenderRegistry.BlendRealization },
    ]);
  });

  it('reports an unregistered material as Missing when nothing can absorb it', () => {
    const { state } = createGlState();
    expect(entries(state, usage({ materialKinds: ['acme.Custom'] }))).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'acme.Custom',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('downgrades the material gap to Fallback once a standard renderer can absorb it', () => {
    const { state } = createGlState();
    registerGlMaterialRenderer(state, StandardMaterialKind, materialRenderer);
    expect(entries(state, usage({ materialKinds: ['acme.Custom'] }))).toContainEqual({
      coverage: SceneCoverage.Fallback,
      kind: 'acme.Custom',
      registry: RenderRegistry.MaterialRenderer,
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
    registerRenderer(state, 'Shape', nodeRenderer);
    expect(hasGlScene2DCoverage(state, usage({ blendModes: [BlendMode.Multiply], nodeKinds: ['Shape'] }))).toBe(false);
  });

  it('is true once both halves are served', () => {
    const { state } = createGlState();
    registerRenderer(state, 'Shape', nodeRenderer);
    registerGlBlendMode(state, BlendMode.Multiply, {} as never);
    expect(hasGlScene2DCoverage(state, usage({ blendModes: [BlendMode.Multiply], nodeKinds: ['Shape'] }))).toBe(true);
  });

  it('agrees with the explain tier, so the two can never disagree', () => {
    const { state } = createGlState();
    registerRenderer(state, 'Shape', nodeRenderer);
    const u = usage({ materialKinds: ['acme.Custom'], nodeKinds: ['Shape'] });
    const out: SceneCoverageEntry[] = [];
    explainGlScene2DCoverage(out, state, u);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasGlScene2DCoverage(state, u)).toBe(gaps.length === 0);
  });
});
