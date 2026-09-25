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
