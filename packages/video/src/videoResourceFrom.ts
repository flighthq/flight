import type { VideoResource, VideoResourceUrl } from '@flighthq/types';

import { inferVideoType } from './videoFormat';
import { createVideoResource } from './videoResource';

export function loadVideoResourceFromUrl(url: string, signal?: AbortSignal): Promise<VideoResource> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const element = document.createElement('video');
    element.preload = 'auto';

    const onCanPlay = (): void => {
      cleanup();
      resolve(createVideoResource(element));
    };

    const onError = (): void => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    };

    const onAbort = (): void => {
      cleanup();
      element.src = '';
      reject(signal!.reason);
    };

    const cleanup = (): void => {
      element.removeEventListener('canplay', onCanPlay);
      element.removeEventListener('error', onError);
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    };

    element.addEventListener('canplay', onCanPlay, { once: true });
    element.addEventListener('error', onError, { once: true });
    if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true });

    element.src = url;
  });
}

export function loadVideoResourceFromUrls(sources: VideoResourceUrl[], signal?: AbortSignal): Promise<VideoResource> {
  const probe = document.createElement('video');
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferVideoType(url) ?? '') !== '');
  if (selected === undefined) return Promise.resolve(createVideoResource());
  return loadVideoResourceFromUrl(selected.url, signal);
}
