import type { GlContext, Image } from '@flighthq/types/contract';

import { uploadGlTextureElement } from './glTextureUpload';

// The per-frame video-to-GPU upload path. An Image's borrowed HTMLVideoElement decodes new pixels
// continuously, so a driver re-uploads the currently-bound GL texture whenever the element's frame
// advances — but not on frames where nothing changed (a paused or stalled stream), which would waste a
// full-frame DMA. `uploadedVersion` is the source revision the caller last uploaded; this compares it to the
// source's `version` and re-uploads through the element fast-path only on a change, returning the
// id now on the GPU so the caller stores it for the next frame.
//
// The caller owns creating, binding, and setting sampler/pixel-store state on the texture; this writes
// level 0 at gl.TEXTURE_2D. Returns `uploadedVersion` unchanged (no GL call) when the frame has not
// advanced or the element has no decoded frame yet, so it is safe to call every frame unconditionally.
export function uploadGlTextureVideoFrame(
  gl: GlContext,
  image: Readonly<Image>,
  uploadedVersion: number,
  internalFormat: number = gl.RGBA,
): number {
  if (image.version === uploadedVersion) return uploadedVersion;
  const element = image.source as HTMLVideoElement | null;
  // A first-frame guard: HAVE_CURRENT_DATA (2) with non-zero dimensions. texImage2D on an element with
  // no decoded frame throws in some browsers, so skip until a frame exists and report no upload.
  if (element === null || element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) {
    return uploadedVersion;
  }
  uploadGlTextureElement(gl, gl.TEXTURE_2D, element as unknown as TexImageSource, internalFormat);
  return image.version;
}
