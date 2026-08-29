import type { VideoResource, VideoResourceLoadOptions, VideoResourceUrl } from '@flighthq/types/contract';

import { getVideoCapabilityBackend, selectVideoResourceUrl } from './videoFormat';
import { createVideoResource, disposeVideoResource } from './videoResource';

// Wraps a live MediaStream (camera, screen capture, canvas.captureStream) as a video resource by
// assigning it to element.srcObject. Returns null when the backend cannot create a video element.
export function createVideoResourceFromMediaStream(stream: MediaStream): VideoResource | null {
  const element = (getVideoCapabilityBackend().createVideoElement?.() ?? null) as HTMLVideoElement | null;
  if (element === null) return null;
  element.srcObject = stream;
  return createVideoResource(element, undefined, true);
}

// Loads from a Blob by wrapping it in an object URL, which the returned resource then owns: pass it to
// disposeVideoResource to revoke it. The revoke deliberately does not happen when the load settles —
// settling only means the readiness event fired, and the element keeps fetching from the URL while it
// plays and re-fetches on seek, so revoking there breaks playback of a video that just reported ready
// (most starkly under `readiness: 'metadata'`, where only the container header has been read).
//
// A failed load is the one case this function still revokes, because it returns no resource for the
// caller to dispose, so nothing else could ever release the URL.
export async function loadVideoResourceFromBlob(
  blob: Blob,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const url = URL.createObjectURL(blob);
  let resource: VideoResource;
  try {
    resource = await loadVideoResourceFromUrl(url, options, signal);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  resource.objectUrl = url;
  return resource;
}

export function loadVideoResourceFromUrl(
  url: string,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const element = (getVideoCapabilityBackend().createVideoElement?.() ?? null) as HTMLVideoElement | null;
  if (element === null) return Promise.reject(new Error('No video element backend available'));
  return new Promise((resolve, reject) => {
    element.preload = (options?.preload ?? 'auto') as HTMLMediaElement['preload'];
    // crossOrigin must be set before assigning src so the fetched frames stay untainted for GPU upload.
    if (options?.crossOrigin !== undefined) element.crossOrigin = options.crossOrigin;
    if (options?.muted !== undefined) element.muted = options.muted;
    if (options?.playsInline !== undefined) element.playsInline = options.playsInline;
    const readyEvent = readinessEventName(options?.readiness);

    const onReady = (): void => {
      cleanup();
      resolve(createVideoResource(element, undefined, true));
    };

    // Both rejection paths abandon an element this function created, so both owe it the same decoder
    // release — routed through disposeVideoResource so the sequence has exactly one home. Assigning
    // element.src = '' is not that sequence: an empty src resolves against the document base URL, so
    // the element goes on to fetch the *page* as media, and the decoder is never detached.
    const onError = (): void => {
      cleanup();
      disposeVideoResource(createVideoResource(element));
      reject(new Error(`Failed to load video: ${url}`));
    };

    const onAbort = (): void => {
      cleanup();
      disposeVideoResource(createVideoResource(element));
      reject(signal!.reason);
    };

    const cleanup = (): void => {
      element.removeEventListener(readyEvent, onReady);
      element.removeEventListener('error', onError);
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    };

    element.addEventListener(readyEvent, onReady, { once: true });
    element.addEventListener('error', onError, { once: true });
    if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true });

    element.src = url;
  });
}

export function loadVideoResourceFromUrls(
  sources: Readonly<VideoResourceUrl[]>,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const selected = selectVideoResourceUrl(sources);
  if (selected === null) return Promise.resolve(createVideoResource());
  return loadVideoResourceFromUrl(selected.url, options, signal);
}

// Maps a readiness mode to the media event that resolves the load; defaults to 'canplay'.
function readinessEventName(readiness: VideoResourceLoadOptions['readiness']): string {
  switch (readiness) {
    case 'metadata':
      return 'loadedmetadata';
    case 'canplaythrough':
      return 'canplaythrough';
    default:
      return 'canplay';
  }
}
