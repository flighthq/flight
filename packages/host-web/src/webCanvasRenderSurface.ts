import { createEntity } from '@flighthq/entity/contract';
import type { CanvasRenderSurfaceCreator } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createWebCanvasRenderSurfaceCreator(): CanvasRenderSurfaceCreator {
  const creator = createEntity({
    createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      return canvas;
    },
    destroyRenderSurface(canvas: HTMLCanvasElement): void {
      canvas.width = 0;
      canvas.height = 0;
    },
  });
  creator[EntityRuntimeKey] = { binding: null, uid: null };
  return creator;
}

export const webCanvasRenderSurfaceCreator: CanvasRenderSurfaceCreator = createWebCanvasRenderSurfaceCreator();
