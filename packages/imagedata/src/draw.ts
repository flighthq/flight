import type { ImageData } from '@flighthq/types';

export function drawImageData(dest: HTMLCanvasElement, source: ImageData, x: number, y: number): void {
  const domImageData = new globalThis.ImageData(source.width, source.height);
  domImageData.data.set(source.data);
  dest.getContext('2d')!.putImageData(domImageData, x, y);
}
