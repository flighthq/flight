import {
  applyColorMatrixToColor,
  createColorMatrixAdjustment,
  createColorScaleBiasAdjustment,
  createTintAdjustment,
} from '@flighthq/adjustments/contract';
import { addNodeChild, setNodeColorAdjustments } from '@flighthq/node/contract';
import { createDisplayObject, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { Renderable, RenderProxy, RenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { areColorAdjustmentsEnabled, enableColorAdjustments } from './enableColorAdjustments';
import { createRenderProxy, getRenderProxy2D, prepareScene2DRender } from './renderProxy';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('areColorAdjustmentsEnabled', () => {
  it('reports false until accumulation is installed, then true', () => {
    const state = createRenderState();
    expect(areColorAdjustmentsEnabled(state)).toBe(false);
    enableColorAdjustments(state);
    expect(areColorAdjustmentsEnabled(state)).toBe(true);
  });
});

describe('enableColorAdjustments', () => {
  it('replaces the persistent resolver slot once and remains idempotent', () => {
    const state = createRenderState();
    const runtime = getRenderStateRuntime(state);
    const empty = runtime.registries.colorAdjustments;

    enableColorAdjustments(state);

    const bound = runtime.registries.colorAdjustments!;
    expect(bound).not.toBe(empty);
    expect(bound.entry?.state).toBe(RegistryEntryState.Bound);
    enableColorAdjustments(state);
    expect(runtime.registries.colorAdjustments).toBe(bound);
  });

  it('leaves color adjustments unresolved until the state opts in', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7f0000ff)]);

    prepareScene2DRender(state, node);

    expect(getRenderProxy2D(state, node)?.colorScaleBias).toBeNull();
  });

  it('resolves a node color-adjustment stack onto the render node as an affine ColorScaleBias', () => {
    const state = createEnabledRenderState();
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7f0000ff)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    resolveColorAdjustments(state, data);
    expect(data.colorScaleBias).not.toBeNull();
    expect(data.colorScaleBias!.redScale).toBeCloseTo(0x7f / 255);
    expect(data.colorScaleBias!.greenScale).toBe(0);
  });

  it('resolves channel mixing onto the render node as a complete matrix', () => {
    const state = createEnabledRenderState();
    const node = createDisplayObject();
    const matrix = [1, 0.5, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNodeColorAdjustments(node, [createColorMatrixAdjustment(matrix)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    resolveColorAdjustments(state, data);
    expect(data.colorMatrix).toEqual(matrix);
    expect(data.colorScaleBias).toBeNull();
  });

  it('resolves to null when the node carries no adjustments', () => {
    const state = createEnabledRenderState();
    const node = createDisplayObject();
    const data = createRenderProxy(state, node as unknown as Renderable);
    resolveColorAdjustments(state, data);
    expect(data.colorScaleBias).toBeNull();
    expect(data.colorMatrix).toBeNull();
  });

  it('inherits a parent adjustment when the renderer-bearing child has none of its own', () => {
    const state = createEnabledRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    setNodeColorAdjustments(parent, [createTintAdjustment(0x80ff33ff)]);
    const parentData = createRenderProxy(state, parent as unknown as Renderable);
    const childData = createRenderProxy(state, child as unknown as Renderable);
    resolveColorAdjustments(state, parentData);
    resolveColorAdjustments(state, childData, parentData);
    expect(childData.colorScaleBias).toBe(parentData.colorScaleBias);
  });

  it('carries a container adjustment to its child through the real render walk', () => {
    const state = createEnabledRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    setNodeColorAdjustments(parent, [createTintAdjustment(0x80ff33ff)]);
    prepareScene2DRender(state, parent);
    expect(getRenderProxy2D(state, child)?.colorScaleBias).toBe(getRenderProxy2D(state, parent)?.colorScaleBias);
  });

  it('refreshes inherited adjustments through descendants when an ancestor changes', () => {
    const state = createEnabledRenderState();
    const root = createDisplayObject();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, parent);
    addNodeChild(parent, child);
    setNodeColorAdjustments(root, [createTintAdjustment(0x80ffffff)]);
    setNodeColorAdjustments(parent, [createTintAdjustment(0xff8033ff)]);

    prepareScene2DRender(state, root);
    const first = getRenderProxy2D(state, child)?.colorScaleBias;
    expect(first?.redScale).toBeCloseTo(0.5 * 1);
    expect(first?.greenScale).toBeCloseTo(1 * 0.5);

    setNodeColorAdjustments(root, [createTintAdjustment(0x40ffffff)]);
    prepareScene2DRender(state, root);
    const second = getRenderProxy2D(state, child)?.colorScaleBias;
    expect(second?.redScale).toBeCloseTo(0.25 * 1);
    expect(second?.greenScale).toBeCloseTo(1 * 0.5);

    setNodeColorAdjustments(parent, null);
    prepareScene2DRender(state, root);
    expect(getRenderProxy2D(state, child)?.colorScaleBias).toBe(getRenderProxy2D(state, root)?.colorScaleBias);
  });

  it('concatenates a parent affine adjustment after the child adjustment', () => {
    const state = createEnabledRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    setNodeColorAdjustments(parent, [
      createColorScaleBiasAdjustment({
        redScale: 0.5,
        redBias: 0.1,
        greenScale: 1,
        greenBias: 0,
        blueScale: 1,
        blueBias: 0,
        alphaScale: 1,
        alphaBias: 0,
      }),
    ]);
    setNodeColorAdjustments(child, [
      createColorScaleBiasAdjustment({
        redScale: 0.25,
        redBias: 0.2,
        greenScale: 1,
        greenBias: 0,
        blueScale: 1,
        blueBias: 0,
        alphaScale: 1,
        alphaBias: 0,
      }),
    ]);
    const parentData = createRenderProxy(state, parent as unknown as Renderable);
    const childData = createRenderProxy(state, child as unknown as Renderable);
    resolveColorAdjustments(state, parentData);
    resolveColorAdjustments(state, childData, parentData);
    expect(childData.colorScaleBias?.redScale).toBeCloseTo(0.125);
    expect(childData.colorScaleBias?.redBias).toBeCloseTo(0.2);
  });

  it('promotes a parent affine and child matrix to one parent-after-child matrix', () => {
    const state = createEnabledRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    const parentAdjustment = createColorScaleBiasAdjustment({
      redScale: 0.5,
      redBias: 0.1,
      greenScale: 1,
      greenBias: 0,
      blueScale: 1,
      blueBias: 0,
      alphaScale: 1,
      alphaBias: 0,
    });
    const childMatrix = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNodeColorAdjustments(parent, [parentAdjustment]);
    setNodeColorAdjustments(child, [createColorMatrixAdjustment(childMatrix)]);
    const parentData = createRenderProxy(state, parent as unknown as Renderable);
    const childData = createRenderProxy(state, child as unknown as Renderable);
    resolveColorAdjustments(state, parentData);
    resolveColorAdjustments(state, childData, parentData);
    const source = 0x204060ff;
    const expected = applyColorMatrixToColor(
      parentAdjustment.colorMatrix,
      applyColorMatrixToColor(childMatrix, source),
    );
    expect(applyColorMatrixToColor(childData.colorMatrix!, source)).toBe(expected);
    expect(childData.colorScaleBias).toBeNull();
  });

  it('promotes a parent matrix and child affine to one parent-after-child matrix', () => {
    const state = createEnabledRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    const parentMatrix = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0];
    const childAdjustment = createColorScaleBiasAdjustment({
      redScale: 0.5,
      redBias: 0.1,
      greenScale: 1,
      greenBias: 0,
      blueScale: 1,
      blueBias: 0,
      alphaScale: 1,
      alphaBias: 0,
    });
    setNodeColorAdjustments(parent, [createColorMatrixAdjustment(parentMatrix)]);
    setNodeColorAdjustments(child, [childAdjustment]);
    const parentData = createRenderProxy(state, parent as unknown as Renderable);
    const childData = createRenderProxy(state, child as unknown as Renderable);
    resolveColorAdjustments(state, parentData);
    resolveColorAdjustments(state, childData, parentData);
    const source = 0x204060ff;
    const expected = applyColorMatrixToColor(
      parentMatrix,
      applyColorMatrixToColor(childAdjustment.colorMatrix, source),
    );
    expect(applyColorMatrixToColor(childData.colorMatrix!, source)).toBe(expected);
    expect(childData.colorScaleBias).toBeNull();
  });

  it('reads the cache the accessor fused once (the walk never re-fuses)', () => {
    const state = createEnabledRenderState();
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x3fffffff)]);
    // The set-accessor fused the stack once; the runtime already holds the cached resolved value.
    const cached = getNode2DRuntime(node).resolvedColorScaleBias;
    expect(cached).not.toBeNull();
    const data = createRenderProxy(state, node as unknown as Renderable);
    resolveColorAdjustments(state, data);
    expect(data.colorScaleBias).toBe(cached);
    resolveColorAdjustments(state, data);
    expect(data.colorScaleBias).toBe(cached);
  });
});

function createEnabledRenderState(): RenderState {
  const state = createRenderState();
  enableColorAdjustments(state);
  return state;
}

function resolveColorAdjustments(state: RenderState, data: RenderProxy, parentData?: RenderProxy): void {
  const entry = getRenderStateRuntime(state).registries.colorAdjustments?.entry;
  if (entry?.state !== RegistryEntryState.Bound) throw new Error('Color-adjustment resolver is not enabled');
  entry.value(state, data, parentData);
}
