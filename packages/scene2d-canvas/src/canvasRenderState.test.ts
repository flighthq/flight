import { createEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { getRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import {
  enableColorAdjustmentGuards,
  enableColorAdjustments,
  getColorAdjustmentUnsupportedGuard,
  getRenderRootGuard,
  prepareScene2DRender,
  registerRenderer,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { CanvasRenderOptions, RenderRootGuard } from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { registerCanvasMaterialRenderer } from './canvasMaterialRegistry';
import {
  copyCanvasRenderStateRegistrations,
  createCanvasRenderState,
  createCanvasRenderStateRuntime,
  destroyCanvasRenderState,
  getCanvasRenderStateRuntime,
  getCanvasRenderStateTextureResolvers,
} from './canvasRenderState';

describe('copyCanvasRenderStateRegistrations', () => {
  it('shares persistent snapshots through distinct aggregates and then diverges', () => {
    const source = createCanvasRenderState(document.createElement('canvas'));
    const target = createCanvasRenderState(document.createElement('canvas'));
    const runner = vi.fn();
    const replacement = vi.fn();
    const materialRenderer = { getState: vi.fn(() => ({})) };
    const renderRootGuard: RenderRootGuard = vi.fn();
    const sourceRuntime = getCanvasRenderStateRuntime(source);
    sourceRuntime.registries.renderEffects = withRegistryTableEntry(
      sourceRuntime.registries.renderEffects,
      'acme.Effect',
      runner as never,
    );
    registerCanvasMaterialRenderer(source, 'acme.Material', materialRenderer);
    enableColorAdjustments(source);
    enableColorAdjustmentGuards(source);
    sourceRuntime.registries.renderRootGuard = {
      entry: { state: RegistryEntryState.Bound, value: renderRootGuard },
      onMiss: 'Disabled',
      registry: 'RenderRootGuard',
      shape: 'slot',
    };

    copyCanvasRenderStateRegistrations(target, source);

    const targetRuntime = getCanvasRenderStateRuntime(target);
    expect(targetRuntime.registries).not.toBe(sourceRuntime.registries);
    expect(targetRuntime.registries.colorAdjustments).toBe(sourceRuntime.registries.colorAdjustments);
    expect(targetRuntime.registries.colorAdjustments?.entry?.state).toBe(RegistryEntryState.Bound);
    expect(targetRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(
      sourceRuntime.registries.colorAdjustmentUnsupportedGuard,
    );
    expect(getColorAdjustmentUnsupportedGuard(target)).not.toBeNull();
    const sharedGuardSnapshot = targetRuntime.registries.colorAdjustmentUnsupportedGuard;
    sourceRuntime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(getColorAdjustmentUnsupportedGuard(source)).toBeNull();
    expect(targetRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(sharedGuardSnapshot);
    expect(getColorAdjustmentUnsupportedGuard(target)).not.toBeNull();
    expect(targetRuntime.registries.renderRootGuard).toBe(sourceRuntime.registries.renderRootGuard);
    expect(getRenderRootGuard(target)).toBe(renderRootGuard);
    const sharedRootGuardSnapshot = targetRuntime.registries.renderRootGuard;
    sourceRuntime.registries.renderRootGuard = undefined;
    expect(getRenderRootGuard(source)).toBeNull();
    expect(targetRuntime.registries.renderRootGuard).toBe(sharedRootGuardSnapshot);
    expect(getRenderRootGuard(target)).toBe(renderRootGuard);
    expect(targetRuntime.registries.materialRenderers).toBe(sourceRuntime.registries.materialRenderers);
    expect(targetRuntime.registries.renderEffects).toBe(sourceRuntime.registries.renderEffects);
    expect(getRegistryTableEntry(targetRuntime.registries.materialRenderers!, 'acme.Material')).toBe(materialRenderer);
    expect(getRegistryTableEntry(targetRuntime.registries.renderEffects, 'acme.Effect')).toBe(runner);

    sourceRuntime.registries.renderEffects = withRegistryTableEntry(
      sourceRuntime.registries.renderEffects,
      'acme.Effect',
      replacement as never,
    );
    expect(getRegistryTableEntry(sourceRuntime.registries.renderEffects, 'acme.Effect')).toBe(replacement);
    expect(getRegistryTableEntry(targetRuntime.registries.renderEffects, 'acme.Effect')).toBe(runner);
  });
});

describe('createCanvasRenderState', () => {
  it('creates state with a valid context and canvas', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    expect(state).not.toBeNull();
    expect(state.canvas).toBe(c);
  });

  it('attaches a runtime under EntityRuntimeKey', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(state[EntityRuntimeKey]).not.toBeUndefined();
    expect(getCanvasRenderStateRuntime(state)).toBe(state[EntityRuntimeKey]);
  });
});

describe('createCanvasRenderStateRuntime', () => {
  it('allocates an entity runtime', () => {
    const runtime = createCanvasRenderStateRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.renderEffects).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'CanvasRenderEffect',
      shape: 'keyed',
    });
    expect(runtime.registries.materialRenderers).toBeUndefined();
  });
});

describe('destroyCanvasRenderState', () => {
  it('destroys renderer data owned by the offscreen traversal state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const root = createDisplayObject();
    const destroyData = vi.fn();
    registerRenderer(state, root.kind, {
      createData: () => createEntity({}),
      destroyData,
      submit: vi.fn(),
    });
    prepareScene2DRender(state, root);

    destroyCanvasRenderState(state);

    expect(destroyData).toHaveBeenCalledOnce();
  });
});

describe('getCanvasRenderStateRuntime', () => {
  it('returns the mutable runtime attached to the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const runtime = getCanvasRenderStateRuntime(state);
    runtime.currentBlendMode = null;
    expect(getCanvasRenderStateRuntime(state).currentBlendMode).toBeNull();
  });
});

let canvas: HTMLCanvasElement;

beforeEach(() => {
  // Mock canvas and context for testing
  canvas = document.createElement('canvas');
  const mockContext = {
    getContextAttributes: vi.fn().mockReturnValue({
      alpha: true,
      desynchronized: false,
    }),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = vi.fn().mockReturnValue(mockContext);
});

it('should be instantiated with default options', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer).not.toBeNull();
  expect(renderer.canvas).toBe(canvas);
  expect(renderer.context.imageSmoothingEnabled).toBe(true);
  expect(renderer.context.imageSmoothingQuality).toBe('high');
  expect(renderer.contextAttributes).toEqual({
    alpha: true,
    desynchronized: false,
  });
  expect(renderer.backgroundColor).toBe(0);
  expect(renderer.pixelRatio).toBe(1);
  expect(renderer.roundPixels).toBe(false);
  expect(renderer.renderTransform2D).not.toBeNull();
});

it('should use provided options', () => {
  const options: CanvasRenderOptions = {
    backgroundColor: 0xffffff,
    pixelRatio: 2,
    roundPixels: true,
    renderTransform: createMatrix(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const renderer = createCanvasRenderState(canvas, options);

  expect(renderer.backgroundColor).toBe(0xffffff);
  expect(renderer.pixelRatio).toBe(2);
  expect(renderer.roundPixels).toBe(true);
  expect(renderer.renderTransform2D).not.toBeNull();
  expect(renderer.context.imageSmoothingEnabled).toBe(false);
  expect(renderer.context.imageSmoothingQuality).toBe('low');
});

it('should throw an error if context is not available', () => {
  canvas.getContext = vi.fn().mockReturnValue(null); // Simulate failure to get context

  expect(() => createCanvasRenderState(canvas)).toThrowError('Failed to get context for canvas.');
});

it('should default imageSmoothingEnabled to true', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.context.imageSmoothingEnabled).toBe(true);
});

it('should default imageSmoothingQuality to "high"', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.context.imageSmoothingQuality).toBe('high');
});

it('should correctly handle backgroundColor option', () => {
  const options: CanvasRenderOptions = {
    backgroundColor: 0xff0000, // Red
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.backgroundColor).toBe(0xff0000);
});

it('should use default pixelRatio if not provided', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.pixelRatio).toBe(1);
});

it('should handle custom pixelRatio correctly', () => {
  const options: CanvasRenderOptions = {
    pixelRatio: 2,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.pixelRatio).toBe(2);
});

it('should default roundPixels to false', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.roundPixels).toBe(false);
});

it('should correctly handle roundPixels option', () => {
  const options: CanvasRenderOptions = {
    roundPixels: true,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.roundPixels).toBe(true);
});

it('should handle worldTransform option correctly', () => {
  const customTransform = createMatrix();
  const options: CanvasRenderOptions = {
    renderTransform: customTransform,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.renderTransform2D).toBe(customTransform);
});

it('should fall back to default Matrix if worldTransform is not provided', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.renderTransform2D).not.toBeNull();
});

// Check if contextAttributes are passed and correctly retrieved
it('should retrieve contextAttributes from the context', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.contextAttributes).toEqual({
    alpha: true,
    desynchronized: false,
  });
});

// Ensure options with missing properties are handled gracefully
it('should handle missing imageSmoothingQuality and imageSmoothingEnabled in options', () => {
  const options: CanvasRenderOptions = {
    imageSmoothingEnabled: undefined,
    imageSmoothingQuality: undefined,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.context.imageSmoothingEnabled).toBe(true);
  expect(renderer.context.imageSmoothingQuality).toBe('high');
});

describe('getCanvasRenderStateTextureResolvers', () => {
  it('hands back the one set the state owns, so a rasterizer can share its transcode cache', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    const resolvers = getCanvasRenderStateTextureResolvers(state);

    expect(resolvers).toBe(getCanvasRenderStateTextureResolvers(state));
    registerCanvasBitmapTextureResolver(resolvers);
    expect(resolvers.registry?.size).toBe(1);
  });
});
