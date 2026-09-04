import { allocateEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasRenderSurfaceOptions,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function acquireCanvasRenderSurface(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  options: Readonly<CanvasRenderSurfaceOptions>,
): CanvasRenderSurface | null {
  const canvas = creator.createRenderSurface(options.width, options.height, options.pixelRatio);
  if (canvas === null) return null;
  let surface: CanvasRenderSurface;
  try {
    surface = finishCanvasRenderSurface(creator, canvas, options);
  } catch {
    creator.destroyRenderSurface(canvas);
    return null;
  }
  _ownedSurfaceCreators.set(surface, creator);
  return surface;
}

export function createCanvasRenderSurface(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderSurfaceOptions> = {},
): CanvasRenderSurface {
  return finishCanvasRenderSurface(creator, canvas, options);
}

export function destroyCanvasRenderSurface(surface: CanvasRenderSurface): void {
  const creator = _ownedSurfaceCreators.get(surface);
  if (creator === undefined) return;
  _ownedSurfaceCreators.delete(surface);
  creator.destroyRenderSurface(surface.canvas);
}

function finishCanvasRenderSurface(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderSurfaceOptions>,
): CanvasRenderSurface {
  const requestedContextAttributes = options.contextAttributes;
  const context = canvas.getContext('2d', requestedContextAttributes);
  if (context === null) throw new Error('Failed to get context for canvas.');
  const surface = allocateEntity<CanvasRenderSurface>();
  surface.canvas = canvas;
  surface.context = context;
  surface.contextAttributes = context.getContextAttributes();
  surface.creator = creator;
  surface.options = Object.freeze({
    contextAttributes: requestedContextAttributes,
    height: options.height ?? canvas.height,
    pixelRatio: options.pixelRatio ?? 1,
    width: options.width ?? canvas.width,
  });
  surface[EntityRuntimeKey] = { binding: null };
  return surface;
}

const _ownedSurfaceCreators = new WeakMap<CanvasRenderSurface, Readonly<CanvasRenderSurfaceCreator>>();
