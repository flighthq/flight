import { createSurface } from '@flighthq/surface';
import type { Surface, WgpuRenderState } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Opt-in capture of the rendered frame to a CPU Surface. Two environment facts drive the design:
// (1) headless/software adapters never present the swapchain, and its texture reads back as zeros, so
// the frame is redirected into an offscreen COPY_SRC texture (acquireWgpuFrameCaptureTexture, used by
// renderWgpuBackground); (2) GPU work queued in a later task than the frame is dropped on these
// adapters, so submitWgpuRenderPass copies the capture texture into the retained capture buffer in the
// same frame (encodeWgpuFrameCapture), and createSurfaceFromWgpuRenderState only maps that buffer.

// Returns the offscreen texture the frame should render into when capture is enabled, creating/resizing
// it to the canvas on demand, or null when capture is off (the caller then renders to the swapchain).
// Internal: called by renderWgpuBackground to redirect the frame so its pixels stay readable.
export function acquireWgpuFrameCaptureTexture(state: Readonly<WgpuRenderState>): GPUTexture | null {
  const runtime = getWgpuRenderStateRuntime(state);
  if (!runtime.frameCaptureEnabled) return null;

  const width = Math.max(1, state.canvas.width);
  const height = Math.max(1, state.canvas.height);
  const existing = runtime.frameCaptureTexture;
  if (existing !== null && existing !== undefined && existing.width === width && existing.height === height) {
    return existing;
  }

  existing?.destroy();
  const texture = state.device.createTexture({
    size: [width, height, 1],
    format: state.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  runtime.frameCaptureTexture = texture;
  return texture;
}

// Reads the most recently captured frame into a CPU Surface. Requires enableWgpuFrameCapture(state)
// before rendering and at least one submitWgpuRenderPass since (which fills the capture buffer);
// throws otherwise (calling it without enabling capture is API misuse). Only maps the retained buffer —
// no GPU work is queued here, since later-task GPU work is unreliable on the adapters this exists for.
// Allocates the returned Surface; the capture buffer is retained and reused across frames.
export async function createSurfaceFromWgpuRenderState(state: Readonly<WgpuRenderState>): Promise<Surface> {
  const runtime = getWgpuRenderStateRuntime(state);
  const buffer = runtime.frameCaptureBuffer;
  if (buffer === null || buffer === undefined) {
    throw new Error(
      'createSurfaceFromWgpuRenderState requires enableWgpuFrameCapture(state) before rendering, then a submitWgpuRenderPass.',
    );
  }

  const width = runtime.frameCaptureWidth;
  const height = runtime.frameCaptureHeight;
  const bytesPerRow = runtime.frameCaptureBytesPerRow;

  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());

  const surface = createSurface(width, height);
  const out = surface.data;
  // The preferred canvas format is BGRA on most platforms and RGBA on software adapters; normalize to
  // the Surface's RGBA byte order so coverage/fingerprint and saved pixels read correctly either way.
  // Pixels are left premultiplied (the texture's stored form): functional content renders over an opaque
  // background, so alpha is 255 and premultiplied == straight; do NOT un-premultiply here — dividing RGB
  // by an 8-bit alpha amplifies quantization and clamps, blowing out exactly the semi-transparent pixels
  // a colour comparison cares about. If straight-alpha output is ever needed, convert at the consumer in
  // higher precision, or compare in premultiplied space on both sides.
  const swizzleBGRA = state.format === 'bgra8unorm' || state.format === 'bgra8unorm-srgb';
  for (let y = 0; y < height; y++) {
    const srcRow = y * bytesPerRow;
    const dstRow = y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      out[d] = swizzleBGRA ? mapped[s + 2] : mapped[s];
      out[d + 1] = mapped[s + 1];
      out[d + 2] = swizzleBGRA ? mapped[s] : mapped[s + 2];
      out[d + 3] = mapped[s + 3];
    }
  }

  // Unmap (not destroy) so the next frame's submit can copy into the retained buffer again.
  buffer.unmap();
  return surface;
}

// Enables opt-in frame capture on a render state so createSurfaceFromWgpuRenderState can read it back.
// The frame is then drawn into an offscreen texture instead of the swapchain (the only reliably
// readable path on headless/software adapters); the canvas is not presented while capture is on. Leave
// it off for normal on-screen rendering. The capture texture and buffer are allocated lazily.
export function enableWgpuFrameCapture(state: Readonly<WgpuRenderState>): void {
  getWgpuRenderStateRuntime(state).frameCaptureEnabled = true;
}

// Encodes the capture-texture → capture-buffer copy into the frame's command encoder, sizing/reallocating
// the retained buffer to the canvas on demand. No-op unless capture is enabled. Internal: called by
// submitWgpuRenderPass so the copy is queued in the render frame, not a later (dropped) task.
export function encodeWgpuFrameCapture(state: Readonly<WgpuRenderState>, encoder: GPUCommandEncoder): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const texture = runtime.frameCaptureTexture;
  if (!runtime.frameCaptureEnabled || texture === null || texture === undefined) return;

  const width = texture.width;
  const height = texture.height;
  // Wgpu requires copyTextureToBuffer rows to be 256-byte aligned; the buffer is padded per row.
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;

  if (
    runtime.frameCaptureBuffer === null ||
    runtime.frameCaptureBuffer === undefined ||
    runtime.frameCaptureWidth !== width ||
    runtime.frameCaptureHeight !== height
  ) {
    runtime.frameCaptureBuffer?.destroy();
    runtime.frameCaptureBuffer = state.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    runtime.frameCaptureBytesPerRow = bytesPerRow;
    runtime.frameCaptureWidth = width;
    runtime.frameCaptureHeight = height;
  }

  encoder.copyTextureToBuffer({ texture }, { buffer: runtime.frameCaptureBuffer, bytesPerRow }, [width, height, 1]);
}
