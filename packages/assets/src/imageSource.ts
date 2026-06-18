import { createEntity } from '@flighthq/entity';
import type { ImageSource } from '@flighthq/types';

// Allocates a new resource identity over the SAME underlying element. The element (a DOM object or
// ImageBitmap) is shared by reference, not duplicated — clone gives you an independent version
// counter and entity identity over the same pixels, e.g. to upload one image into two render states
// with separate invalidation. Use a Surface copy when you need the pixels themselves duplicated.
export function cloneImageSource(source: Readonly<ImageSource>): ImageSource {
  return createEntity({
    height: source.height,
    src: source.src,
    version: source.version,
    width: source.width,
  });
}

export function createImageSource(image?: CanvasImageSource): ImageSource {
  const source: ImageSource = createEntity({ height: 0, src: image ?? null, version: 0, width: 0 });
  if (source.src !== null) updateImageSourceSize(source);
  return source;
}

// Releases the element reference so it becomes eligible for GC and marks the resource changed. This
// does NOT free the backend GPU texture (that is owned per render state — call the backend's
// destroy*Texture) and does NOT close an owned ImageBitmap (ownership is ambiguous; close it
// explicitly if you own it). Dimensions are left intact; setImageSourceElement repopulates the resource.
export function disposeImageSource(source: ImageSource): void {
  source.src = null;
  invalidateImageSource(source);
}

export function hasImageSourceElement(source: Readonly<ImageSource>): boolean {
  return source.src !== null;
}

// Bumps the asset content revision so consumers (renderer texture caches) know the pixels behind
// this image changed even though the object identity is the same. Call after mutating the backing
// pixels in place; the Surface API calls it for you. Asset-tier analog of invalidateNodeLocalContent.
export function invalidateImageSource(source: ImageSource): void {
  source.version = (source.version + 1) >>> 0;
}

export function isImageSourceEmpty(source: Readonly<ImageSource>): boolean {
  return source.width <= 0 || source.height <= 0;
}

// Swaps the element representation, re-reads its dimensions, and marks the resource changed. Pass
// null to clear the element (dimensions are left intact; use disposeImageSource to release for GC).
export function setImageSourceElement(source: ImageSource, element: CanvasImageSource | null): void {
  source.src = element;
  if (element !== null) updateImageSourceSize(source);
  invalidateImageSource(source);
}

// Reads pixel dimensions from the current (non-null) element. Video sources carry their size on
// videoWidth/videoHeight; every other CanvasImageSource exposes width/height directly.
function updateImageSourceSize(source: ImageSource): void {
  const element = source.src!;
  if (element instanceof HTMLVideoElement) {
    source.width = element.videoWidth;
    source.height = element.videoHeight;
  } else {
    const sized = element as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
    source.width = sized.width;
    source.height = sized.height;
  }
}
