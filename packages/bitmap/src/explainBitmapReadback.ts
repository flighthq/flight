import type { BitmapReadbackBlockReason, BitmapReadbackExplanation } from '@flighthq/types/contract';

// Recomputes why createBitmapFromImageSource would or would not return a Bitmap for these arguments,
// as plain data. Pure: it allocates a scratch canvas and reads one pixel to settle taint, mutates
// nothing the caller owns, never throws, and retains no reference to `source`. Import it to find out
// why a capture came back null; it sheds from production when unimported.
//
// Reasons are root-cause prioritized rather than following the constructor's literal check order: an
// empty capture and a missing DOM are properties of the call and the host, knowable without touching
// the source at all, so they are reported before anything is drawn. `tainted-source` is last because
// it is the only one that requires actually attempting the read.
//
// This is the pull half of the diagnostics convention, and it duplicates the constructor's failure
// conditions by design — the maintenance seam is that a new way for the readback to fail must gain a
// matching branch here or this query silently goes stale.
export function explainBitmapReadback(
  source: CanvasImageSource,
  width: number,
  height: number,
): BitmapReadbackExplanation {
  const reason = _blockReason(source, width, height);
  return { readable: reason === 'ok', reason };
}

function _blockReason(source: CanvasImageSource, width: number, height: number): BitmapReadbackBlockReason {
  if (width <= 0 || height <= 0) return 'empty-size';
  if (typeof document === 'undefined') return 'no-canvas';
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return 'no-canvas';
  try {
    // One pixel is enough: taint is a property of the canvas after the draw, not of how much was read.
    ctx.drawImage(source, 0, 0);
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    return 'tainted-source';
  }
  return 'ok';
}
