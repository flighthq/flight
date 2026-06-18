import { createEntity } from '@flighthq/entity';
import type { ImageResource } from '@flighthq/types';

// Allocates a new resource identity over the SAME underlying element. The element (a DOM object or
// ImageBitmap) is shared by reference, not duplicated — clone gives you an independent version
// counter and entity identity over the same pixels, e.g. to upload one image into two render states
// with separate invalidation. Use a Surface copy when you need the pixels themselves duplicated.
export function cloneImageResource(resource: Readonly<ImageResource>): ImageResource {
  return createEntity({
    height: resource.height,
    source: resource.source,
    version: resource.version,
    width: resource.width,
  });
}

export function createImageResource(image?: CanvasImageSource): ImageResource {
  const resource: ImageResource = createEntity({ height: 0, source: image ?? null, version: 0, width: 0 });
  if (resource.source !== null) updateImageResourceSize(resource);
  return resource;
}

// Releases the element reference so it becomes eligible for GC and marks the resource changed. This
// does NOT free the backend GPU texture (that is owned per render state — call the backend's
// destroy*Texture) and does NOT close an owned ImageBitmap (ownership is ambiguous; close it
// explicitly if you own it). Dimensions are left intact; setImageResourceSource repopulates the resource.
export function disposeImageResource(resource: ImageResource): void {
  resource.source = null;
  invalidateImageResource(resource);
}

export function hasImageResourceSource(resource: Readonly<ImageResource>): boolean {
  return resource.source !== null;
}

// Bumps the resource content revision so consumers (renderer texture caches) know the pixels behind
// this image changed even though the object identity is the same. Call after mutating the backing
// pixels in place; the Surface API calls it for you. Resource-tier analog of invalidateNodeLocalContent.
export function invalidateImageResource(resource: ImageResource): void {
  resource.version = (resource.version + 1) >>> 0;
}

export function isImageResourceEmpty(resource: Readonly<ImageResource>): boolean {
  return resource.width <= 0 || resource.height <= 0;
}

// Swaps the element representation, re-reads its dimensions, and marks the resource changed. Pass
// null to clear the element (dimensions are left intact; use disposeImageResource to release for GC).
export function setImageResourceSource(resource: ImageResource, element: CanvasImageSource | null): void {
  resource.source = element;
  if (element !== null) updateImageResourceSize(resource);
  invalidateImageResource(resource);
}

// Reads pixel dimensions from the current (non-null) element. Video sources carry their size on
// videoWidth/videoHeight; every other CanvasImageSource exposes width/height directly.
function updateImageResourceSize(resource: ImageResource): void {
  const element = resource.source!;
  if (element instanceof HTMLVideoElement) {
    resource.width = element.videoWidth;
    resource.height = element.videoHeight;
  } else {
    const sized = element as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
    resource.width = sized.width;
    resource.height = sized.height;
  }
}
