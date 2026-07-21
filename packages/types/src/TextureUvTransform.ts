import type { Vector2 } from './Vector2';

// The KHR_texture_transform fields shared by every uv-carrying texture source — the still `Texture`
// and the dynamic `VideoTexture` alike. `uvOffset`/`uvScale` shift and tile the sampled coordinates
// and `uvRotation` (radians) spins them, applied scale → rotate → translate before sampling. This is
// the structural uv-carrier the uv-matrix helpers (`getTextureUvMatrix`, `hasTextureUvTransform`)
// accept, so a VideoTexture routes through the same uv-transform path a Texture does without a cast.
//
// `flipX`/`flipY` mirror the sampled coordinate on that axis (`u → 1 - u`, `v → 1 - v`), applied
// *before* scale/rotate/translate. This is a sampler-space flip — free on every backend (it folds
// into the uv matrix, no pixel copy and no per-backend upload flag), and the right layer for the
// common "the image or render-target reads upside-down" case rather than flipping geometry uvs.
export interface TextureUvTransform {
  flipX: boolean;
  flipY: boolean;
  uvOffset: Vector2;
  uvRotation: number;
  uvScale: Vector2;
}
