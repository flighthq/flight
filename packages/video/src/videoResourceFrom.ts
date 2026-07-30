import type { VideoResource, VideoResourceLoadOptions, VideoResourceUrl } from '@flighthq/types/contract';

import { selectVideoResourceUrl } from './videoFormat';
import { createVideoResource, disposeVideoResource } from './videoResource';

// Wraps a live MediaStream (camera, screen capture, canvas.captureStream) as a video resource by
// assigning it to element.srcObject. Pure DOM, no load — the stream feeds frames as they arrive.
export function createVideoResourceFromMediaStream(stream: MediaStream): VideoResource {
  const element = document.createElement('video');
  element.srcObject = stream;
  return createVideoResource(element);
}

// Loads from a Blob by wrapping it in an object URL. This function owns that URL and revokes it once
// the load settles (success or failure), so the caller never has to.
export async function loadVideoResourceFromBlob(
  blob: Blob,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadVideoResourceFromUrl(url, options, signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadVideoResourceFromUrl(
  url: string,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const element = document.createElement('video');
    element.preload = (options?.preload ?? 'auto') as HTMLMediaElement['preload'];
    // crossOrigin must be set before assigning src so the fetched frames stay untainted for GPU upload.
    if (options?.crossOrigin !== undefined) element.crossOrigin = options.crossOrigin;
    if (options?.muted !== undefined) element.muted = options.muted;
    if (options?.playsInline !== undefined) element.playsInline = options.playsInline;
    const readyEvent = readinessEventName(options?.readiness);

    const onReady = (): void => {
      cleanup();
      resolve(createVideoResource(element));
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
