import type { Vector2 } from './Vector2';

// The KHR_texture_transform fields shared by every uv-carrying texture source — the still `Texture`
// and the dynamic `VideoTexture` alike. `uvOffset`/`uvScale` shift and tile the sampled coordinates
// and `uvRotation` (radians) spins them, applied scale → rotate → translate before sampling. This is
// the structural uv-carrier the uv-matrix helpers (`getTextureUvMatrix`, `hasTextureUvTransform`)
// accept, so a VideoTexture routes through the same uv-transform path a Texture does without a cast.
export interface TextureUvTransform {
  uvOffset: Vector2;
  uvRotation: number;
  uvScale: Vector2;
}
