import type { VideoResource } from '@flighthq/types/contract';

// No cloneVideoResource: a VideoResource is a thin carrier over a single HTMLVideoElement, and an
// element cannot be duplicated (each carries its own decoder and playback position). Wrap the same
// element in a second createVideoResource call if two carriers over one stream are truly wanted.
// `objectUrl` transfers ownership of a blob object URL to the resource, so disposal revokes it. Pass
// it only for a URL this resource should own — a caller-managed URL stays the caller's to revoke.
export function createVideoResource(element?: HTMLVideoElement, objectUrl?: string): VideoResource {
  return { element: element ?? null, objectUrl: objectUrl ?? null };
}

// Releases the decoder the element holds: clearing the src and calling load() detaches the media
// resource so the browser can free its buffers, then the element reference is dropped for GC. Also
// revokes an owned object URL, whose blob-store entry is what keeps the underlying Blob reachable —
// the revoke belongs here, at end of life, because the element fetches from that URL for as long as it
// plays. Both are dispose*, not destroy*: each releases a reference so memory becomes GC-eligible,
// rather than freeing a non-GC handle.
export function disposeVideoResource(resource: VideoResource): void {
  const element = resource.element as HTMLVideoElement | null;
  if (element !== null) {
    element.removeAttribute('src');
    element.load();
  }
  // Revoked after the element has let go of the src, so the media resource is never detached from a
  // URL the element is still reading through.
  if (resource.objectUrl !== null) {
    URL.revokeObjectURL(resource.objectUrl);
    resource.objectUrl = null;
  }
  resource.element = null;
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
