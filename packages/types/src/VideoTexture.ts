import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Sampler } from './Sampler';
import type { TextureColorSpace } from './Texture';
import type { Vector2 } from './Vector2';
import type { VideoResource } from './VideoResource';

// A dynamic, per-frame texture source backed by a decoding video stream. Where a Texture binds a
// settled ImageResource, a VideoTexture binds a VideoResource (an HTMLVideoElement carrier) whose
// pixels change every frame, so it carries the same sampling/color-space/uv-transform state a
// material reads but adds a `frameId` revision the GPU uploader watches. A backend uploads the
// element's current frame only when `frameId` advances, so a paused or stalled video costs no
// re-upload; `advanceVideoTexture` bumps `frameId` when the element reports a fresh decoded frame.
//
// `colorSpace` defaults to 'srgb' (a video is display-referred color, like an albedo map). The
// uv-transform fields are the KHR_texture_transform model, identical to Texture, so a VideoTexture
// drops into the same material texture slot and the same 2D bitmap-fill path a Texture does.
export interface VideoTexture extends Entity {
  colorSpace: TextureColorSpace;
  // Monotonic revision of the currently-decoded frame. A GPU uploader stores the last id it uploaded
  // and re-uploads only when this differs, so a static frame uploads once. Starts at -1 (no frame
  // uploaded yet); `advanceVideoTexture` sets it to the element's decoded-frame counter.
  frameId: number;
  sampler: Sampler;
  source: VideoResource;
  uvOffset: Vector2;
  uvRotation: number;
  uvScale: Vector2;
}

export type VideoTextureLike = EntityWithoutRuntime<VideoTexture>;
