/**
 * Controls what happens when a gradient coordinate falls outside the defined
 * stop range (the span from the first stop to the last stop).
 *
 * - `'pad'`: extends the first or last stop color to the boundary.
 * - `'repeat'`: tiles the gradient pattern (wraps).
 * - `'reflect'`: alternately mirrors the gradient pattern.
 */
export type GradientSpread = 'pad' | 'reflect' | 'repeat';
