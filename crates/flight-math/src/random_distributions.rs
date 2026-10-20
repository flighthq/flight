use crate::RandomSource;
use crate::next_random;

/// Pick a random element from `items`, returning `None` for an empty slice.
///
/// Does not mutate `items`. Deterministic: same random sequence -> same picks.
pub fn pick<T: Clone>(random: &mut RandomSource, items: &[T]) -> Option<T> {
    if items.is_empty() {
        return None;
    }
    let index = (next_random(random) * items.len() as f32).floor() as usize;
    return Some(items[index].clone());
}

/// Return an exponentially-distributed random number with the given `rate`
/// (lambda > 0, mean = 1/lambda).
///
/// Uses the inverse CDF method: `-ln(U) / rate` where U is uniform on (0, 1].
/// The result is always non-negative. Panics if `rate` is not finite or not
/// positive.
pub fn random_exponential(random: &mut RandomSource, rate: f32) -> f32 {
    if !rate.is_finite() || rate <= 0.0 {
        panic!("random_exponential: rate must be finite and > 0");
    }
    let u = next_random(random);
    let safe_u = if u == 0.0 { f32::EPSILON } else { u };
    return -safe_u.ln() / rate;
}

/// Return a normally-distributed random number with the given `mean` and
/// `standard_deviation`, using the Box-Muller transform.
///
/// Each call consumes two values from `random` and discards one.
pub fn random_gaussian(random: &mut RandomSource, mean: f32, standard_deviation: f32) -> f32 {
    let u1 = next_random(random);
    let u2 = next_random(random);
    let safe_u1 = if u1 == 0.0 { f32::EPSILON } else { u1 };
    let z = (-2.0 * safe_u1.ln()).sqrt() * (std::f32::consts::PI * 2.0 * u2).cos();
    return mean + z * standard_deviation;
}

/// Return two independent normally-distributed random numbers as `(z0, z1)`
/// sharing the same Box-Muller pair.
///
/// Prefer this over calling `random_gaussian` twice when both samples are
/// needed — it consumes exactly 2 values from `random` instead of 4.
pub fn random_gaussian_pair(
    random: &mut RandomSource,
    mean: f32,
    standard_deviation: f32,
) -> (f32, f32) {
    let u1 = next_random(random);
    let u2 = next_random(random);
    let safe_u1 = if u1 == 0.0 { f32::EPSILON } else { u1 };
    let mag = (-2.0 * safe_u1.ln()).sqrt();
    let angle = std::f32::consts::PI * 2.0 * u2;
    let z0 = mean + mag * angle.cos() * standard_deviation;
    let z1 = mean + mag * angle.sin() * standard_deviation;
    return (z0, z1);
}

/// Sample a uniformly-distributed point inside the unit disc (including the
/// boundary) and write it into `out[0]` / `out[1]`.
///
/// Uses rejection sampling to avoid the over-dense centre that polar-radius
/// sampling without a square-root correction produces.
pub fn random_inside_unit_disc(random: &mut RandomSource, out: &mut [f32; 2]) {
    loop {
        let x = next_random(random) * 2.0 - 1.0;
        let y = next_random(random) * 2.0 - 1.0;
        if x * x + y * y <= 1.0 {
            out[0] = x;
            out[1] = y;
            return;
        }
    }
}

/// Sample a uniformly-distributed point inside the unit sphere (radius <= 1)
/// and write it into `out[0]` / `out[1]` / `out[2]`.
///
/// Uses 3D box rejection sampling.
pub fn random_inside_unit_sphere(random: &mut RandomSource, out: &mut [f32; 3]) {
    loop {
        let x = next_random(random) * 2.0 - 1.0;
        let y = next_random(random) * 2.0 - 1.0;
        let z = next_random(random) * 2.0 - 1.0;
        if x * x + y * y + z * z <= 1.0 {
            out[0] = x;
            out[1] = y;
            out[2] = z;
            return;
        }
    }
}

/// Sample a uniformly-distributed point on the unit circle and write it into
/// `out[0]` / `out[1]`. The result has unit length.
pub fn random_on_unit_circle(random: &mut RandomSource, out: &mut [f32; 2]) {
    let angle = next_random(random) * std::f32::consts::PI * 2.0;
    let x = angle.cos();
    let y = angle.sin();
    out[0] = x;
    out[1] = y;
}

/// Sample a uniformly-distributed point on the surface of the unit sphere
/// and write it into `out[0]` / `out[1]` / `out[2]`.
///
/// Uses the Marsaglia (1972) method.
pub fn random_on_unit_sphere(random: &mut RandomSource, out: &mut [f32; 3]) {
    let mut x: f32;
    let mut y: f32;
    let mut s: f32;
    loop {
        x = next_random(random) * 2.0 - 1.0;
        y = next_random(random) * 2.0 - 1.0;
        s = x * x + y * y;
        if s < 1.0 {
            break;
        }
    }
    let f = 2.0 * (1.0 - s).sqrt();
    let rx = x * f;
    let ry = y * f;
    let rz = 1.0 - 2.0 * s;
    out[0] = rx;
    out[1] = ry;
    out[2] = rz;
}

/// Return a Poisson-distributed random integer with mean `lambda` (lambda > 0).
///
/// Uses Knuth's multiplicative algorithm. Accurate and simple for small
/// lambda (lambda <= ~30). Panics if `lambda` is not finite or not positive.
pub fn random_poisson(random: &mut RandomSource, lambda: f32) -> i32 {
    if !lambda.is_finite() || lambda <= 0.0 {
        panic!("random_poisson: lambda must be finite and > 0");
    }
    let limit = (-lambda).exp();
    let mut k = 0_i32;
    let mut product = next_random(random);
    while product > limit {
        k += 1;
        product *= next_random(random);
    }
    return k;
}

/// Return a random index from a weight array, selected proportionally to
/// each weight. Weights do not need to sum to 1.
///
/// Returns `-1` for an empty or all-zero weight array.
pub fn random_weighted(random: &mut RandomSource, weights: &[f32]) -> i32 {
    let mut total = 0.0_f32;
    let mut i = 0;
    while i < weights.len() {
        total += weights[i];
        i += 1;
    }
    if total <= 0.0 {
        return -1;
    }
    let mut r = next_random(random) * total;
    let mut i = 0;
    while i < weights.len() {
        r -= weights[i];
        if r <= 0.0 {
            return i as i32;
        }
        i += 1;
    }
    return (weights.len() - 1) as i32;
}

/// Return a new Vec with the elements of `items` shuffled in a random order
/// (Fisher-Yates / Knuth shuffle). Allocates a copy; does not mutate `items`.
pub fn shuffle<T: Clone>(random: &mut RandomSource, items: &[T]) -> Vec<T> {
    let mut copy = items.to_vec();
    shuffle_in_place(random, &mut copy);
    return copy;
}

/// Shuffle `items` in place using the Fisher-Yates algorithm.
///
/// Mutates `items`. Deterministic: same random state -> same shuffled order.
pub fn shuffle_in_place<T>(random: &mut RandomSource, items: &mut [T]) {
    let len = items.len();
    if len <= 1 {
        return;
    }
    let mut i = len - 1;
    while i > 0 {
        let j = (next_random(random) * (i + 1) as f32).floor() as usize;
        items.swap(i, j);
        i -= 1;
    }
}
