import type { VideoTexture } from '@flighthq/types';

import { uploadGlTextureElement } from './glTextureUpload';

// The per-frame video-to-GPU upload path. A VideoTexture's backing HTMLVideoElement decodes new pixels
// continuously, so a driver re-uploads the currently-bound GL texture whenever the element's frame
// advances — but not on frames where nothing changed (a paused or stalled stream), which would waste a
// full-frame DMA. `uploadedFrameId` is the id the caller last uploaded; this compares it to the
// VideoTexture's `frameId` and re-uploads through the element fast-path only on a change, returning the
// id now on the GPU so the caller stores it for the next frame.
//
// The caller owns creating, binding, and setting sampler/pixel-store state on the texture; this writes
// level 0 at gl.TEXTURE_2D. Returns `uploadedFrameId` unchanged (no GL call) when the frame has not
// advanced or the element has no decoded frame yet, so it is safe to call every frame unconditionally.
export function uploadGlTextureVideoFrame(
  gl: WebGL2RenderingContext,
  videoTexture: Readonly<VideoTexture>,
  uploadedFrameId: number,
): number {
  if (videoTexture.frameId === uploadedFrameId) return uploadedFrameId;
  const element = videoTexture.source.element;
  // A first-frame guard: HAVE_CURRENT_DATA (2) with non-zero dimensions. texImage2D on an element with
  // no decoded frame throws in some browsers, so skip until a frame exists and report no upload.
  if (element === null || element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) {
    return uploadedFrameId;
  }
  uploadGlTextureElement(gl, gl.TEXTURE_2D, element as unknown as TexImageSource);
  return videoTexture.frameId;
}
