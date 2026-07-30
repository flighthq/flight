import { createEntity } from '@flighthq/entity/contract';
import type { CompressedImage, CompressedImageData, ImageResource } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

// Allocates a new resource identity over the same borrowed host image. The host handle is shared by
// reference; the clone owns an independent version counter for renderer cache invalidation.
export function cloneImageResource(resource: Readonly<ImageResource>): ImageResource {
  return createEntity({
    height: resource.height,
    kind: resource.kind,
    source: resource.source,
    version: resource.version,
    width: resource.width,
  });
}

// Wraps a parsed block-compressed payload as its own GPU-only backing. The caller owns the payload
// bytes indexed by the container's level ranges.
export function createCompressedImage(compressed: Readonly<CompressedImageData>): CompressedImage {
  return createEntity({
    compressed,
    height: compressed.container.height,
    kind: CompressedImageTextureSourceKind,
    version: 0,
    width: compressed.container.width,
  });
}

export function createImageResource(image: CanvasImageSource): ImageResource {
  const resource: ImageResource = createEntity({
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
