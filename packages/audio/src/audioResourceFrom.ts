import { sendNetRequest } from '@flighthq/net/contract';
import type {
  AudioDecoderRegistry,
  AudioResource,
  AudioResourceUrl,
  HostAudioCodecCapability,
  HostAudioDecodeCapabilities,
  HostNetCapability,
} from '@flighthq/types/contract';

import { canPlayAudioType, getAudioMimeTypeEssence, inferAudioMimeType } from './audioFormat';
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

// MIME type selects a caller-supplied decoder when one is given; the host's own slots otherwise decode
// the container, content-sniffing it when the type is absent or names no standard format.
export async function loadAudioResourceFromBase64(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return loadAudioResourceFromBytes(audioDecode, bytes, mimeType, signal, decoders);
}

export async function loadAudioResourceFromBlob(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  blob: Blob,
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  const arrayBuffer = await blob.arrayBuffer();
  return loadAudioResourceFromBytes(audioDecode, new Uint8Array(arrayBuffer), blob.type || undefined, signal, decoders);
}

// Decodes encoded audio bytes into a resource. A caller-supplied decoder for the type wins; the host's
// own slots decode everything else. Rejects when nothing could decode the payload, which is the one
// place an expected miss becomes an error — the loaders promise a resource.
export async function loadAudioResourceFromBytes(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  const resource = await decodeAudioResourceBytes(
    audioDecode,
    bytes,
    mimeType,
    signal ?? new AbortController().signal,
    decoders,
  );
  if (resource === null) throw new Error(`Failed to decode audio${mimeType === undefined ? '' : `: ${mimeType}`}`);
  return resource;
}

export async function loadAudioResourceFromUrl(
  hostNet: Readonly<HostNetCapability>,
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  url: string,
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  return _loadAudioResourceFromUrl(hostNet, audioDecode, url, inferAudioMimeType(url) ?? undefined, signal, decoders);
}

async function _loadAudioResourceFromUrl(
  hostNet: Readonly<HostNetCapability>,
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  url: string,
  mimeType: string | undefined,
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  const response = await sendNetRequest(
    hostNet,
    { method: 'GET', responseType: 'arraybuffer', url },
    signal === undefined ? undefined : { signal },
  );
  // The HostNetCapability reports network failures and non-2xx responses alike through the response, before
  // the audio decoder can misdiagnose an HTTP error body as invalid audio. This function retains its
  // existing reject-on-failure contract; the transport itself remains caller-replaceable.
  if (!response.ok) throw new Error(`Failed to load audio: ${url} (${response.status} ${response.statusText})`);
  if (!(response.body instanceof ArrayBuffer)) throw new Error(`Failed to load audio: ${url} (invalid body)`);
  return loadAudioResourceFromBytes(
    audioDecode,
    new Uint8Array(response.body),
    response.headers['content-type'] ?? mimeType,
    signal,
    decoders,
  );
}

export async function loadAudioResourceFromUrls(
  hostNet: Readonly<HostNetCapability>,
  hostAudioCodec: Readonly<HostAudioCodecCapability>,
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  sources: readonly AudioResourceUrl[],
  signal?: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource> {
  const selected = _selectAudioResourceSource(hostAudioCodec, sources, decoders);
  if (selected === null) return createAudioResource();
  const mimeType = selected.type ?? inferAudioMimeType(selected.url) ?? undefined;
  return _loadAudioResourceFromUrl(hostNet, audioDecode, selected.url, mimeType, signal, decoders);
}

export function selectAudioResourceUrl(
  hostAudioCodec: Readonly<HostAudioCodecCapability>,
  sources: readonly AudioResourceUrl[],
  decoders?: AudioDecoderRegistry,
): string | null {
  return _selectAudioResourceSource(hostAudioCodec, sources, decoders)?.url ?? null;
}

// The two arms a source is accepted on: the caller brought a decoder for this type, or the platform can
// play the container itself.
//
// The host's own audioDecode slots are deliberately NOT a third arm, and not a substitute for the
// second. They answer a different question — whether bytes already in hand can be turned into samples —
// and a platform-backed host declares all seven of them whatever its element can actually play. Letting
// them vote here would make every standard container look selectable and leave `canPlayType` with no
// veto, which is the opposite of what selecting among sources is for.
function _selectAudioResourceSource(
  hostAudioCodec: Readonly<HostAudioCodecCapability>,
  sources: readonly AudioResourceUrl[],
  decoders?: AudioDecoderRegistry,
): AudioResourceUrl | null {
  for (const source of sources) {
    const type = source.type ?? inferAudioMimeType(source.url) ?? '';
    const supplied = type !== '' && decoders?.has(getAudioMimeTypeEssence(type)) === true;
    if (supplied || canPlayAudioType(hostAudioCodec, type)) return source;
  }
  return null;
}
