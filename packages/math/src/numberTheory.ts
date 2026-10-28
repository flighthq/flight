// Generated from crates/flight-math/src/number_theory.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Return the factorial of non-negative integer `n`.
 *
 * `factorial(0)` -> `1` by convention. Throws for negative inputs.
 * Returns positive infinity for `n > 170` (above the IEEE 754 double-precision range).
 */
export function factorial(n: number): number {
  if (n < 0) {
    throw new RangeError('factorial: n must be a non-negative integer');
  }
  if (n <= 1) {
    return 1.0;
  }
  let result = 1.0;
  let i = 2;
  while (i <= n) {
    result *= i;
    i += 1;
  }
  return result;
}

/**
 * Return the greatest common divisor of `a` and `b` (Euclidean algorithm).
 *
 * Operates on the absolute values of the inputs, so negative arguments are
 * accepted. Throws when both `a` and `b` are `0` (the GCD of zero and zero
 * is undefined).
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  if (a === 0 && b === 0) {
    throw new RangeError('gcd: both arguments must not be 0');
  }
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Return the squared distance `x^2 + y^2`.
 *
 * Allocation-free substitute for squaring `hypot(x, y)` when you only need
 * to compare distances.
 */
export function hypot2(x: number, y: number): number {
  return x * x + y * y;
}

/**
 * Return `true` if `n` is even.
 */
export function isEven(n: number): boolean {
  return (n & 1) === 0;
}

/**
 * Return `true` if `n` is odd.
 */
export function isOdd(n: number): boolean {
  return (n & 1) === 1;
}

/**
 * Return the least common multiple of `a` and `b`.
 *
 * Operates on the absolute values of the inputs. Throws when both `a` and
 * `b` are `0` (see `gcd`).
 */
export function lcm(a: number, b: number): number {
  const g = gcd(a, b);
  return (Math.abs(a) / g) * Math.abs(b);
}
