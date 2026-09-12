import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { registerHostImageDimensionResolver } from '@flighthq/image/contract';
import type {
  EntityConstruction,
  HostImageDimensionResolver,
  HostImageDimensions,
  HostImageSource,
  ImageResource,
} from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

// The web realizations of an ImageResource: a canvas, a decoded ImageBitmap, or an <img> element. Each
// names a browser type, which is why they live here rather than in the portable image package — that
// package holds the resource identity and lifecycle, this one holds what a handle IS on the web.

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromCanvas(out, canvas);
  return finishEntity(out);
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromImageBitmap(out, bitmap);
  return finishEntity(out);
}

export function createImageResourceFromImageElement(img: HTMLImageElement): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromImageElement(out, img);
  return finishEntity(out);
}

export function initializeImageResourceFromCanvas(
  out: EntityConstruction<ImageResource>,
  canvas: HTMLCanvasElement,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = canvas.height;
  out.kind = ImageTextureSourceKind;
  out.source = canvas;
  out.version = 0;
  out.width = canvas.width;
}

export function initializeImageResourceFromImageBitmap(
  out: EntityConstruction<ImageResource>,
  bitmap: ImageBitmap,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = bitmap.height;
  out.kind = ImageTextureSourceKind;
  out.source = bitmap;
  out.version = 0;
  out.width = bitmap.width;
}

export function initializeImageResourceFromImageElement(
  out: EntityConstruction<ImageResource>,
  img: HTMLImageElement,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = img.height;
  out.kind = ImageTextureSourceKind;
  out.source = img;
  out.version = 0;
  out.width = img.width;
}

// Installs the browser measurer that @flighthq/image calls when it re-reads a source's pixel size.
// Opt-in: an application that builds resources through the typed factories above never needs it, since
// those measure at construction; a caller that wraps an arbitrary drawable with createImageResource, or
// that invalidates one whose element resized, registers this first.
export function registerWebImageDimensionResolver(): void {
  registerHostImageDimensionResolver(webImageDimensionResolver);
}

// Video frames carry their size on videoWidth/videoHeight; every other drawable the browser accepts
// exposes width/height directly. A handle that answers neither is not one this host produced, so the
// resolver declines it rather than reporting zero.
export const webImageDimensionResolver: HostImageDimensionResolver = (
  source: HostImageSource,
  out: HostImageDimensions,
): boolean => {
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    out.height = source.videoHeight;
    out.width = source.videoWidth;
    return true;
  }
  const sized = source as Partial<HostImageDimensions>;
  if (typeof sized.width !== 'number' || typeof sized.height !== 'number') return false;
  out.height = sized.height;
  out.width = sized.width;
  return true;
};

// What a HOST decode yields, and the only honest default for a source whose pixels we never touch.
// Every browser image/canvas/ImageBitmap decode is straight-alpha sRGB, so declaring it is a statement
// of fact rather than an assumption.
const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
