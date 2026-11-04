/**
 * A scalar easing function over the normalized unit interval.
 */
export type EasingFunction = (t: number) => number;

/**
 * A scalar remapping function over an arbitrary input domain.
 */
export type ScalarRemap = (x: number) => number;
