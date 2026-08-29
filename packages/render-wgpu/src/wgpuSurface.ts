import { createBitmap } from '@flighthq/bitmap/contract';
import type { Bitmap, WgpuRenderState } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Opt-in capture of the rendered frame to a CPU Bitmap. Two environment facts drive the design:
// (1) headless/software adapters never present the swapchain, and its texture reads back as zeros, so
// the frame is redirected into an offscreen COPY_SRC texture (acquireWgpuFrameCaptureTexture, used by
// renderWgpuBackground); (2) GPU work queued in a later task than the frame is dropped on these
// adapters, so submitWgpuRenderPass copies the capture texture into the retained capture buffer in the
// same frame (encodeWgpuFrameCapture), and createBitmapFromWgpuRenderState only maps that buffer.
//
// One buffer serves both sides, so they take turns: the writer skips its copy while the reader holds a
// map (or has one in flight), and resumes on the next frame. Without that turn-taking a continuously
// animating scene re-enqueues a copy every frame into the buffer a readback is waiting on — which the
// queue may not touch while it is mapped, and which pushes the pending map behind ever more GPU work.

// Returns the offscreen texture the frame should render into when capture is enabled, creating/resizing
// it to the canvas on demand, or null when capture is off (the caller then renders to the swapchain).
// Internal: called by renderWgpuBackground to redirect the frame so its pixels stay readable.
export function acquireWgpuFrameCaptureTexture(state: Readonly<WgpuRenderState>): GPUTexture | null {
  const runtime = getWgpuRenderStateRuntime(state);
  if (!runtime.frameCaptureEnabled) return null;

  const width = Math.max(1, state.surface.width);
  const height = Math.max(1, state.surface.height);
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

// Reads the most recently captured frame into a CPU Bitmap. Requires enableWgpuFrameCapture(state)
// before rendering and at least one submitWgpuRenderPass since (which fills the capture buffer);
// throws otherwise (calling it without enabling capture is API misuse). Only maps the retained buffer —
// no GPU work is queued here, since later-task GPU work is unreliable on the adapters this exists for.
// Allocates the returned Bitmap; the capture buffer is retained and reused across frames.
//
// `timeoutMs` bounds the buffer map (pass 0 to wait indefinitely, the pre-bound behaviour). The default
// is deliberately generous: a readback that takes seconds is a loaded machine, while one that never
// settles is the failure this bounds, and only the caller knows which budget it is working inside.
export async function createBitmapFromWgpuRenderState(
  state: Readonly<WgpuRenderState>,
  timeoutMs = DEFAULT_MAP_TIMEOUT_MS,
): Promise<Bitmap> {
  const runtime = getWgpuRenderStateRuntime(state);
  const buffer = runtime.frameCaptureBuffer;
  if (buffer === null || buffer === undefined) {
    throw new Error(
      'createBitmapFromWgpuRenderState requires enableWgpuFrameCapture(state) before rendering, then a submitWgpuRenderPass.',
    );
  }

  const width = runtime.frameCaptureWidth;
  const height = runtime.frameCaptureHeight;
  const bytesPerRow = runtime.frameCaptureBytesPerRow;

  await mapWgpuCaptureBuffer(buffer, timeoutMs);
  const mapped = new Uint8Array(buffer.getMappedRange());

  const bitmap = createBitmap(width, height);
  const out = bitmap.data;
  // The preferred canvas format is BGRA on most platforms and RGBA on software adapters; normalize to
  // the Bitmap's RGBA byte order so coverage/fingerprint and saved pixels read correctly either way.
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
  return bitmap;
}

// Enables opt-in frame capture on a render state so createBitmapFromWgpuRenderState can read it back.
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
  // The reader owns the buffer while it holds a map. One retained buffer serves both sides, and the
  // queue may not touch a buffer that is mapped or has a map in flight — so a frame encoded during a
  // readback both invalidates the copy and stacks more GPU work in front of the map it is waiting on.
  // Skipping the frame is the handshake: the reader is already taking a snapshot, and the next frame
  // resumes copying once it lets go.
  //
  // Deliberately written as "is it busy" rather than "is it not unmapped": an implementation without
  // `mapState` reports undefined, and the inverted test would then skip every copy for the whole run
  // and capture nothing. Unknown state falls through to the copy, which is the pre-existing behaviour.
  const mapState = runtime.frameCaptureBuffer?.mapState;
  if (mapState === 'pending' || mapState === 'mapped') return;

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

// Maps the retained capture buffer, giving up by name after `timeoutMs` (0 waits indefinitely).
// `mapAsync` carries no timeout and no reject path of its own: on the contended software adapters this
// capture path exists for, the promise can simply never settle, and an unbounded await is indistinguishable
// from a caller that stopped running. A late resolution after the deadline leaves the buffer mapped, which
// is why the timeout is a hard end for this capture and not something to retry against the same buffer.
async function mapWgpuCaptureBuffer(buffer: GPUBuffer, timeoutMs: number): Promise<void> {
  const mapping = buffer.mapAsync(GPUMapMode.READ);
  if (timeoutMs <= 0) return mapping;

  // The race abandons `mapping` on timeout; adopt its eventual rejection here so it is never unhandled.
  mapping.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`createBitmapFromWgpuRenderState: frame capture buffer did not map within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([mapping, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

// Generous by design: this bounds a driver that has stopped answering, not a slow one. Callers working
// inside a tighter budget (the capture harness) pass their own.
const DEFAULT_MAP_TIMEOUT_MS = 10_000;
