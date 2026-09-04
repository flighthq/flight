import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasRenderSurfaceOptions,
  EntityConstruction,
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
  return finishEntity(surface);
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

export function initializeCanvasRenderSurface(
  out: EntityConstruction<CanvasRenderSurface>,
  creator: Readonly<CanvasRenderSurfaceCreator>,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  options: Partial<CanvasRenderSurfaceOptions>,
): void {
  out.canvas = canvas;
  out.context = context;
  out.contextAttributes = context.getContextAttributes();
  out.creator = creator;
  out.options = Object.freeze({
    contextAttributes: options.contextAttributes,
    height: options.height ?? canvas.height,
    pixelRatio: options.pixelRatio ?? 1,
    width: options.width ?? canvas.width,
  });
  out[EntityRuntimeKey] = { binding: null };
}

function finishCanvasRenderSurface(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderSurfaceOptions>,
): CanvasRenderSurface {
  const context = canvas.getContext('2d', options.contextAttributes);
  if (context === null) throw new Error('Failed to get context for canvas.');
  const surface = allocateEntity<CanvasRenderSurface>();
  initializeCanvasRenderSurface(surface, creator, canvas, context, options);
  return finishEntity(surface);
}

const _ownedSurfaceCreators = new WeakMap<CanvasRenderSurface, Readonly<CanvasRenderSurfaceCreator>>();
