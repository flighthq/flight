import { createEntity } from '@flighthq/entity/contract';
import type { VideoResource } from '@flighthq/types/contract';

// No cloneVideoResource: a VideoResource is a thin carrier over a single HTMLVideoElement, and an
// element cannot be duplicated (each carries its own decoder and playback position). Wrap the same
// element in a second createVideoResource call if two carriers over one stream are truly wanted.
// `objectUrl` transfers ownership of a blob object URL to the resource, so destruction revokes it. Pass
// it only for a URL this resource should own — a caller-managed URL stays the caller's to revoke.
// `ownsElement` true means this resource created the element and destroyVideoResource will release
// its decoder; false means the caller supplied it and destruction only drops the reference.
export function createVideoResource(
  element?: HTMLVideoElement,
  objectUrl?: string,
  ownsElement?: boolean,
): VideoResource {
  return createEntity({ element: element ?? null, objectUrl: objectUrl ?? null, ownsElement: ownsElement ?? false });
}

// Releases a video resource's non-GC state: for owned elements, detaches the media source so the
// browser can free decoder buffers and drops MediaStream srcObject (without stopping caller-owned
// tracks); for borrowed elements, only drops the reference. Revokes a held object URL in either case
// since it is the resource's to manage regardless of element ownership.
export function destroyVideoResource(resource: VideoResource): void {
  const element = resource.element as HTMLVideoElement | null;
  if (element !== null && resource.ownsElement) {
    // Detach a live MediaStream without stopping its tracks — those belong to the caller.
    if (element.srcObject !== null) {
      element.srcObject = null;
    }
    element.removeAttribute('src');
    element.load();
  }
  if (resource.objectUrl !== null) {
    URL.revokeObjectURL(resource.objectUrl);
    resource.objectUrl = null;
  }
  resource.element = null;
  resource.ownsElement = false;
}

// Legacy unconditional teardown — releases the decoder regardless of ownership. Callers that know
// they own the element (e.g. loader error paths that just created it) can still use this; for
// caller-provided elements, prefer destroyVideoResource which respects the ownership flag.
export function disposeVideoResource(resource: VideoResource): void {
  const element = resource.element as HTMLVideoElement | null;
  if (element !== null) {
    element.removeAttribute('src');
    element.load();
  }
  if (resource.objectUrl !== null) {
    URL.revokeObjectURL(resource.objectUrl);
    resource.objectUrl = null;
  }
  resource.element = null;
  resource.ownsElement = false;
}

// Duration in seconds of the loaded media, or 0 when no element is attached. May be NaN before
// metadata has loaded and Infinity for open-ended live streams — both come straight from the element.
export function getVideoResourceDuration(resource: Readonly<VideoResource>): number {
  const element = resource.element as HTMLVideoElement | null;
  return element !== null ? element.duration : 0;
}

export function getVideoResourceHeight(resource: Readonly<VideoResource>): number {
  const element = resource.element as HTMLVideoElement | null;
  return element !== null ? element.videoHeight : 0;
}

export function getVideoResourceWidth(resource: Readonly<VideoResource>): number {
  const element = resource.element as HTMLVideoElement | null;
  return element !== null ? element.videoWidth : 0;
}

export function hasVideoResourceElement(resource: Readonly<VideoResource>): boolean {
  return resource.element !== null;
}

export function isVideoResourceEmpty(resource: Readonly<VideoResource>): boolean {
  const element = resource.element as HTMLVideoElement | null;
  return element === null || element.videoWidth <= 0 || element.videoHeight <= 0;
}

// True once the element has decoded at least the current frame (readyState >= HAVE_CURRENT_DATA), so
// its videoWidth/videoHeight are known and a frame is available to sample or upload to a texture.
export function isVideoResourceReady(resource: Readonly<VideoResource>): boolean {
  const element = resource.element as HTMLVideoElement | null;
  return element !== null && element.readyState >= HAVE_CURRENT_DATA;
}

// HTMLMediaElement.HAVE_CURRENT_DATA — data for the current playback position is available.
const HAVE_CURRENT_DATA = 2;
