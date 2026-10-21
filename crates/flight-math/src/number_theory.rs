/// Return the factorial of non-negative integer `n`.
///
/// `factorial(0)` -> `1` by convention. Panics for negative inputs.
/// Returns `f64::INFINITY` for `n > 170` (above IEEE 754 double precision range).
// flight-lint: allow(f64) factorials through 170 need double range; f32 overflows at 35!
pub fn factorial(n: i32) -> f64 {
    if n < 0 {
        panic!("factorial: n must be a non-negative integer");
    }
    if n <= 1 {
        return 1.0;
    }
    let mut result = 1.0_f64;
    let mut i = 2;
    while i <= n {
        result *= i as f64;
        i += 1;
    }
    return result;
}

/// Return the greatest common divisor of `a` and `b` (Euclidean algorithm).
///
/// Operates on the absolute values of the inputs, so negative arguments are
/// accepted. Panics when both `a` and `b` are `0` (the GCD of zero and zero
/// is undefined).
pub fn gcd(a: i32, b: i32) -> i32 {
    let mut a = a.abs();
    let mut b = b.abs();
    if a == 0 && b == 0 {
        panic!("gcd: both arguments must not be 0");
    }
    while b != 0 {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/// Return the squared distance `x^2 + y^2`.
///
/// Allocation-free substitute for `hypot(x, y).powi(2)` when you only need
/// to compare distances.
pub fn hypot2(x: f32, y: f32) -> f32 {
    return x * x + y * y;
}

/// Return `true` if `n` is even.
pub fn is_even(n: i32) -> bool {
    return (n & 1) == 0;
}

/// Return `true` if `n` is odd.
pub fn is_odd(n: i32) -> bool {
    return (n & 1) == 1;
}

/// Return the least common multiple of `a` and `b`.
///
/// Operates on the absolute values of the inputs. Panics when both `a` and
/// `b` are `0` (see `gcd`).
pub fn lcm(a: i32, b: i32) -> i32 {
    let g = gcd(a, b);
    return (a.abs() / g) * b.abs();
}
