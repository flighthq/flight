import type { ColorLut } from './ColorLut';

// GPU-upload memo for the fused color LUT on WebGL 2: the uploaded `size³` 3D texture and the ColorLut
// reference last written into it (both null before the first upload). applyColorLutPassToGl re-uploads
// only when the incoming lut differs by identity from `lut` — the bake cache returns a stable reference
// for an unchanged run, so a static grade uploads once. `texture` is a GPU resource; destroy it on
// pipeline teardown.
export interface GlColorLutTextureCache {
  texture: WebGLTexture | null;
  lut: ColorLut | null;
}
