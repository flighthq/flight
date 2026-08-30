import { sendNetRequest } from '@flighthq/net/contract';
import type { AudioResource, AudioResourceUrl, HasNetHttp } from '@flighthq/types/contract';

import { canPlayAudioType, inferAudioMimeType } from './audioFormat';
import { createAudioResource } from './audioResource';

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

// Web Audio's decodeAudioData content-sniffs the container, so `mimeType` is advisory here (threaded
// for loader-family symmetry and non-web backends); the decoder ignores it.
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

// Decodes encoded audio bytes into a resource. Copies the viewed region into a fresh ArrayBuffer
// before decoding so the caller's Uint8Array is not detached by decodeAudioData. `mimeType` is
// advisory (see loadAudioResourceFromBase64): decodeAudioData sniffs the container itself.
export async function loadAudioResourceFromBytes(
  context: AudioContext,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  signal?.throwIfAborted();
  const buffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const audioBuffer = await context.decodeAudioData(buffer);
  // decodeAudioData cannot be cancelled, so an abort landing mid-decode cannot stop the work — but it
  // must still stop the result, or an aborted load resolves with a resource the caller no longer wants
  // and is indistinguishable from one it asked for. This is the whole family's abort barrier: every
  // loader here funnels through this function, so checking after the await is what makes "an aborted
  // load never resolves" true for all of them rather than only for the pre-abort fast path above.
  signal?.throwIfAborted();
  return createAudioResource(audioBuffer);
}

export async function loadAudioResourceFromUrl(
  host: HasNetHttp,
  context: AudioContext,
  url: string,
  signal?: AbortSignal,
): Promise<AudioResource> {
  const response = await sendNetRequest(
    host,
    { method: 'GET', responseType: 'arraybuffer', url },
    signal === undefined ? undefined : { signal },
  );
  // The NetBackend reports network failures and non-2xx responses alike through the response, before
  // the audio decoder can misdiagnose an HTTP error body as invalid audio. This function retains its
  // existing reject-on-failure contract; the transport itself remains caller-replaceable.
  if (!response.ok) throw new Error(`Failed to load audio: ${url} (${response.status} ${response.statusText})`);
  if (!(response.body instanceof ArrayBuffer)) throw new Error(`Failed to load audio: ${url} (invalid body)`);
  return loadAudioResourceFromBytes(context, new Uint8Array(response.body), response.headers['content-type'], signal);
}

export async function loadAudioResourceFromUrls(
  host: HasNetHttp,
  context: AudioContext,
  sources: readonly AudioResourceUrl[],
  signal?: AbortSignal,
): Promise<AudioResource> {
  const selected = selectAudioResourceUrl(sources);
  if (selected === null) return createAudioResource();
  return loadAudioResourceFromUrl(host, context, selected, signal);
}

// Picks the first source URL the environment can play, or null when none is playable. A source's
// explicit `type` wins; otherwise the MIME type is inferred from the URL extension.
export function selectAudioResourceUrl(sources: readonly AudioResourceUrl[]): string | null {
  for (const source of sources) {
    const type = source.type ?? inferAudioMimeType(source.url) ?? '';
    if (canPlayAudioType(type)) return source.url;
  }
  return null;
}
