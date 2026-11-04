/**
 * Ease-in-out sine: sinusoidal acceleration and deceleration.
 */
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1.0) / 2.0;
}

/**
 * Ease-in sine: sinusoidal slow start.
 */
export function easeInSine(t: number): number {
  return 1.0 - Math.cos((t * Math.PI) / 2.0);
}

/**
 * Ease-out sine: sinusoidal fast start.
 */
export function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2.0);
}
