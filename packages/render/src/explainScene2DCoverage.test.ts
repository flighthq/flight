import type { Renderer, Scene2DKindUsage, SceneCoverageEntry } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainScene2DCoverage, hasScene2DCoverage } from './explainScene2DCoverage';
import { registerRenderer } from './renderer';
import { createRenderState } from './renderState';
import { getRenderStateRuntime } from './renderState';

const renderer: Renderer = { createData: () => null, submit: () => {} } as unknown as Renderer;

function usage(overrides: Partial<Scene2DKindUsage> = {}): Scene2DKindUsage {
  return { blendModes: [], materialKinds: [], nodeKinds: [], shapeCommandKeys: [], ...overrides };
}

function entries(state: ReturnType<typeof createRenderState>, u: Scene2DKindUsage): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainScene2DCoverage(out, state, u);
  return out;
}

// The registry is a plain Map on the base runtime; registering a real command means reaching through
// scene2d-canvas, which render cannot depend on, so the test installs the binding directly.
function wireShapeCommand(state: ReturnType<typeof createRenderState>, key: string): void {
  const runtime = getRenderStateRuntime(state);
  (runtime.canvasShapeCommandRegistry ??= new Map()).set(key, { key, draw: () => {} } as never);
}

describe('explainScene2DCoverage', () => {
  it('reports an unregistered node kind as Missing, since the node and its subtree never draw', () => {
    expect(entries(createRenderState(), usage({ nodeKinds: ['Shape'] }))).toEqual([
      { coverage: SceneCoverage.Missing, kind: 'Shape', registry: RenderRegistry.NodeRenderer },
    ]);
  });

  it('reports a registered node kind as Satisfied rather than omitting it', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    expect(entries(state, usage({ nodeKinds: ['Shape'] }))).toEqual([
      { coverage: SceneCoverage.Satisfied, kind: 'Shape', registry: RenderRegistry.NodeRenderer },
    ]);
  });

  it('reports an unhandled shape command key against the state that would replay it', () => {
    expect(entries(createRenderState(), usage({ shapeCommandKeys: ['beginFill'] }))).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'beginFill',
      registry: RenderRegistry.ShapeCommandHandler,
    });
  });

  it('reports a wired shape command key as Satisfied', () => {
    const state = createRenderState();
    wireShapeCommand(state, 'beginFill');
    expect(entries(state, usage({ shapeCommandKeys: ['beginFill'] }))).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      kind: 'beginFill',
      registry: RenderRegistry.ShapeCommandHandler,
    });
  });

  it('answers both registries in one manifest', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    const found = entries(state, usage({ nodeKinds: ['Shape', 'Sprite'], shapeCommandKeys: ['beginFill'] }));
    expect(found).toHaveLength(3);
    expect(found.filter((e) => e.coverage === SceneCoverage.Missing).map((e) => e.kind)).toEqual([
      'Sprite',
      'beginFill',
    ]);
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const state = createRenderState();
    const u = usage({ nodeKinds: ['Shape'] });
    const out: SceneCoverageEntry[] = [];
    explainScene2DCoverage(out, state, u);
    const first = out.length;
    explainScene2DCoverage(out, state, u);
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
    explainScene2DCoverage(out, state, u);
    expect(out.every((e) => e.coverage === SceneCoverage.Satisfied)).toBe(true);
    expect(hasScene2DCoverage(state, u)).toBe(true);
  });

  it('agrees with the explain tier, so the two can never disagree', () => {
    const state = createRenderState();
    registerRenderer(state, 'Shape', renderer);
    const u = usage({ nodeKinds: ['Shape', 'Sprite'] });
    const out: SceneCoverageEntry[] = [];
    explainScene2DCoverage(out, state, u);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasScene2DCoverage(state, u)).toBe(gaps.length === 0);
  });

  it('is true for a scene that names no kinds at all', () => {
    expect(hasScene2DCoverage(createRenderState(), usage())).toBe(true);
  });
});
