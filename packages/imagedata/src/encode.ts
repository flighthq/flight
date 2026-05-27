import type { ImageData } from '@flighthq/types';

export type ImageFormat = 'jpeg' | 'png';

export function encodeImageData(source: ImageData, format: ImageFormat = 'png', quality: number = 0.9): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const domImageData = new globalThis.ImageData(source.width, source.height);
  domImageData.data.set(source.data);
  canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataURL = canvas.toDataURL(mimeType, quality);
  const base64 = dataURL.slice(dataURL.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
