import type {
  VideoCapabilityBackend,
  VideoResource,
  VideoResourceLoadOptions,
  VideoResourceUrl,
} from '@flighthq/types/contract';

import { selectVideoResourceUrl } from './videoFormat';
import { createVideoResource, disposeVideoResource } from './videoResource';

export function createVideoResourceFromMediaStream(
  backend: Readonly<VideoCapabilityBackend>,
  stream: MediaStream,
): VideoResource | null {
  const element = (backend.createVideoElement?.() ?? null) as HTMLVideoElement | null;
  if (element === null) return null;
  element.srcObject = stream;
  return createVideoResource(element, undefined, true);
}

export async function loadVideoResourceFromBlob(
  backend: Readonly<VideoCapabilityBackend>,
  blob: Blob,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const url = URL.createObjectURL(blob);
  let resource: VideoResource;
  try {
    resource = await loadVideoResourceFromUrl(backend, url, options, signal);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  resource.objectUrl = url;
  return resource;
}

export function loadVideoResourceFromUrl(
  backend: Readonly<VideoCapabilityBackend>,
  url: string,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const element = (backend.createVideoElement?.() ?? null) as HTMLVideoElement | null;
  if (element === null) return Promise.reject(new Error('No video element backend available'));
  return new Promise((resolve, reject) => {
    element.preload = (options?.preload ?? 'auto') as HTMLMediaElement['preload'];
    if (options?.crossOrigin !== undefined) element.crossOrigin = options.crossOrigin;
    if (options?.muted !== undefined) element.muted = options.muted;
    if (options?.playsInline !== undefined) element.playsInline = options.playsInline;
    const readyEvent = readinessEventName(options?.readiness);

    const onReady = (): void => {
      cleanup();
      resolve(createVideoResource(element, undefined, true));
    };

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
  backend: Readonly<VideoCapabilityBackend>,
  sources: Readonly<VideoResourceUrl[]>,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const selected = selectVideoResourceUrl(backend, sources);
  if (selected === null) return Promise.resolve(createVideoResource());
  return loadVideoResourceFromUrl(backend, selected.url, options, signal);
}

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
