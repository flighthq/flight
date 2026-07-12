import type { ColorLut } from './ColorLut';

// GPU-upload memo for the fused color LUT on WebGPU: the uploaded `size³` 3D texture, the axis `size` it
// was created at (the texture is recreated when size changes), and the ColorLut reference last written
// into it (all null/0 before the first upload). applyColorLutPassToWgpu re-uploads only when the incoming
// lut differs by identity from `lut` — the bake cache returns a stable reference for an unchanged run, so
// a static grade uploads once. `texture` is a GPU resource; destroy it on pipeline teardown.
export interface WgpuColorLutTextureCache {
  texture: GPUTexture | null;
  size: number;
  lut: ColorLut | null;
}
