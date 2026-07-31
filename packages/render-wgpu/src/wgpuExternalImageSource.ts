// WebGPU rejects an external-image copy when the host source has no current pixels. This is a
// transient state for decoded media and can also occur while a browser restores a 2D canvas context;
// callers should skip the upload and try again on a later frame rather than surface a DOMException.
export function isWgpuExternalImageSourceReady(
  source: GPUCopyExternalImageSource,
  width: number,
  height: number,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;

  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    if (source.width < width || source.height < height) return false;
    const context = source.getContext('2d');
    return context === null || typeof context.isContextLost !== 'function' || !context.isContextLost();
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
    if (source.width < width || source.height < height) return false;
    const context = source.getContext('2d');
    return context === null || typeof context.isContextLost !== 'function' || !context.isContextLost();
  }
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    return source.displayWidth >= width && source.displayHeight >= height;
  }

  // Keep test doubles and future host source variants usable; the copy extent is still validated.
  return true;
}
