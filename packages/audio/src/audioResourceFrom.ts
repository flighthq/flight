import type { AudioResource, AudioResourceUrl } from '@flighthq/types';

import { inferAudioType } from './audioFormat';
import { createAudioResource } from './audioResource';

export async function loadAudioResourceFromUrl(
  context: AudioContext,
  url: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const response = await fetch(url, { signal });
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  return createAudioResource(audioBuffer);
}

export async function loadAudioResourceFromUrls(
  context: AudioContext,
  sources: AudioResourceUrl[],
  signal?: AbortSignal,
): Promise<AudioResource> {
  const probe = new Audio();
  const selected = sources.find(({ url, type }) => probe.canPlayType(type ?? inferAudioType(url) ?? '') !== '');
  if (selected === undefined) return createAudioResource();
  return loadAudioResourceFromUrl(context, selected.url, signal);
}
