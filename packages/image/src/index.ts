export {
  cloneImageResource,
  createCompressedImageResource,
  createImageResource,
  invalidateImageResource,
  isImageResourceEmpty,
} from './imageResource.ts';
export * from './imageResourceFrom.ts';
export {
  createEmbeddedImageResourceReference,
  createExternalImageResourceReference,
  createImageResourceFailure,
  explainImageResourceReferenceResolution,
  resetFailedImageResourceReference,
  resolveImageResourceReference,
} from './imageResourceReference.ts';
