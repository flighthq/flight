import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireCanvasRenderSurface,
  createCanvasRenderSurface,
  destroyCanvasRenderSurface,
} from './canvasRenderSurface';

function makeCreator(createRenderSurface = () => document.createElement('canvas')) {
  const destroyRenderSurface = vi.fn((canvas: HTMLCanvasElement) => {
    canvas.width = 0;
    canvas.height = 0;
  });
  const creator = (() => {
    const out = allocateEntity<unknown>();
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
