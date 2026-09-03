import { createEntity } from '@flighthq/entity/contract';
import type { CompressedImageResource, CompressedImageData, ImageResource } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

// Allocates a new resource identity over the same borrowed host image. The host handle is shared by
// reference; the clone owns an independent version counter for renderer cache invalidation.
export function cloneImageResource(resource: Readonly<ImageResource>): ImageResource {
  return createEntity({
    alphaType: resource.alphaType,
    gamut: resource.gamut,
    height: resource.height,
    kind: resource.kind,
    source: resource.source,
    version: resource.version,
    width: resource.width,
  });
}

// Wraps a parsed block-compressed payload as its own GPU-only source. The caller owns the payload
// bytes indexed by the container's level ranges.
export function createCompressedImageResource(compressed: Readonly<CompressedImageData>): CompressedImageResource {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    compressed,
    gamut: DECODED_GAMUT,
    height: compressed.container.height,
    kind: CompressedImageTextureSourceKind,
    version: 0,
    width: compressed.container.width,
  });
}

export function createImageResource(image: CanvasImageSource): ImageResource {
  const resource: ImageResource = createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: 0,
    kind: ImageTextureSourceKind,
    source: image,
    version: 0,
    width: 0,
  });
  updateImageResourceSize(resource);
  return resource;
}

// Marks changed pixels behind the same borrowed host handle. The handle itself remains immutable.
export function invalidateImageResource(resource: ImageResource): void {
  updateImageResourceSize(resource);
  resource.version = (resource.version + 1) >>> 0;
}

export function isImageResourceEmpty(resource: Readonly<ImageResource>): boolean {
  return resource.width <= 0 || resource.height <= 0;
}

// Reads pixel dimensions from the current host element. Video sources carry their size on
// videoWidth/videoHeight; every other CanvasImageSource exposes width/height directly.
function updateImageResourceSize(resource: ImageResource): void {
  const element = resource.source;
  if (element === null) return;
  if (element instanceof HTMLVideoElement) {
    resource.width = element.videoWidth;
    resource.height = element.videoHeight;
  } else {
    const sized = element as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
    resource.width = sized.width;
    resource.height = sized.height;
  }
}

// What a HOST decode yields, and the only honest default for a source whose pixels we never touch.
// Every browser image/canvas/ImageBitmap decode is straight-alpha sRGB, so declaring it is a statement
// of fact rather than an assumption — which is the point: a producer that knows otherwise (a native
// iOS/Android decode commonly premultiplies) now has somewhere to say so, and the uploaders' existing
// `alphaType !== 'premultiplied'` guard starts protecting ImageResource the way it already protects Bitmap.
const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
