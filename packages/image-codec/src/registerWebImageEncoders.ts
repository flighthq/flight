import type { DecodedImage, ImageEncodeOptions, ImageEncoder } from '@flighthq/types';

import { registerImageEncoder } from './imageEncoderRegistry';

// Registers the OffscreenCanvas + convertToBlob encoder under every MIME type the platform can encode.
// Opt-in — nothing runs until the caller invokes this. A native host registers wasm encoders instead.
export function registerWebImageEncoders(): void {
  for (const mimeType of webEncodableMimeTypes) {
    registerImageEncoder(mimeType, createCanvasImageEncoder(mimeType));
  }
}

// Each encoder closes over its MIME type so convertToBlob emits that format (unlike decode, encode must
// name the target format). quality is forwarded as the lossy-format hint; lossless PNG ignores it.
function createCanvasImageEncoder(mimeType: string): ImageEncoder {
  return async (image: Readonly<DecodedImage>, options?: Readonly<ImageEncodeOptions>): Promise<Uint8Array> => {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    // ImageData needs a mutable Uint8ClampedArray; copy so a Readonly input is honored and not aliased.
    const pixels = new Uint8ClampedArray(image.data);
    context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: mimeType, quality: options?.quality });
    return new Uint8Array(await blob.arrayBuffer());
  };
}

const webEncodableMimeTypes: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
