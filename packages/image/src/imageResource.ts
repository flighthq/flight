import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CompressedImageData,
  CompressedImageResource,
  EntityConstruction,
  ImageResource,
} from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

// Allocates a new resource identity over the same borrowed host image. The host handle is shared by
// reference; the clone owns an independent version counter for renderer cache invalidation.
export function cloneImageResource(resource: Readonly<ImageResource>): ImageResource {
  const out = allocateEntity<ImageResource>();
  out.alphaType = resource.alphaType;
  out.gamut = resource.gamut;
  out.height = resource.height;
  out.kind = resource.kind;
  out.source = resource.source;
  out.version = resource.version;
  out.width = resource.width;
  return finishEntity(out);
}

// Wraps a parsed block-compressed payload as its own GPU-only source. The caller owns the payload
// bytes indexed by the container's level ranges.
export function createCompressedImageResource(compressed: Readonly<CompressedImageData>): CompressedImageResource {
  const out = allocateEntity<CompressedImageResource>();
  out.alphaType = DECODED_ALPHA_TYPE;
  out.compressed = compressed;
  out.gamut = DECODED_GAMUT;
  out.height = compressed.container.height;
  out.kind = CompressedImageTextureSourceKind;
  out.version = 0;
  out.width = compressed.container.width;
  return finishEntity(out);
}

export function createImageResource(image: CanvasImageSource): ImageResource {
  const resource = allocateEntity<ImageResource>();
  resource.alphaType = DECODED_ALPHA_TYPE;
  resource.gamut = DECODED_GAMUT;
  resource.height = 0;
  resource.kind = ImageTextureSourceKind;
  resource.source = image;
  resource.version = 0;
  resource.width = 0;
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
