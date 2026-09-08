/** Fixed duration used for synthetic requestAnimationFrame timestamps in capture mode. */
export const CAPTURE_FRAME_DURATION_MS = 1000 / 60;

/** Returns the deterministic timestamp assigned to a zero-based presented frame. */
export function getCaptureFrameTimestamp(frameIndex: number): number {
  if (!Number.isFinite(frameIndex) || frameIndex < 0) return 0;
  return Math.floor(frameIndex) * CAPTURE_FRAME_DURATION_MS;
}
