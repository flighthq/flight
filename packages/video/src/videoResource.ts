import type { VideoResource } from '@flighthq/types';

// No cloneVideoResource: a VideoResource is a thin carrier over a single HTMLVideoElement, and an
// element cannot be duplicated (each carries its own decoder and playback position). Wrap the same
// element in a second createVideoResource call if two carriers over one stream are truly wanted.
export function createVideoResource(element?: HTMLVideoElement): VideoResource {
  return { element: element ?? null };
}

// Releases the decoder the element holds: clearing the src and calling load() detaches the media
// resource so the browser can free its buffers, then the element reference is dropped for GC. Unlike
// destroy*, there is no non-GC handle to free here — the element is plain GC-managed memory.
export function disposeVideoResource(resource: VideoResource): void {
  const element = resource.element;
  if (element !== null) {
    element.removeAttribute('src');
    element.load();
  }
  resource.element = null;
}

// Duration in seconds of the loaded media, or 0 when no element is attached. May be NaN before
// metadata has loaded and Infinity for open-ended live streams — both come straight from the element.
export function getVideoResourceDuration(resource: Readonly<VideoResource>): number {
  return resource.element !== null ? resource.element.duration : 0;
}

export function getVideoResourceHeight(resource: Readonly<VideoResource>): number {
  return resource.element !== null ? resource.element.videoHeight : 0;
}

export function getVideoResourceWidth(resource: Readonly<VideoResource>): number {
  return resource.element !== null ? resource.element.videoWidth : 0;
}

export function hasVideoResourceElement(resource: Readonly<VideoResource>): boolean {
  return resource.element !== null;
}

export function isVideoResourceEmpty(resource: Readonly<VideoResource>): boolean {
  const element = resource.element;
  return element === null || element.videoWidth <= 0 || element.videoHeight <= 0;
}

// True once the element has decoded at least the current frame (readyState >= HAVE_CURRENT_DATA), so
// its videoWidth/videoHeight are known and a frame is available to sample or upload to a texture.
export function isVideoResourceReady(resource: Readonly<VideoResource>): boolean {
  const element = resource.element;
  return element !== null && element.readyState >= HAVE_CURRENT_DATA;
}

// HTMLMediaElement.HAVE_CURRENT_DATA — data for the current playback position is available.
const HAVE_CURRENT_DATA = 2;
