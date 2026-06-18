import type { AudioResource, AudioResourceURL } from '@flighthq/types';

import { createAudioResource, getAudioContext } from './audioResource';

export function createAudioResourceFromURL(url: string): AudioResource {
  const resource = createAudioResource();
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => getAudioContext().decodeAudioData(buf))
    .then((buf) => {
      resource.buffer = buf;
    })
    .catch(() => {});
  return resource;
}

export function createAudioResourceFromURLs(sources: AudioResourceURL[]): AudioResource {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioResource();
  return createAudioResourceFromURL(selected.url);
}

export async function loadAudioResourceFromURL(url: string): Promise<AudioResource> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
  return createAudioResource(audioBuffer);
}

export async function loadAudioResourceFromURLs(sources: AudioResourceURL[]): Promise<AudioResource> {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioResource();
  return loadAudioResourceFromURL(selected.url);
}

function inferAudioType(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    case 'm4a':
      return 'audio/mp4';
    default:
      return null;
  }
}
