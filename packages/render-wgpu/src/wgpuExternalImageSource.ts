// WebGPU rejects an external-image copy when the host source has no current pixels. This predicate
// covers the readiness state exposed by the platform; tryCopyWgpuExternalImageToTexture closes the
// remaining gap where the browser cannot snapshot an otherwise dimension-valid source.
export function isWgpuExternalImageSourceReady(
  source: GPUCopyExternalImageSource,
  width: number,
  height: number,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;

  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    // There is no side-effect-free canvas context query: getContext('2d') binds an unbound canvas.
    // The guarded copy below is the authoritative check for a missing, lost, or unsnapshotable context.
    return source.width >= width && source.height >= height;
  }
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth >= width && source.naturalHeight >= height;
  }
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth >= width && source.videoHeight >= height;
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return source.width >= width && source.height >= height;
  }
  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    return source.width >= width && source.height >= height;
  }
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    return source.displayWidth >= width && source.displayHeight >= height;
  }

  return false;
}

// Canvas snapshots can fail after all observable readiness checks pass (notably while a frequently
// rerasterized 2D text canvas replaces its backing resource). That is expected source unavailability,
// so callers retain the previous texture and retry; security and destination/programming errors escape.
export function tryCopyWgpuExternalImageToTexture(
  queue: GPUQueue,
  source: Readonly<GPUCopyExternalImageSourceInfo>,
  destination: Readonly<GPUCopyExternalImageDestInfo>,
  width: number,
  height: number,
): boolean {
  if (!isWgpuExternalImageSourceReady(source.source, width, height)) return false;
  try {
    queue.copyExternalImageToTexture(source, destination, [width, height, 1]);
    return true;
  } catch (error) {
    if (isWgpuExternalImageSourceUnavailableError(error)) return false;
    throw error;
  }
}

function isWgpuExternalImageSourceUnavailableError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'InvalidStateError' || error.name === 'OperationError';
  }
  return error instanceof TypeError && error.message.endsWith('Failed to copy content from external image.');
}
