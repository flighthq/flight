import { createEntity } from '@flighthq/entity';
import { cloneVector2, copyVector2, createVector2, inverseMatrix3 } from '@flighthq/geometry';
import type { Matrix3Like, VideoResource, VideoTexture, VideoTextureLike } from '@flighthq/types';

import { cloneSampler, copySampler, createSampler } from './sampler';

// Marks a fresh decoded frame as available for upload by bumping `frameId`. A driver calls this once
// per rendered frame when the backing element reports new pixels (readyState advanced, or a
// requestVideoFrameCallback fired); the GPU uploader compares the id against the one it last uploaded
// and re-uploads only on a change, so a paused stream costs no upload. Returns the new id.
export function advanceVideoTexture(videoTexture: VideoTextureLike): number {
  videoTexture.frameId += 1;
  return videoTexture.frameId;
}

// Allocates an independent VideoTexture over the SAME video stream: the VideoResource reference is
// shared (an HTMLVideoElement cannot be duplicated), while the Sampler and uv-transform vectors are
// deep-cloned so two textures over one stream sample independently. `frameId` resets to -1 so the
// clone forces its own first upload.
export function cloneVideoTexture(source: Readonly<VideoTextureLike>): VideoTexture {
  return createEntity({
    colorSpace: source.colorSpace,
    frameId: -1,
    sampler: cloneSampler(source.sampler),
    source: source.source,
    uvOffset: cloneVector2(source.uvOffset),
    uvRotation: source.uvRotation,
    uvScale: cloneVector2(source.uvScale),
  });
}

// Copies every VideoTexture field from source into out in place. The VideoResource reference is
// shared; the Sampler and uv-transform vectors are copied into out's existing entities. Safe when out
// aliases source.
export function copyVideoTexture(out: VideoTextureLike, source: Readonly<VideoTextureLike>): void {
  const colorSpace = source.colorSpace;
  const frameId = source.frameId;
  const src = source.source;
  const uvRotation = source.uvRotation;
  copySampler(out.sampler, source.sampler);
  copyVector2(out.uvOffset, source.uvOffset);
  copyVector2(out.uvScale, source.uvScale);
  out.colorSpace = colorSpace;
  out.frameId = frameId;
  out.source = src;
  out.uvRotation = uvRotation;
}

// Builds a VideoTexture over a VideoResource: a default Sampler, 'srgb' color space (video is
// display-referred), an identity KHR_texture_transform, and `frameId` -1 (no frame uploaded yet).
// Pass VideoTextureLike fields to override any of these.
export function createVideoTexture(source: VideoResource, opts?: Readonly<Partial<VideoTextureLike>>): VideoTexture {
  return createEntity({
    colorSpace: opts?.colorSpace ?? 'srgb',
    frameId: opts?.frameId ?? -1,
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
    source: opts?.source ?? source,
    uvOffset: opts?.uvOffset ? cloneVector2(opts.uvOffset) : createVector2(0, 0),
    uvRotation: opts?.uvRotation ?? 0,
    uvScale: opts?.uvScale ? cloneVector2(opts.uvScale) : createVector2(1, 1),
  });
}

// Returns the pixel height of the current video frame, or -1 when no element is attached or no frame
// has decoded yet (videoHeight is 0). Reads the element directly, so the value tracks a resolution
// change mid-stream.
export function getVideoTextureHeight(videoTexture: Readonly<VideoTextureLike>): number {
  const element = videoTexture.source.element;
  return element !== null && element.videoHeight > 0 ? element.videoHeight : -1;
}

// Composes the KHR_texture_transform fields and inverts the result, producing the matrix that maps
// already-transformed uv back to the unit-square source uv. A zero scale is singular, so inverseMatrix3
// fills the matrix with NaN. Out-param form — write into a pre-allocated Matrix3.
export function getVideoTextureInverseUvMatrix(out: Matrix3Like, videoTexture: Readonly<VideoTextureLike>): void {
  getVideoTextureUvMatrix(out, videoTexture);
  inverseMatrix3(out, out);
}

// Composes the KHR_texture_transform fields (uvOffset, uvRotation, uvScale) into the column-major 3×3
// matrix a shader consumes at sample time — the same layout getTextureUvMatrix produces, so a material
// samples a VideoTexture through one uv-transform path. scale → rotate → translate. Out-param form.
export function getVideoTextureUvMatrix(out: Matrix3Like, videoTexture: Readonly<VideoTextureLike>): void {
  const r = videoTexture.uvRotation;
  const sx = videoTexture.uvScale.x;
  const sy = videoTexture.uvScale.y;
  const tx = videoTexture.uvOffset.x;
  const ty = videoTexture.uvOffset.y;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const m = out.m;
  m[0] = sx * cosR;
  m[1] = sx * sinR;
  m[2] = 0;
  m[3] = -sy * sinR;
  m[4] = sy * cosR;
  m[5] = 0;
  m[6] = tx;
  m[7] = ty;
  m[8] = 1;
}

// Returns the pixel width of the current video frame, or -1 when no element is attached or no frame
// has decoded yet.
export function getVideoTextureWidth(videoTexture: Readonly<VideoTextureLike>): number {
  const element = videoTexture.source.element;
  return element !== null && element.videoWidth > 0 ? element.videoWidth : -1;
}

// True when the backing element has decoded at least the current frame (readyState >=
// HAVE_CURRENT_DATA) and its dimensions are known — the gate a material samples behind and a driver
// checks before calling advanceVideoTexture. False while metadata/first-frame is still buffering.
export function isVideoTextureFrameReady(videoTexture: Readonly<VideoTextureLike>): boolean {
  const element = videoTexture.source.element;
  return (
    element !== null && element.readyState >= HAVE_CURRENT_DATA && element.videoWidth > 0 && element.videoHeight > 0
  );
}

// Resets `frameId` to -1 so the next upload re-sends the current frame regardless of history. Used
// after a context loss (the GPU texture is gone) or a source swap to force a re-upload.
export function resetVideoTextureFrame(videoTexture: VideoTextureLike): void {
  videoTexture.frameId = -1;
}

// Binds a different video stream and resets `frameId` to -1 so the new stream's first frame uploads.
// Does not touch sampling state or the uv-transform.
export function setVideoTextureSource(videoTexture: VideoTextureLike, source: VideoResource): void {
  videoTexture.source = source;
  videoTexture.frameId = -1;
}

// HTMLMediaElement.HAVE_CURRENT_DATA — data for the current playback position is available.
const HAVE_CURRENT_DATA = 2;
