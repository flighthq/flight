import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type { Renderer, RenderState, Scene2DClipHooks } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import {
  copyAllRenderersFromRenderState,
  copyRenderStateRegistrations,
  copyRenderersFromRenderState,
  noopRendererData,
  registerRenderer,
  registerRenderers,
} from './renderer';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('copyAllRenderersFromRenderState', () => {
  it('copies all registrations and the clip hooks from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    const hooks = {
      finalize: vi.fn(),
      popClip: vi.fn(),
      pushClip: vi.fn(),
    } as unknown as Scene2DClipHooks;
    registerRenderer(source, kind, renderer);
    source.displayObjectClipHooks = hooks;

    copyAllRenderersFromRenderState(target, source);

    expect(getRegistryTableEntry(getRenderStateRuntime(target).registries.renderers, kind)).toBe(renderer);
    expect(target.displayObjectClipHooks).toBe(hooks);
  });

  it('is a no-op when source has no registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyAllRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.renderers.entries.size).toBe(0);
    expect(target.displayObjectClipHooks).toBeNull();
  });
});

describe('copyRenderersFromRenderState', () => {
  it('copies all renderer registrations from source to target', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.renderers).toBe(getRenderStateRuntime(source).registries.renderers);
    expect(getRegistryTableEntry(getRenderStateRuntime(target).registries.renderers, kind)).toBe(renderer);
  });

  it('is a no-op when source has no renderer registrations', () => {
    const source = createRenderState();
    const target = createRenderState();
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(target).registries.renderers.entries.size).toBe(0);
  });

  it('does not affect source rendererMapId', () => {
    const source = createRenderState();
    const target = createRenderState();
    const kind = 'kind';
    const renderer = { createData: vi.fn(), submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, kind, renderer);
    const sourceIdBeforeCopy = getRenderStateRuntime(source).rendererMapId;
    copyRenderersFromRenderState(target, source);
    expect(getRenderStateRuntime(source).rendererMapId).toBe(sourceIdBeforeCopy);
  });

  it('preserves target-only registrations while source registrations win collisions', () => {
    const source = createRenderState();
    const target = createRenderState();
    const sourceRenderer = { submit: vi.fn() } as unknown as Renderer;
    const targetRenderer = { submit: vi.fn() } as unknown as Renderer;
    const targetOnlyRenderer = { submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, 'shared', sourceRenderer);
    registerRenderer(target, 'shared', targetRenderer);
    registerRenderer(target, 'target-only', targetOnlyRenderer);

    copyRenderersFromRenderState(target, source);

    const targetTable = getRenderStateRuntime(target).registries.renderers;
    expect(getRegistryTableEntry(targetTable, 'shared')).toBe(sourceRenderer);
    expect(getRegistryTableEntry(targetTable, 'target-only')).toBe(targetOnlyRenderer);
  });

  it('shares a fresh immutable snapshot and diverges on later registration', () => {
    const source = createRenderState();
    const target = createRenderState();
    const renderer = { submit: vi.fn() } as unknown as Renderer;
    const lateRenderer = { submit: vi.fn() } as unknown as Renderer;
    registerRenderer(source, 'shared', renderer);

    copyRenderersFromRenderState(target, source);

    const sharedSnapshot = getRenderStateRuntime(target).registries.renderers;
    expect(sharedSnapshot).toBe(getRenderStateRuntime(source).registries.renderers);
    registerRenderer(source, 'late', lateRenderer);
    expect(getRenderStateRuntime(target).registries.renderers).toBe(sharedSnapshot);
    expect(getRenderStateRuntime(source).registries.renderers).not.toBe(sharedSnapshot);
    expect(getRegistryTableEntry(sharedSnapshot, 'late')).toBeNull();
  });
});

describe('copyRenderStateRegistrations', () => {
  it('shares the effect-padding snapshot through distinct aggregates', () => {
    const source = createRenderState();
    const target = createRenderState();
    const resolver = vi.fn();
    const colorAdjustmentResolver = vi.fn();
    const strokeTessellator = vi.fn(() => null);
    getRenderStateRuntime(source).colorAdjustmentResolver = colorAdjustmentResolver;
    getRenderStateRuntime(source).registries.strokeTessellator = {
      ...getRenderStateRuntime(source).registries.strokeTessellator,
      entry: { state: RegistryEntryState.Bound, value: strokeTessellator },
    };
    getRenderStateRuntime(source).registries.effectPaddingResolvers = {
      entries: new Map([['acme.Effect', { state: RegistryEntryState.Bound, value: resolver }]]),
      onMiss: 'Zero',
      registry: 'RenderEffectPaddingResolver',
      shape: 'keyed',
    };

    copyRenderStateRegistrations(target, source);

    const sourceRuntime = getRenderStateRuntime(source);
    const targetRuntime = getRenderStateRuntime(target);
    expect(targetRuntime.colorAdjustmentResolver).toBe(colorAdjustmentResolver);
    expect(targetRuntime.registries).not.toBe(sourceRuntime.registries);
    expect(targetRuntime.registries.strokeTessellator).toBe(sourceRuntime.registries.strokeTessellator);
    expect(targetRuntime.registries.strokeTessellator.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: strokeTessellator,
    });
    const sharedStrokeSnapshot = targetRuntime.registries.strokeTessellator;
    sourceRuntime.registries.strokeTessellator = { ...sourceRuntime.registries.strokeTessellator, entry: null };
    expect(sourceRuntime.registries.strokeTessellator).not.toBe(sharedStrokeSnapshot);
    expect(targetRuntime.registries.strokeTessellator).toBe(sharedStrokeSnapshot);
    expect(targetRuntime.registries.strokeTessellator.entry?.state).toBe(RegistryEntryState.Bound);
    expect(targetRuntime.registries.effectPaddingResolvers).toBe(sourceRuntime.registries.effectPaddingResolvers);
    expect(targetRuntime.registries.effectPaddingResolvers?.entries.get('acme.Effect')).toEqual({
      state: RegistryEntryState.Bound,
      value: resolver,
    });
  });

  it('snapshot-copies the shape-command registry without aliasing the map', () => {
    const source = createRenderState();
    const target = createRenderState();
    const command = { key: 'beginFill', draw: vi.fn() } as never;
    getRenderStateRuntime(source).registries.canvasShapeCommands = {
      entries: new Map([['beginFill', { state: RegistryEntryState.Bound, value: command }]]),
      onMiss: 'Unregistered',
      registry: 'CanvasShapeCommand',
      shape: 'keyed',
    };

    copyRenderStateRegistrations(target, source);

    expect(getRenderStateRuntime(target).registries.canvasShapeCommands).toBe(
      getRenderStateRuntime(source).registries.canvasShapeCommands,
    );
    expect(getRenderStateRuntime(target).registries.canvasShapeCommands?.entries.get('beginFill')).toEqual({
      state: RegistryEntryState.Bound,
      value: command,
    });
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

describe('registerRenderer', () => {
  let state: RenderState;
  let kindA: string;
  let kindB: string;
  let renderer1: Renderer;
  let renderer2: Renderer;

  beforeEach(() => {
    kindA = 'kindA';
    kindB = 'kindB';
    renderer1 = { render: vi.fn() } as unknown as Renderer;
    renderer2 = { render: vi.fn() } as unknown as Renderer;
    state = createRenderState();
  });

  it('should register a new renderer', () => {
    const before = getRenderStateRuntime(state).registries.renderers;
    expect(getRegistryTableEntry(before, kindA)).toBeNull();
    registerRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).registries.renderers).not.toBe(before);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindA)).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(1);
  });

  it('should increment rendererMapId for each new renderer', () => {
    registerRenderer(state, kindA, renderer1);
    const idAfterFirst = getRenderStateRuntime(state).rendererMapId;
    registerRenderer(state, kindB, renderer2);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindB)).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idAfterFirst + 1);
  });

  it('should not increment rendererMapId if the same renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerRenderer(state, kindA, renderer1);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindA)).toBe(renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore);
  });

  it('should update renderer and increment rendererMapId if different renderer is registered', () => {
    registerRenderer(state, kindA, renderer1);
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerRenderer(state, kindA, renderer2);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindA)).toBe(renderer2);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore + 1);
  });

  it('should wrap around rendererMapId correctly using >>> 0', () => {
    getRenderStateRuntime(state).rendererMapId = 0xffffffff;
    registerRenderer(state, kindA, renderer1);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(0);
  });
});

describe('registerRenderers', () => {
  it('should register every [kind, renderer] pair in the supplied set', () => {
    const state = createRenderState();
    const kindA = 'A';
    const kindB = 'B';
    const rendererA = {} as Renderer;
    const rendererB = {} as Renderer;
    registerRenderers(state, [
      [kindA, rendererA],
      [kindB, rendererB],
    ]);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindA)).toBe(rendererA);
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, kindB)).toBe(rendererB);
  });

  it('should register nothing for an empty set', () => {
    const state = createRenderState();
    const idBefore = getRenderStateRuntime(state).rendererMapId;
    registerRenderers(state, []);
    expect(getRenderStateRuntime(state).rendererMapId).toBe(idBefore);
  });
});
