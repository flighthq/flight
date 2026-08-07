import { createEntity } from '@flighthq/entity/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, Image } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

// Transcodes a Bitmap's raw pixels into an element-backed Image, via a detached canvas.
// The inverse of captureBitmapFromImageResource. Lives here rather than in @flighthq/bitmap because a
// conversion belongs with the type it PRODUCES: you look for it under what you want to end up with.
// Allocates a fresh canvas on every call; callers that draw repeatedly should hold the result.
export function createImageResourceFromBitmap(bitmap: Readonly<Bitmap>): Image {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const domImageData = new globalThis.ImageData(bitmap.width, bitmap.height);
  domImageData.data.set(bitmap.alphaType === 'premultiplied' ? unpremultiplyRgba8(bitmap.data) : bitmap.data);
  canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

// ImageData is straight-alpha by contract. Preserve a Bitmap's declared representation at its own seam,
// then normalize only the temporary browser copy used to materialize a CanvasImageSource for Canvas/DOM.
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

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: canvas.height,
    kind: ImageTextureSourceKind,
    source: canvas,
    version: 0,
    width: canvas.width,
  });
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: bitmap.height,
    kind: ImageTextureSourceKind,
    source: bitmap,
    version: 0,
    width: bitmap.width,
  });
}

export function createImageResourceFromImageElement(img: HTMLImageElement): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: img.height,
    kind: ImageTextureSourceKind,
    source: img,
    version: 0,
    width: img.width,
  });
}

export function isImageUrlSameOrigin(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return true;
  }
}

export async function loadImageResourceFromBase64(
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<Image> {
  return loadImageResourceFromUrl(`data:${mimeType};base64,${base64}`, undefined, signal);
}

export async function loadImageResourceFromBlob(blob: Blob, signal?: AbortSignal): Promise<Image> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageResourceFromUrl(url, undefined, signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageResourceFromBytes(
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<Image> {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) {
    throw new Error('Unable to determine image type from bytes');
  }
  const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadImageResourceFromBlob(new Blob([buf], { type }), signal);
}

export async function loadImageResourceFromUrl(
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<Image> {
  signal?.throwIfAborted();
  const img = new Image();
  if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
  img.src = url;
  // Wire abort to cancel the pending decode and reject with the signal's reason. Always remove the
  // listener when the race settles so a long-lived signal does not retain the image and closure.
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
}

// The host-decode truth for every browser-backed source; see imageResource.ts.
const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
