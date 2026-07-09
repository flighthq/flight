import type { DecodedImage, ImageDecodeOptions, ImageDecoder } from '@flighthq/types';

import { registerImageDecoder } from './imageDecoderRegistry';

// Registers the browser's createImageBitmap + OffscreenCanvas decoder under every MIME type the platform
// can decode. Opt-in — nothing runs until the caller invokes this. A native host registers wasm codecs
// instead and never calls this.
export function registerWebImageDecoders(): void {
  for (const mimeType of webDecodableMimeTypes) {
    registerImageDecoder(mimeType, decodeImageWithCanvas);
  }
}

// One decoder shared across every browser-decodable MIME type: createImageBitmap sniffs the format from
// the bytes, so the registration key does not need to reach the Blob. getImageData is always straight
// (non-premultiplied) RGBA, so premultiplied output cannot come from a single canvas pass — when
// premultiplyAlpha is requested we decode straight, then premultiply the pixels in JS.
const decodeImageWithCanvas: ImageDecoder = async (
  bytes: Readonly<Uint8Array>,
  options?: Readonly<ImageDecodeOptions>,
): Promise<DecodedImage> => {
  // slice() yields a fresh, non-readonly Uint8Array for Blob and detaches from any pooled input buffer.
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, width, height).data;
  if (options?.premultiplyAlpha === true) premultiplyRgbaInPlace(data);
  return { data, width, height };
};

// In-place straight → premultiplied RGBA: scale each color channel by alpha/255. Only the premultiplied
// decode path calls this, since canvas getImageData always yields straight alpha.
function premultiplyRgbaInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 255) continue;
    data[i] = (data[i] * alpha) / 255;
    data[i + 1] = (data[i + 1] * alpha) / 255;
    data[i + 2] = (data[i + 2] * alpha) / 255;
  }
}

const webDecodableMimeTypes: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
];
