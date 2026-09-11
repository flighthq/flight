import { sendNetRequest } from '@flighthq/net/contract';
import type { AudioResource, AudioResourceUrl, HostAudioProvider, HostNetProvider } from '@flighthq/types/contract';

import { hasAudioDecoder } from './audioDecoderRegistry';
import { canPlayAudioType, inferAudioMimeType } from './audioFormat';
import { createAudioResource } from './audioResource';
import { decodeAudioResourceBytes } from './decodeAudioResourceBytes';

// Builds a resource from raw PCM channel data without needing an AudioContext. Each entry in
// `channels` holds one channel's Float32 samples; all are expected to share the first channel's
// length. Uses the AudioBuffer constructor (not context.createBuffer) so it works off the audio
// thread. Returns a null-buffer resource for empty or zero-length input.
export function createAudioResourceFromSamples(channels: readonly Float32Array[], sampleRate: number): AudioResource {
  const numberOfChannels = channels.length;
  const length = numberOfChannels > 0 ? channels[0].length : 0;
  if (numberOfChannels === 0 || length === 0) return createAudioResource();
  const buffer = new AudioBuffer({ length, numberOfChannels, sampleRate });
  for (let channel = 0; channel < numberOfChannels; channel++) {
    // Narrow the widened ArrayBufferLike backing to the ArrayBuffer that copyToChannel requires.
    buffer.copyToChannel(channels[channel] as Float32Array<ArrayBuffer>, channel);
  }
  return createAudioResource(buffer);
}

// MIME type selects a registered decoder when present; Web Audio otherwise content-sniffs the container.
export async function loadAudioResourceFromBase64(
  context: AudioContext,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return loadAudioResourceFromBytes(context, bytes, mimeType, signal);
}

export async function loadAudioResourceFromBlob(
  context: AudioContext,
  blob: Blob,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const arrayBuffer = await blob.arrayBuffer();
  return loadAudioResourceFromBytes(context, new Uint8Array(arrayBuffer), blob.type || undefined, signal);
}

// Decodes encoded audio bytes into a resource. A registered MIME-specific decoder wins; Web Audio
// otherwise content-sniffs the container. Rejects when a registered decoder reports an expected miss.
export async function loadAudioResourceFromBytes(
  context: AudioContext,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const resource = await decodeAudioResourceBytes(context, bytes, mimeType, signal ?? new AbortController().signal);
  if (resource === null) throw new Error(`Failed to decode audio${mimeType === undefined ? '' : `: ${mimeType}`}`);
  return resource;
}

export async function loadAudioResourceFromUrl(
  hostNet: Readonly<HostNetProvider>,
  context: AudioContext,
  url: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  return _loadAudioResourceFromUrl(hostNet, context, url, inferAudioMimeType(url) ?? undefined, signal);
}

async function _loadAudioResourceFromUrl(
  hostNet: Readonly<HostNetProvider>,
  context: AudioContext,
  url: string,
  mimeType: string | undefined,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const response = await sendNetRequest(
    hostNet,
    { method: 'GET', responseType: 'arraybuffer', url },
    signal === undefined ? undefined : { signal },
  );
  // The NetBackend reports network failures and non-2xx responses alike through the response, before
  // the audio decoder can misdiagnose an HTTP error body as invalid audio. This function retains its
  // existing reject-on-failure contract; the transport itself remains caller-replaceable.
  if (!response.ok) throw new Error(`Failed to load audio: ${url} (${response.status} ${response.statusText})`);
  if (!(response.body instanceof ArrayBuffer)) throw new Error(`Failed to load audio: ${url} (invalid body)`);
  return loadAudioResourceFromBytes(
    context,
    new Uint8Array(response.body),
    response.headers['content-type'] ?? mimeType,
    signal,
  );
}

export async function loadAudioResourceFromUrls(
  hostNet: Readonly<HostNetProvider>,
  hostAudio: Readonly<HostAudioProvider>,
  context: AudioContext,
  sources: readonly AudioResourceUrl[],
  signal?: AbortSignal,
): Promise<AudioResource> {
  const selected = _selectAudioResourceSource(hostAudio, sources);
  if (selected === null) return createAudioResource();
  const mimeType = selected.type ?? inferAudioMimeType(selected.url) ?? undefined;
  return _loadAudioResourceFromUrl(hostNet, context, selected.url, mimeType, signal);
}

export function selectAudioResourceUrl(
  hostAudio: Readonly<HostAudioProvider>,
  sources: readonly AudioResourceUrl[],
): string | null {
  return _selectAudioResourceSource(hostAudio, sources)?.url ?? null;
}

function _selectAudioResourceSource(
  hostAudio: Readonly<HostAudioProvider>,
  sources: readonly AudioResourceUrl[],
): AudioResourceUrl | null {
  for (const source of sources) {
    const type = source.type ?? inferAudioMimeType(source.url) ?? '';
    if (hasAudioDecoder(type) || canPlayAudioType(hostAudio, type)) return source;
  }
  return null;
}
