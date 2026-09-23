import type { CanvasRenderSurfaceCreator, NonEntityCreateResult } from '@flighthq/types/contract';

export function createWebCanvasRenderSurfaceCreator(): NonEntityCreateResult<
  Readonly<CanvasRenderSurfaceCreator>,
  'descriptor'
> {
  return Object.freeze({
    createRenderSurface: (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      return canvas;
    },
    destroyRenderSurface: (canvas: HTMLCanvasElement): void => {
      canvas.width = 0;
      canvas.height = 0;
    },
  });
}

export const webCanvasRenderSurfaceCreator: Readonly<CanvasRenderSurfaceCreator> =
  createWebCanvasRenderSurfaceCreator();
