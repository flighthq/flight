import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import {
  acquireCanvasRenderSurface,
  createCanvasRenderSurface,
  destroyCanvasRenderSurface,
  getCanvasSurfaceCreator,
  initializeCanvasRenderSurface,
  registerCanvasSurfaceCreator,
} from './canvasRenderSurface';
import { canvasTestSurfaceCreator, createCanvasTextureResolvers } from './canvasTestSupport';
import { scene2DCanvasPipeline } from './scene2DCanvasPipeline';

function makeCreator(createRenderSurface = () => document.createElement('canvas')) {
  const destroyRenderSurface = vi.fn((canvas: HTMLCanvasElement) => {
    canvas.width = 0;
    canvas.height = 0;
  });
  const creator = (() => {
    const out = allocateEntity<any>();
    out.createRenderSurface = createRenderSurface;
    out.destroyRenderSurface = destroyRenderSurface;
    return finishEntity(out);
  })();
  return { creator, destroyRenderSurface };
}

describe('acquireCanvasRenderSurface', () => {
  it('publishes a complete Entity only after context acquisition succeeds', () => {
    const { creator } = makeCreator();
    const surface = acquireCanvasRenderSurface(creator, { height: 24, pixelRatio: 2, width: 32 });

    expect(surface).not.toBeNull();
    expect(surface![EntityRuntimeKey]).toEqual({ binding: null });
    expect(surface!.creator).toBe(creator);
    expect(surface!.context).not.toBeNull();
  });

  it('destroys the raw canvas and returns null when context acquisition fails', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn().mockReturnValue(null);
    const { creator, destroyRenderSurface } = makeCreator(() => canvas);

    expect(acquireCanvasRenderSurface(creator, { height: 24, pixelRatio: 2, width: 32 })).toBeNull();
    expect(destroyRenderSurface).toHaveBeenCalledOnce();
    expect(destroyRenderSurface).toHaveBeenCalledWith(canvas);
  });

  it('stores a frozen copy of its acquisition options', () => {
    const { creator } = makeCreator();
    const options = { height: 24, pixelRatio: 2, width: 32 };
    const surface = acquireCanvasRenderSurface(creator, options)!;
    options.width = 99;

    expect(surface.options).toEqual({ contextAttributes: undefined, height: 24, pixelRatio: 2, width: 32 });
    expect(Object.isFrozen(surface.options)).toBe(true);
  });
});

describe('createCanvasRenderSurface', () => {
  it('wraps a caller-owned canvas without claiming teardown ownership', () => {
    const canvas = document.createElement('canvas');
    const { creator, destroyRenderSurface } = makeCreator();
    const surface = createCanvasRenderSurface(creator, canvas);

    destroyCanvasRenderSurface(surface);

    expect(destroyRenderSurface).not.toHaveBeenCalled();
    expect(canvas.width).not.toBe(0);
  });
});

describe('destroyCanvasRenderSurface', () => {
  it('routes teardown to the pinned creator exactly once', () => {
    const { creator, destroyRenderSurface } = makeCreator();
    const surface = acquireCanvasRenderSurface(creator, { height: 24, pixelRatio: 2, width: 32 })!;

    destroyCanvasRenderSurface(surface);
    destroyCanvasRenderSurface(surface);

    expect(destroyRenderSurface).toHaveBeenCalledOnce();
    expect(destroyRenderSurface).toHaveBeenCalledWith(surface.canvas);
  });
});
describe('getCanvasSurfaceCreator', () => {
  // ★ THE STATE OWNS NO SURFACE, SO IT CANNOT INVENT A CANVAS. Offscreen work — cache targets, render
  // textures — needs one, and the only honest answer to "where from" is the creator the host registered.
  // Throwing names the missing call; returning null would surface later as a null canvas somewhere else.
  it('throws until a creator is registered, then returns exactly that one', () => {
    // The bare factory, not the test rig: the rig registers a creator for convenience, which is exactly
    // what this test must not start from.
    const state = createCanvasRenderState(scene2DCanvasPipeline, createCanvasTextureResolvers());
    expect(() => getCanvasSurfaceCreator(state)).toThrow(/registerCanvasSurfaceCreator/);

    registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);

    expect(getCanvasSurfaceCreator(state)).toBe(canvasTestSurfaceCreator);
  });
});

describe('initializeCanvasRenderSurface', () => {
  it('is the construction initializer of createCanvasRenderSurface', () => {
    expect(typeof initializeCanvasRenderSurface).toBe('function');
  });
});

describe('registerCanvasSurfaceCreator', () => {
  it('replaces the creator a state allocates through', () => {
    const state = createCanvasRenderState(scene2DCanvasPipeline, createCanvasTextureResolvers());
    const { creator } = makeCreator();

    registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);
    registerCanvasSurfaceCreator(state, creator);

    expect(getCanvasSurfaceCreator(state)).toBe(creator);
  });
});
