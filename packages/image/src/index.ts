export {
  cloneImageResource,
  createCompressedImageResource,
  createImageResource,
  invalidateImageResource,
  isImageResourceEmpty,
} from './imageResource';
export * from './imageResourceFrom';
export {
  createEmbeddedImageResourceReference,
  createExternalImageResourceReference,
  createImageResourceFailure,
  explainImageResourceReferenceResolution,
  resetFailedImageResourceReference,
  resolveImageResourceReference,
} from './imageResourceReference';
