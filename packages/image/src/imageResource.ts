import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CompressedImageData,
  CompressedImageResource,
  EntityConstruction,
  HostImageDimensions,
  HostImageSource,
  ImageResource,
} from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import { getHostImageSourceDimensions } from './imageSourceDimensions';

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

export function createCompressedImageResource(compressed: Readonly<CompressedImageData>): CompressedImageResource {
  const out = allocateEntity<CompressedImageResource>();
  initializeCompressedImageResource(out, compressed);
  return finishEntity(out);
}

// Wraps a borrowed host handle whose size is read through the registered host dimension resolver. A
// caller that already holds the size — a host factory building from its own canvas or decoded bitmap —
// sets width and height directly instead and needs no resolver.
export function createImageResource(image: HostImageSource): ImageResource {
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

// Wraps a parsed block-compressed payload as its own GPU-only source. The caller owns the payload
// bytes indexed by the container's level ranges.
export function initializeCompressedImageResource(
  out: EntityConstruction<CompressedImageResource>,
  compressed: Readonly<CompressedImageData>,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.compressed = compressed;
  out.gamut = DECODED_GAMUT;
  out.height = compressed.container.height;
  out.kind = CompressedImageTextureSourceKind;
  out.version = 0;
  out.width = compressed.container.width;
}

// Marks changed pixels behind the same borrowed host handle. The handle itself remains immutable.
export function invalidateImageResource(resource: ImageResource): void {
  updateImageResourceSize(resource);
  resource.version = (resource.version + 1) >>> 0;
}

export function isImageResourceEmpty(resource: Readonly<ImageResource>): boolean {
  return resource.width <= 0 || resource.height <= 0;
}

// Re-reads pixel dimensions from the borrowed handle through the host resolver. With no resolver
// registered the resource keeps the dimensions it already carries, which is what a host factory that
// measured its own source at construction wants.
function updateImageResourceSize(resource: ImageResource): void {
  const source = resource.source;
  if (source === null) return;
  _measured.height = resource.height;
  _measured.width = resource.width;
  if (!getHostImageSourceDimensions(source, _measured)) return;
  resource.height = _measured.height;
  resource.width = _measured.width;
}

// What a HOST decode yields, and the only honest default for a source whose pixels we never touch.
// Every browser image/canvas/ImageBitmap decode is straight-alpha sRGB, so declaring it is a statement
// of fact rather than an assumption — which is the point: a producer that knows otherwise (a native
// iOS/Android decode commonly premultiplies) now has somewhere to say so, and the uploaders' existing
// `alphaType !== 'premultiplied'` guard starts protecting ImageResource the way it already protects Bitmap.
const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';

// Scratch pair reused by the size re-read; measuring a resource never allocates.
const _measured: HostImageDimensions = { height: 0, width: 0 };
