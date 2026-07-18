import type { ImageResource } from '@flighthq/types';

// Raw texel-upload primitives. Each writes level 0 of the texture currently bound at `target` — the GL
// enum for a 2D texture (gl.TEXTURE_2D) or a cube face (gl.TEXTURE_CUBE_MAP_POSITIVE_X + face). They set
// no sampler or pixel-store state: premultiply, wrap, and filter are the caller's policy applied around
// the call, so one primitive serves both the premultiplied 2D sprite path and the raw-radiance cube path.
// The caller owns creating and binding the texture and choosing the target.

// Uploads raw CPU pixels (rgba8, straight from a Surface's `data`) through the ArrayBufferView overload.
// The portable bedrock upload — no web types in the signature — so a native GL/Vulkan backend reimplements
// it 1:1. `width`/`height` are the pixel dimensions the data fills.
export function uploadGlTextureData(
  gl: WebGL2RenderingContext,
  target: number,
  width: number,
  height: number,
  data: Readonly<Uint8ClampedArray<ArrayBuffer>>,
): void {
  gl.texImage2D(
    target,
    0,
    gl.RGBA,
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
export function uploadGlTextureElement(gl: WebGL2RenderingContext, target: number, source: TexImageSource): void {
  gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

// Dispatches an ImageResource to whichever representation it carries: the element fast-path when a decoded
// `source` is present, else the portable `data` path (a generated Surface). The seam that makes data-backed
// resources first-class — the same texture uploads whether it was loaded (element) or generated in memory
// (data). Assumes the resource has pixels in at least one form.
export function uploadGlTextureImageResource(
  gl: WebGL2RenderingContext,
  target: number,
  image: Readonly<ImageResource>,
): void {
  if (image.source !== null) uploadGlTextureElement(gl, target, image.source as TexImageSource);
  else uploadGlTextureData(gl, target, image.width, image.height, image.data!);
}
