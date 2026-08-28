import type { GlContext, Image } from '@flighthq/types/contract';

// Raw texel-upload primitives. Each writes level 0 of the texture currently bound at `target` — the GL
// enum for a 2D texture (gl.TEXTURE_2D) or a cube face (gl.TEXTURE_CUBE_MAP_POSITIVE_X + face). They set
// no sampler or pixel-store state: premultiply, wrap, and filter are the caller's policy applied around
// the call, so one primitive serves both the premultiplied 2D sprite path and the raw-radiance cube path.
// The caller owns creating and binding the texture and choosing the target.

// Uploads raw CPU pixels (rgba8, straight from a Bitmap's `data`) through the ArrayBufferView overload.
// The portable bedrock upload — no web types in the signature — so a native GL/Vulkan backend reimplements
// it 1:1. `width`/`height` are the pixel dimensions the data fills.
export function uploadGlTextureData(
  gl: GlContext,
  target: number,
  width: number,
  height: number,
  data: Readonly<Uint8ClampedArray<ArrayBuffer>>,
  internalFormat: number = gl.RGBA,
): void {
  gl.texImage2D(
    target,
    0,
    internalFormat,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data as Uint8ClampedArray<ArrayBuffer>,
  );
}

// Uploads a decoded DOM element (image, canvas, ImageBitmap, VideoFrame) through the TexImageSource
// overload — the web fast-path, a zero-CPU-copy GPU DMA. Absent on non-web hosts, which carry only `data`.
export function uploadGlTextureElement(
  gl: GlContext,
  target: number,
  source: TexImageSource,
  internalFormat: number = gl.RGBA,
): void {
  gl.texImage2D(target, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

// Uploads a host-backed Image through the decoded-element fast path.
export function uploadGlTextureImageResource(
  gl: GlContext,
  target: number,
  image: Readonly<Image>,
  internalFormat: number = gl.RGBA,
): void {
  uploadGlTextureElement(gl, target, image.source as TexImageSource, internalFormat);
}
