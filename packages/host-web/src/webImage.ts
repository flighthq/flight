import { createEntity } from '@flighthq/entity/contract';
import { createImageResourceFromCanvas, createImageResourceFromImageElement } from '@flighthq/image/contract';
import type { Entity, EntityWithoutRuntime, ImageBackend, ImageResource } from '@flighthq/types/contract';

export function createWebImageBackend(): ImageBackend & Entity {
  return createEntity<EntityWithoutRuntime<ImageBackend>>({
    createImageFromBitmap(bitmap): ImageResource {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const domImageData = new globalThis.ImageData(bitmap.width, bitmap.height);
      domImageData.data.set(bitmap.alphaType === 'premultiplied' ? unpremultiplyRgba8(bitmap.data) : bitmap.data);
      canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
      return createImageResourceFromCanvas(canvas);
    },
    async loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
      signal?.throwIfAborted();
      const img = new Image();
      if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
      img.src = url;
      if (signal !== undefined) {
        let rejectAbort: (reason?: unknown) => void = () => {};
        const abortPromise = new Promise<never>((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = (): void => {
          img.src = '';
          rejectAbort(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          await Promise.race([img.decode(), abortPromise]);
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      } else {
        await img.decode();
      }
      return createImageResourceFromImageElement(img);
    },
  });
}

export const webImageBackend: ImageBackend & Entity = createWebImageBackend();

function unpremultiplyRgba8(source: Readonly<Uint8ClampedArray>): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(source);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      continue;
    }
    const scale = 255 / alpha;
    data[i] = Math.min(255, Math.round(data[i] * scale));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * scale));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * scale));
  }
  return data;
}
