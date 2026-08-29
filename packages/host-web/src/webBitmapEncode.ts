import {
  hasBitmapEncodeHostBackend,
  installBitmapEncodeHostBackend,
  observeBitmapEncodeHostResult,
} from '@flighthq/bitmap/contract';
import type { BitmapEncodeBackend } from '@flighthq/types/contract';

export function enableHostWebBitmapEncode(): void {
  if (hasBitmapEncodeHostBackend()) return;
  installBitmapEncodeHostBackend(createWebBitmapEncodeBackend());
}

function createWebBitmapEncodeBackend(): BitmapEncodeBackend {
  return {
    encodeBitmap(source, format, quality): Uint8Array {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const imageData = new globalThis.ImageData(source.width, source.height);
        imageData.data.set(source.data);
        canvas.getContext('2d')!.putImageData(imageData, 0, 0);
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        observeBitmapEncodeHostResult('encodeBitmap', true);
        return bytes;
      } catch (error) {
        observeBitmapEncodeHostResult('encodeBitmap', false);
        throw error;
      }
    },
    supportedFormats: ['jpeg', 'png'],
  };
}
