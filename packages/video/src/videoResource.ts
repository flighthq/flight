import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, HostImageSource, HostVideoCapability, VideoResource } from '@flighthq/types/contract';

// No provider parameter: this only stores a source the caller already holds, and storing it needs
// nothing from a host. Every export that READS video state takes the provider first; these two do not
// read any.
export function createVideoResource(
  element?: HostImageSource,
  objectUrl?: string,
  ownsElement?: boolean,
): VideoResource {
  const out = allocateEntity<VideoResource>();
  initializeVideoResource(out, element, objectUrl, ownsElement);
  return finishEntity(out);
}

// Releases a video resource's non-GC state: for owned elements, asks the host to release the element
// — which detaches any live capture stream without stopping caller-owned tracks; for borrowed
// elements, only drops the reference. Revokes a held object URL in either case, since that URL is the
// resource's to manage regardless of element ownership.
export function destroyVideoResource(hostVideo: Readonly<HostVideoCapability>, resource: VideoResource): void {
  const element = resource.element;
  if (element !== null && resource.ownsElement) hostVideo.releaseElement?.(element);
  releaseVideoResourceObjectUrl(hostVideo, resource);
  resource.element = null;
  resource.ownsElement = false;
}

// Legacy unconditional teardown — releases the element regardless of ownership. Callers that know
// they own the element (e.g. loader error paths that just created it) can still use this; for
// caller-provided elements, prefer destroyVideoResource, which respects the ownership flag.
export function disposeVideoResource(hostVideo: Readonly<HostVideoCapability>, resource: VideoResource): void {
  const element = resource.element;
  if (element !== null) hostVideo.releaseElement?.(element);
  releaseVideoResourceObjectUrl(hostVideo, resource);
  resource.element = null;
  resource.ownsElement = false;
}

// Duration in seconds of the loaded media, or 0 when no element is attached and 0 when the host
// carries no video capability. May be NaN before metadata has loaded and Infinity for open-ended live
// streams — both come straight from the host.
export function getVideoResourceDuration(
  hostVideo: Readonly<HostVideoCapability>,
  resource: Readonly<VideoResource>,
): number {
  const element = resource.element;
  return element !== null ? (hostVideo.getDuration?.(element) ?? 0) : 0;
}

export function getVideoResourceHeight(
  hostVideo: Readonly<HostVideoCapability>,
  resource: Readonly<VideoResource>,
): number {
  const element = resource.element;
  return element !== null ? (hostVideo.getHeight?.(element) ?? 0) : 0;
}

export function getVideoResourceWidth(
  hostVideo: Readonly<HostVideoCapability>,
  resource: Readonly<VideoResource>,
): number {
  const element = resource.element;
  return element !== null ? (hostVideo.getWidth?.(element) ?? 0) : 0;
}

export function hasVideoResourceElement(resource: Readonly<VideoResource>): boolean {
  return resource.element !== null;
}

// No cloneVideoResource: a VideoResource is a thin carrier over a single host video source, and a
// source cannot be duplicated (each carries its own decoder and playback position). Wrap the same
// source in a second createVideoResource call if two carriers over one stream are truly wanted.
// `objectUrl` transfers ownership of a blob object URL to the resource, so destruction revokes it. Pass
// it only for a URL this resource should own — a caller-managed URL stays the caller's to revoke.
// `ownsElement` true means this resource created the element and destroyVideoResource will release
// its decoder; false means the caller supplied it and destruction only drops the reference.
export function initializeVideoResource(
  out: EntityConstruction<VideoResource>,
  element?: HostImageSource,
  objectUrl?: string,
  ownsElement?: boolean,
): void {
  out.element = element ?? null;
  out.objectUrl = objectUrl ?? null;
  out.ownsElement = ownsElement ?? false;
}

// Empty when there is no element, when the host cannot report dimensions, or when the reported frame
// has no area yet — all three mean there is nothing to sample.
export function isVideoResourceEmpty(
  hostVideo: Readonly<HostVideoCapability>,
  resource: Readonly<VideoResource>,
): boolean {
  return getVideoResourceWidth(hostVideo, resource) <= 0 || getVideoResourceHeight(hostVideo, resource) <= 0;
}

// True once the host reports at least the current frame decoded, so the resource's width and height
// are known and a frame is available to sample or upload to a texture.
export function isVideoResourceReady(
  hostVideo: Readonly<HostVideoCapability>,
  resource: Readonly<VideoResource>,
): boolean {
  const element = resource.element;
  return element !== null && hostVideo.isReady?.(element) === true;
}

// The object URL is the resource's own, so it is revoked on every teardown path — through the host,
// which owns the object-URL lifecycle, rather than through a browser global in portable source. Kept
// in one place so destroy and dispose cannot drift apart on it.
function releaseVideoResourceObjectUrl(hostVideo: Readonly<HostVideoCapability>, resource: VideoResource): void {
  if (resource.objectUrl === null) return;
  hostVideo.revokeObjectUrl?.(resource.objectUrl);
  resource.objectUrl = null;
}
