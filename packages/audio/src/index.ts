export { AudioResourceFailureKind, AudioResourceReferenceKind } from './contract.ts';
export * from './audioDecodeSlot.ts';
export * from './audioFormat.ts';
export {
  cloneAudioResource,
  createAudioResource,
  disposeAudioResource,
  getAudioResourceByteSize,
  getAudioResourceChannelCount,
  getAudioResourceChannelData,
  getAudioResourceDuration,
  getAudioResourceSampleRate,
  hasAudioResourceBuffer,
  isAudioResourceEmpty,
} from './audioResource.ts';
export * from './audioResourceFrom.ts';
export {
  createAudioResourceFailure,
  createEmbeddedAudioResourceReference,
  createExternalAudioResourceReference,
  explainAudioResourceReferenceResolution,
  findAudioResourceReferenceByName,
  resetFailedAudioResourceReference,
  resolveAudioResourceReference,
} from './audioResourceReference.ts';
export type {
  AudioChannelState,
  AudioDecoder,
  AudioDecoderRegistry,
  AudioPlayOptions,
  AudioResource,
  AudioResourceFailure,
  AudioResourceFetch,
  AudioResourceReference,
  AudioResourceReferenceResolutionExplanation,
  AudioResourceUrl,
  EmbeddedAudioResourceReference,
  ExternalAudioResourceReference,
  HostAudioCodecCapability,
  HostAudioDecodeCapabilities,
  HostAudioDecodeFormatCapability,
} from './contract.ts';
