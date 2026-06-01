import type { VideoSource, VideoSourceURL } from '@flighthq/types';

import { createVideoSource } from './videoSource';

export function createVideoSourceFromURL(url: string): VideoSource {
  const element = document.createElement('video');
  element.preload = 'auto';
  element.src = url;
  return createVideoSource(element);
}

export function createVideoSourceFromURLs(sources: VideoSourceURL[]): VideoSource {
  const probe = document.createElement('video');
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferVideoType(url) ?? '') !== '');
  if (selected === undefined) return createVideoSource();
  return createVideoSourceFromURL(selected.url);
}

export function loadVideoSourceFromURL(url: string): Promise<VideoSource> {
  return new Promise((resolve, reject) => {
    const element = document.createElement('video');
    element.preload = 'auto';
    element.addEventListener('canplay', () => resolve(createVideoSource(element)), { once: true });
    element.addEventListener('error', () => reject(new Error(`Failed to load video: ${url}`)), { once: true });
    element.src = url;
  });
}

export function loadVideoSourceFromURLs(sources: VideoSourceURL[]): Promise<VideoSource> {
  const probe = document.createElement('video');
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferVideoType(url) ?? '') !== '');
  if (selected === undefined) return Promise.resolve(createVideoSource());
  return loadVideoSourceFromURL(selected.url);
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
