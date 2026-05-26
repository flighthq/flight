import type { AudioSource } from './audioSource';
import { createAudioSource } from './audioSource';

export interface AudioSourceURL {
  url: string;
  type?: string;
}

export function createAudioSourceFromURL(url: string): AudioSource {
  const el = new Audio(url);
  el.preload = 'auto';
  return createAudioSource(el);
}

export function loadAudioSourceFromURL(url: string): Promise<AudioSource> {
  return new Promise((resolve, reject) => {
    const el = new Audio(url);
    el.preload = 'auto';
    const source = createAudioSource(el);
    el.addEventListener('canplay', () => resolve(source), { once: true });
    el.addEventListener('error', () => reject(new Error(`Failed to load audio: ${url}`)), { once: true });
  });
}

export function createAudioSourceFromURLs(sources: AudioSourceURL[]): AudioSource {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioSource();
  return createAudioSourceFromURL(selected.url);
}

export function loadAudioSourceFromURLs(sources: AudioSourceURL[]): Promise<AudioSource> {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return Promise.resolve(createAudioSource());
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
