import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderSurfaceCreator, EntityConstruction } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createWebCanvasRenderSurfaceCreator(): CanvasRenderSurfaceCreator {
  const creator = allocateEntity<CanvasRenderSurfaceCreator>();
  initializeWebCanvasRenderSurfaceCreator(creator);
  return finishEntity(creator);
}

export function initializeWebCanvasRenderSurfaceCreator(creator: EntityConstruction<CanvasRenderSurfaceCreator>): void {
  creator.createRenderSurface = (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
  creator.destroyRenderSurface = (canvas: HTMLCanvasElement): void => {
    canvas.width = 0;
    canvas.height = 0;
  };
  creator[EntityRuntimeKey] = { binding: null };
}

export const webCanvasRenderSurfaceCreator: CanvasRenderSurfaceCreator = createWebCanvasRenderSurfaceCreator();
