import type {
  HostVideoProvider,
  VideoResource,
  VideoResourceLoadOptions,
  VideoResourceUrl,
} from '@flighthq/types/contract';

import { selectVideoResourceUrl } from './videoFormat';
import { createVideoResource } from './videoResource';

export async function loadVideoResourceFromBlob(
  hostVideo: Readonly<HostVideoProvider>,
  blob: Blob,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  if (hostVideo.createObjectUrl === undefined || hostVideo.revokeObjectUrl === undefined) {
    throw new Error('No video object URL backend available');
  }
  const url = hostVideo.createObjectUrl(blob);
  let resource: VideoResource;
  try {
    resource = await loadVideoResourceFromUrl(hostVideo, url, options, signal);
  } catch (error) {
    hostVideo.revokeObjectUrl(url);
    throw error;
  }
  resource.objectUrl = url;
  return resource;
}

export function loadVideoResourceFromUrl(
  hostVideo: Readonly<HostVideoProvider>,
  url: string,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  if (hostVideo.loadUrl === undefined) return Promise.reject(new Error('No video element backend available'));
  return hostVideo.loadUrl(url, options, signal).then((element) => createVideoResource(element, undefined, true));
}

export function loadVideoResourceFromUrls(
  hostVideo: Readonly<HostVideoProvider>,
  sources: Readonly<VideoResourceUrl[]>,
  options?: Readonly<VideoResourceLoadOptions>,
  signal?: AbortSignal,
): Promise<VideoResource> {
  const selected = selectVideoResourceUrl(hostVideo, sources);
  if (selected === null) return Promise.resolve(createVideoResource());
  return loadVideoResourceFromUrl(hostVideo, selected.url, options, signal);
}
