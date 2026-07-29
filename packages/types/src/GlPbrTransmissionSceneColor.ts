// Caller-owned, resolved opaque-scene color sampled by GL transmission. The render target and its
// mip chain remain owned by the caller; scene-gl only retains this non-owning view.
export interface GlPbrTransmissionSceneColor {
  height: number;
  mipLevelCount: number;
  texture: WebGLTexture;
  width: number;
}
