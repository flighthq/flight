import { createBitmap } from '@flighthq/bitmap/contract';
import type { Bitmap, WgpuScreenRenderTarget } from '@flighthq/types/contract';

// Opt-in capture of a screen target's frame to a CPU Bitmap. Two environment facts drive the design:
// (1) headless/software adapters never present the swap chain, and its texture reads back as zeros, so
// the frame is redirected into an offscreen COPY_SRC texture the screen target owns; (2) GPU work queued
// in a later task than the frame is dropped on these adapters, so the frame's own submit copies that
// texture into the retained capture buffer, and the readback below only maps the buffer.
//
// One buffer serves both sides, so they take turns: the writer skips its copy while the reader holds a
// map (or has one in flight), and resumes on the next frame. Without that turn-taking a continuously
// animating scene re-enqueues a copy every frame into the buffer a readback is waiting on — which the
// queue may not touch while it is mapped, and which pushes the pending map behind ever more GPU work.

export async function createBitmapFromWgpuScreenRenderTarget(
  target: Readonly<WgpuScreenRenderTarget>,
  timeoutMs = DEFAULT_MAP_TIMEOUT_MS,
): Promise<Bitmap> {
  const buffer = target.captureBuffer;
  if (buffer === null) {
    throw new Error(
      'createBitmapFromWgpuScreenRenderTarget requires enableWgpuScreenRenderTargetCapture(target) before rendering, then a submitted frame.',
    );
  }

  const width = target.captureWidth;
  const height = target.captureHeight;
  const bytesPerRow = target.captureBytesPerRow;

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
  const swizzleBGRA = target.format === 'bgra8unorm' || target.format === 'bgra8unorm-srgb';
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

// Enables opt-in capture on a screen target so createBitmapFromWgpuScreenRenderTarget can read it back.
// The frame is then drawn into an offscreen texture instead of the swap chain (the only reliably readable
// path on headless/software adapters); the canvas is not presented while capture is on. Leave it off for
// normal on-screen rendering. The capture texture and buffer are allocated lazily.
export function enableWgpuScreenRenderTargetCapture(target: WgpuScreenRenderTarget): void {
  target.captureEnabled = true;
}

// Encodes the capture-texture → capture-buffer copy into the frame's command encoder, sizing and
// reallocating the retained buffer to the surface on demand. No-op unless capture is enabled. Internal:
// called by submitWgpuFrame so the copy is queued in the render frame, not a later (dropped) task.
export function encodeWgpuScreenRenderTargetCapture(target: WgpuScreenRenderTarget, encoder: GPUCommandEncoder): void {
  const texture = target.captureTexture;
  if (!target.captureEnabled || texture === null) return;
  // The reader owns the buffer while it holds a map. One retained buffer serves both sides, and the
  // queue may not touch a buffer that is mapped or has a map in flight — so a frame encoded during a
  // readback both invalidates the copy and stacks more GPU work in front of the map it is waiting on.
  // Skipping the frame is the handshake: the reader is already taking a snapshot, and the next frame
  // resumes copying once it lets go.
  //
  // Deliberately written as "is it busy" rather than "is it not unmapped": an implementation without
  // `mapState` reports undefined, and the inverted test would then skip every copy for the whole run
  // and capture nothing. Unknown state falls through to the copy, which is the pre-existing behaviour.
  const mapState = target.captureBuffer?.mapState;
  if (mapState === 'pending' || mapState === 'mapped') return;

  const width = texture.width;
  const height = texture.height;
  // Wgpu requires copyTextureToBuffer rows to be 256-byte aligned; the buffer is padded per row.
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;

  if (target.captureBuffer === null || target.captureWidth !== width || target.captureHeight !== height) {
    target.captureBuffer?.destroy();
    target.captureBuffer = target.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    target.captureBytesPerRow = bytesPerRow;
    target.captureWidth = width;
    target.captureHeight = height;
  }

  encoder.copyTextureToBuffer({ texture }, { buffer: target.captureBuffer, bytesPerRow }, [width, height, 1]);
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
      reject(new Error(`createBitmapFromWgpuScreenRenderTarget: capture buffer did not map within ${timeoutMs}ms`));
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
