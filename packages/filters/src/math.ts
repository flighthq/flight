/**
 * Converts sigma to the box-blur radius whose repeated application (`passes`
 * times) has the same variance as a Gaussian with standard deviation `sigma`.
 */
export function boxRadiusForSigma(sigma: number, passes: number): number {
  if (sigma <= 0) return 0;
  return Math.max(0, Math.round((-1 + Math.sqrt(1 + (12 * sigma * sigma) / passes)) / 2));
}
