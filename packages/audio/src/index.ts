export * from './audioDecodeSlot';
export * from './audioFormat';
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
} from './audioResource';
export * from './audioResourceFrom';
export {
  createAudioResourceFailure,
  createEmbeddedAudioResourceReference,
  createExternalAudioResourceReference,
  explainAudioResourceReferenceResolution,
  findAudioResourceReferenceByName,
  resetFailedAudioResourceReference,
  resolveAudioResourceReference,
} from './audioResourceReference';
