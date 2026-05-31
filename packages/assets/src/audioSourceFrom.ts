import type { AudioSource, AudioSourceURL } from '@flighthq/types';

import { createAudioSource, getAudioContext } from './audioSource';

export function createAudioSourceFromURL(url: string): AudioSource {
  const source = createAudioSource();
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => getAudioContext().decodeAudioData(buf))
    .then((buf) => {
      source.src = buf;
    })
    .catch(() => {});
  return source;
}

export function createAudioSourceFromURLs(sources: AudioSourceURL[]): AudioSource {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioSource();
  return createAudioSourceFromURL(selected.url);
}

export async function loadAudioSourceFromURL(url: string): Promise<AudioSource> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
  return createAudioSource(audioBuffer);
}

export async function loadAudioSourceFromURLs(sources: AudioSourceURL[]): Promise<AudioSource> {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioSource();
  return loadAudioSourceFromURL(selected.url);
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
