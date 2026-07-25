// Block-compression families enabled on a WebGPU device. PVRTC is absent because WebGPU exposes no
// PVRTC texture formats; those assets require the decoder fallback.
export interface WgpuCompressedTextureSupport {
  astc: boolean;
  bc: boolean;
  etc2: boolean;
}
