// Generated from crates/flight-velocity/src/velocity2d.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * A two-dimensional velocity value.
 */
export interface Velocity2D {
  x: number;
  y: number;
}

/**
 * Adds velocity contributions: `out = a + b`.
 */
export function addVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>): void {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  out.x = ax + bx;
  out.y = ay + by;
}

/**
 * Clamps velocity to `maxLength` (alias-safe: `out` may equal `velocity`).
 * The most common motion-blur safety helper -- prevents runaway blur lengths
 * on fast objects.
 */
export function clampVelocity(out: Velocity2D, velocity: Readonly<Velocity2D>, maxLength: number): void {
  const vx = velocity.x;
  const vy = velocity.y;
  const lenSq = vx * vx + vy * vy;
  const maxSq = maxLength * maxLength;
  if (lenSq > maxSq && lenSq > 0.0) {
    const scale = maxLength / Math.sqrt(lenSq);
    out.x = vx * scale;
    out.y = vy * scale;
  } else {
    out.x = vx;
    out.y = vy;
  }
}

/**
 * Clones a `Velocity2D` value (D23 value type: copy and clone).
 */
export function cloneVelocity2d(source: Readonly<Velocity2D>): Velocity2D {
  return { x: source.x, y: source.y };
}

/**
 * Copies one velocity value into another (alias-safe: out may equal source).
 */
export function copyVelocity(out: Velocity2D, source: Readonly<Velocity2D>): void {
  const sx = source.x;
  const sy = source.y;
  out.x = sx;
  out.y = sy;
}

/**
 * Exponential moving average (EMA) of velocity across frames. Useful for
 * jitter-free motion buffers. `factor` in (0, 1]: 1 = no smoothing (current
 * wins), 0.1 = heavy smoothing (previous dominates). Alias-safe: `out` may
 * equal `current` or `previous`.
 */
export function dampVelocity(
  out: Velocity2D,
  current: Readonly<Velocity2D>,
  previous: Readonly<Velocity2D>,
  factor: number,
): void {
  const cx = current.x;
  const cy = current.y;
  const px = previous.x;
  const py = previous.y;
  out.x = cx * factor + px * (1.0 - factor);
  out.y = cy * factor + py * (1.0 - factor);
}

/**
 * Returns true if the velocity vector's magnitude is within `epsilon` of zero.
 * Useful for skipping velocity-buffer writes on effectively-still objects.
 */
export function isVelocityZero(velocity: Readonly<Velocity2D>, epsilon?: number): boolean {
  epsilon = epsilon ?? 0.0;
  return Math.abs(velocity.x) <= epsilon && Math.abs(velocity.y) <= epsilon;
}

/**
 * Returns the magnitude (length) of the velocity vector.
 */
export function lengthOfVelocity(velocity: Readonly<Velocity2D>): number {
  return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
}

/**
 * Linearly interpolates between two velocity values. Alias-safe: `out` may
 * equal `a` or `b`.
 */
export function lerpVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>, t: number): void {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  out.x = ax + (bx - ax) * t;
  out.y = ay + (by - ay) * t;
}

/**
 * Normalizes the velocity vector to unit length. Returns the zero vector when
 * length is zero. Alias-safe: `out` may equal `source`.
 */
export function normalizeVelocity(out: Velocity2D, source: Readonly<Velocity2D>): void {
  const sx = source.x;
  const sy = source.y;
  const len = Math.sqrt(sx * sx + sy * sy);
  if (len > 0.0) {
    const inv = 1.0 / len;
    out.x = sx * inv;
    out.y = sy * inv;
  } else {
    out.x = 0.0;
    out.y = 0.0;
  }
}

/**
 * Scales a velocity by a scalar factor. Used for pixel-ratio conversion and
 * unit normalization. Alias-safe: `out` may equal `velocity`.
 */
export function scaleVelocity(out: Velocity2D, velocity: Readonly<Velocity2D>, scale: number): void {
  const vx = velocity.x;
  const vy = velocity.y;
  out.x = vx * scale;
  out.y = vy * scale;
}

/**
 * Subtracts `b` from `a`: `out = a - b`. Alias-safe.
 */
export function subtractVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>): void {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  out.x = ax - bx;
  out.y = ay - by;
}

/**
 * Sets both components to zero.
 */
export function zeroVelocity(out: Velocity2D): void {
  out.x = 0.0;
  out.y = 0.0;
}
