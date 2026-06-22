import type { VideoResource, VideoResourceUrl } from '@flighthq/types';

import { createVideoResource } from './videoResource';

export function createVideoResourceFromUrl(url: string): VideoResource {
  const element = document.createElement('video');
  element.preload = 'auto';
  element.src = url;
  return createVideoResource(element);
}

export function createVideoResourceFromURLs(sources: VideoResourceUrl[]): VideoResource {
  const probe = document.createElement('video');
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferVideoType(url) ?? '') !== '');
  if (selected === undefined) return createVideoResource();
  return createVideoResourceFromUrl(selected.url);
}

export function loadVideoResourceFromUrl(url: string): Promise<VideoResource> {
  return new Promise((resolve, reject) => {
    const element = document.createElement('video');
    element.preload = 'auto';
    element.addEventListener('canplay', () => resolve(createVideoResource(element)), { once: true });
    element.addEventListener('error', () => reject(new Error(`Failed to load video: ${url}`)), { once: true });
    element.src = url;
  });
}

export function loadVideoResourceFromURLs(sources: VideoResourceUrl[]): Promise<VideoResource> {
  const probe = document.createElement('video');
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferVideoType(url) ?? '') !== '');
  if (selected === undefined) return Promise.resolve(createVideoResource());
  return loadVideoResourceFromUrl(selected.url);
}

function inferVideoType(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'ogv':
    case 'ogg':
      return 'video/ogg';
    case 'mov':
      return 'video/quicktime';
    default:
      return null;
  }
}
