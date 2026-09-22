import type {
  ColorAdjustmentUnsupportedGuard,
  RenderRootGuard,
  NodeRenderer,
  RenderState,
  Scene2DClipHooks,
} from '@flighthq/types/contract';

import {
  copyAllRenderersFromRenderState,
  copyRenderStateRegistrations,
  copyRenderersFromRenderState,
  noopRendererData,
  registerNodeRenderer,
  registerNodeRenderers,
} from './renderer';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('copyAllRenderersFromRenderState', () => {
  it('copies all registrations and the clip hooks from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as NodeRenderer;
    const hooks = {
      finalize: vi.fn(),
      popClip: vi.fn(),
      pushClip: vi.fn(),
    } as unknown as Scene2DClipHooks;
    registerNodeRenderer(source, kind, renderer);
    source.displayObjectClipHooks = hooks;

    copyAllRenderersFromRenderState(target, source);

    expect(getRenderStateRuntime(target).registries.nodeRenderers.get(kind) ?? null).toBe(renderer);
    expect(target.displayObjectClipHooks).toBe(hooks);
  });

  it('is a no-op when source has no registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyAllRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.nodeRenderers.size).toBe(0);
    expect(target.displayObjectClipHooks).toBeNull();
  });
});

describe('copyRenderersFromRenderState', () => {
  it('copies all renderer registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as NodeRenderer;
    registerNodeRenderer(source, kind, renderer);
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.nodeRenderers).toBe(
      getRenderStateRuntime(source).registries.nodeRenderers,
    );
    expect(getRenderStateRuntime(target).registries.nodeRenderers.get(kind) ?? null).toBe(renderer);
  });

  it('is a no-op when source has no renderer registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.nodeRenderers.size).toBe(0);
  });

  it('does not affect source rendererMapId', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as NodeRenderer;
    registerNodeRenderer(source, kind, renderer);
    const sourceIdBeforeCopy = getRenderStateRuntime(source).rendererMapId;
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(source).rendererMapId).toBe(sourceIdBeforeCopy);
  });

  it('preserves target-only registrations while source registrations win collisions', () => {
    const source = createRenderState();
    const target = createRenderState();
    const sourceRenderer = { submit: vi.fn() } as unknown as NodeRenderer;
    const targetRenderer = { submit: vi.fn() } as unknown as NodeRenderer;
    const targetOnlyRenderer = { submit: vi.fn() } as unknown as NodeRenderer;
    registerNodeRenderer(source, 'shared', sourceRenderer);
    registerNodeRenderer(target, 'shared', targetRenderer);
    registerNodeRenderer(target, 'target-only', targetOnlyRenderer);

    copyRenderersFromRenderState(target, source);

    const targetTable = getRenderStateRuntime(target).registries.nodeRenderers;
    expect(targetTable.get('shared') ?? null).toBe(sourceRenderer);
    expect(targetTable.get('target-only') ?? null).toBe(targetOnlyRenderer);
  });

  it('shares a fresh immutable snapshot and diverges on later registration', () => {
    const source = createRenderState();
    const target = createRenderState();
    const renderer = { submit: vi.fn() } as unknown as NodeRenderer;
    const lateRenderer = { submit: vi.fn() } as unknown as NodeRenderer;
    registerNodeRenderer(source, 'shared', renderer);

    copyRenderersFromRenderState(target, source);

    const sharedSnapshot = getRenderStateRuntime(target).registries.nodeRenderers;
    expect(sharedSnapshot).toBe(getRenderStateRuntime(source).registries.nodeRenderers);
    registerNodeRenderer(source, 'late', lateRenderer);
    expect(getRenderStateRuntime(target).registries.nodeRenderers).toBe(sharedSnapshot);
    expect(getRenderStateRuntime(source).registries.nodeRenderers).not.toBe(sharedSnapshot);
    expect(sharedSnapshot.get('late') ?? null).toBeNull();
  });
});

describe('copyRenderStateRegistrations', () => {
  it('shares the effect-padding snapshot through distinct aggregates', () => {
    const source = createRenderState();
    const target = createRenderState();
    const resolver = vi.fn();
    const colorAdjustmentResolver = vi.fn();
    const colorAdjustmentUnsupportedGuard: ColorAdjustmentUnsupportedGuard = vi.fn();
    const renderRootGuard: RenderRootGuard = vi.fn();
    const strokeTessellator = vi.fn(() => null);
    getRenderStateRuntime(source).registries.colorAdjustments = colorAdjustmentResolver;
    getRenderStateRuntime(source).registries.colorAdjustmentUnsupportedGuard = colorAdjustmentUnsupportedGuard;
    getRenderStateRuntime(source).registries.strokeTessellator = strokeTessellator;
    getRenderStateRuntime(source).registries.renderRootGuard = renderRootGuard;
    getRenderStateRuntime(source).registries.effectPaddingResolvers = new Map([['acme.Effect', resolver]]);

    copyRenderStateRegistrations(target, source);

    const sourceRuntime = getRenderStateRuntime(source);
    const targetRuntime = getRenderStateRuntime(target);
    expect(targetRuntime.registries).not.toBe(sourceRuntime.registries);
    expect(targetRuntime.registries.colorAdjustments).toBe(sourceRuntime.registries.colorAdjustments);
    expect(targetRuntime.registries.colorAdjustments).toEqual(colorAdjustmentResolver);
    const sharedColorSnapshot = targetRuntime.registries.colorAdjustments;
    sourceRuntime.registries.colorAdjustments = undefined;
    expect(sourceRuntime.registries.colorAdjustments).not.toBe(sharedColorSnapshot);
    expect(targetRuntime.registries.colorAdjustments).toBe(sharedColorSnapshot);
    expect(targetRuntime.registries.colorAdjustments).not.toBeNull();
    expect(targetRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(
      sourceRuntime.registries.colorAdjustmentUnsupportedGuard,
    );
    expect(targetRuntime.registries.colorAdjustmentUnsupportedGuard).toEqual(colorAdjustmentUnsupportedGuard);
    const sharedGuardSnapshot = targetRuntime.registries.colorAdjustmentUnsupportedGuard;
    sourceRuntime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(sourceRuntime.registries.colorAdjustmentUnsupportedGuard).not.toBe(sharedGuardSnapshot);
    expect(targetRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(sharedGuardSnapshot);
    expect(targetRuntime.registries.strokeTessellator).toBe(sourceRuntime.registries.strokeTessellator);
    expect(targetRuntime.registries.strokeTessellator).toEqual(strokeTessellator);
    const sharedStrokeSnapshot = targetRuntime.registries.strokeTessellator;
    sourceRuntime.registries.strokeTessellator = null;
    expect(sourceRuntime.registries.strokeTessellator).not.toBe(sharedStrokeSnapshot);
    expect(targetRuntime.registries.strokeTessellator).toBe(sharedStrokeSnapshot);
    expect(targetRuntime.registries.strokeTessellator).not.toBeNull();
    expect(targetRuntime.registries.effectPaddingResolvers).toBe(sourceRuntime.registries.effectPaddingResolvers);
    expect(targetRuntime.registries.effectPaddingResolvers?.get('acme.Effect')).toEqual(resolver);
    expect(targetRuntime.registries.renderRootGuard).toBe(sourceRuntime.registries.renderRootGuard);
    expect(targetRuntime.registries.renderRootGuard).toEqual(renderRootGuard);
    const sharedRootGuardSnapshot = targetRuntime.registries.renderRootGuard;
    sourceRuntime.registries.renderRootGuard = undefined;
    expect(sourceRuntime.registries.renderRootGuard).not.toBe(sharedRootGuardSnapshot);
    expect(targetRuntime.registries.renderRootGuard).toBe(sharedRootGuardSnapshot);
  });

  it('snapshot-copies the shape-command registry without aliasing the map', () => {
    const source = createRenderState();
    const target = createRenderState();
    const command = { key: 'beginFill', draw: vi.fn() } as never;
    getRenderStateRuntime(source).registries.canvasShapeCommands = new Map([['beginFill', command]]);

    copyRenderStateRegistrations(target, source);

    expect(getRenderStateRuntime(target).registries.canvasShapeCommands).toBe(
      getRenderStateRuntime(source).registries.canvasShapeCommands,
    );
    expect(getRenderStateRuntime(target).registries.canvasShapeCommands?.get('beginFill')).toEqual(command);
  });

  it('leaves the shape-command registry null when the source never registered one', () => {
    const source = createRenderState();
    const target = createRenderState();

    copyRenderStateRegistrations(target, source);

    expect(getRenderStateRuntime(target).registries.canvasShapeCommands).toBeUndefined();
  });
});

describe('noopRendererData', () => {
  it('returns null', () => {
    const state = createRenderState();
    expect(noopRendererData(state, {} as any)).toBeNull();
  });
});

describe('registerNodeRenderer', () => {
  let state: RenderState;
  let kindA: string;
  let kindB: string;
  let renderer1: NodeRenderer;
  let renderer2: NodeRenderer;

  beforeEach(() => {
    kindA = 'kindA';
    kindB = 'kindB';
    renderer1 = { render: vi.fn() } as unknown as NodeRenderer;
    renderer2 = { render: vi.fn() } as unknown as NodeRenderer;
    state = createRenderState();
  });

  it('should register a new renderer', () => {
    const before = getRenderStateRuntime(state).registries.nodeRenderers;
    expect(before.get(kindA) ?? null).toBeNull();
    registerNodeRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).registries.nodeRenderers).not.toBe(before);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindA) ?? null).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(1);
  });

  it('should increment rendererMapId for each new renderer', () => {
    registerNodeRenderer(state, kindA, renderer1);
    const idAfterFirst = getRenderStateRuntime(state).rendererMapId;
    registerNodeRenderer(state, kindB, renderer2);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindB) ?? null).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idAfterFirst + 1);
  });

  it('should not increment rendererMapId if the same renderer is registered', () => {
    registerNodeRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerNodeRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindA) ?? null).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore);
  });

  it('should update renderer and increment rendererMapId if different renderer is registered', () => {
    registerNodeRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerNodeRenderer(state, kindA, renderer2);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindA) ?? null).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore + 1);
  });

  it('should wrap around rendererMapId correctly using >>> 0', () => {
    getRenderStateRuntime(state).rendererMapId = 0xffffffff;
    registerNodeRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(0);
  });
});

describe('registerNodeRenderers', () => {
  it('should register every [kind, renderer] pair in the supplied set', () => {
    const state = createRenderState();
    const kindA = 'A';
    const kindB = 'B';
    const rendererA = {} as NodeRenderer;
    const rendererB = {} as NodeRenderer;
    registerNodeRenderers(state, [
      [kindA, rendererA],
      [kindB, rendererB],
    ]);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindA) ?? null).toBe(rendererA);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(kindB) ?? null).toBe(rendererB);
  });

  it('should register nothing for an empty set', () => {
    const state = createRenderState();
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerNodeRenderers(state, []);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore);
  });
});
