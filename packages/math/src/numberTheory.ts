/** Return the factorial of non-negative integer `n`.
 *
 *  `factorial(0)` → `1` by convention. Throws for negative inputs or
 *  non-integer inputs (programmer error). Returns `Infinity` for `n > 170`
 *  (above IEEE 754 double precision range).
 */
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('factorial: n must be a non-negative integer');
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** Return the greatest common divisor of `a` and `b` (Euclidean algorithm).
 *
 *  Operates on the absolute values of the inputs, so negative arguments are
 *  accepted. Throws when both `a` and `b` are `0` (programmer error — the GCD
 *  of zero and zero is undefined).
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  if (a === 0 && b === 0) throw new RangeError('gcd: both arguments must not be 0');
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** Return the squared distance `x² + y²`.
 *
 *  Allocation-free substitute for `Math.hypot(x, y) ** 2` when you only need
 *  to compare distances. Prefer `hypot2` over `Math.hypot` in hot loops where
 *  the actual distance value is not needed.
 */
export function hypot2(x: number, y: number): number {
  return x * x + y * y;
}

/** Return `true` if `n` is even. */
export function isEven(n: number): boolean {
  return (n & 1) === 0;
}

/** Return `true` if `n` is odd. */
export function isOdd(n: number): boolean {
  return (n & 1) === 1;
}

/** Return the least common multiple of `a` and `b`.
 *
 *  Operates on the absolute values of the inputs. Throws when both `a` and
 *  `b` are `0` (see `gcd`). For very large inputs, the result may exceed
 *  `Number.MAX_SAFE_INTEGER` and lose precision.
 */
export function lcm(a: number, b: number): number {
  const g = gcd(a, b);
  return (Math.abs(Math.trunc(a)) / g) * Math.abs(Math.trunc(b));
}
