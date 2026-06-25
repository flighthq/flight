/**
 * Maps Flash's quality field (integer 1–15) to a number of box-blur passes.
 * Flash uses quality to control how many times the blur kernel is applied:
 *   quality 1    → 1 pass  (fast, blocky)
 *   quality 2–8  → 2 passes (typical)
 *   quality 9–15 → 3 passes (smooth)
 * The input is clamped to [1, 15] before mapping.
 */
export function getBlurPassCountForQuality(quality: number): number {
  const q = Math.max(1, Math.min(15, quality));
  if (q === 1) return 1;
  if (q <= 8) return 2;
  return 3;
}
