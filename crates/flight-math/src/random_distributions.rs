use flight_entity::throw_range_error;

// TypeScript Number.EPSILON is exactly 2^-52, also representable in f32.
const ZERO_SAMPLE_EPSILON: f32 = 1.0 / 4_503_599_627_370_496.0;

/// Pick a random element from `items`, returning `None` for an empty slice.
///
/// Does not mutate `items`. Deterministic: same random sequence -> same picks.
pub fn pick<T: Clone>(random: &dyn Fn() -> f32, items: &[T]) -> Option<T> {
    if items.is_empty() {
        return None;
    }
    let index = (random() * items.len() as f32).floor() as usize;
    return Some(items[index].clone());
}

/// Return an exponentially-distributed random number with the given `rate`
/// (lambda > 0, mean = 1/lambda).
///
/// Uses the inverse CDF method: `-ln(U) / rate` where U is uniform on (0, 1].
/// The result is always non-negative. Panics if `rate` is not finite or not
/// positive.
pub fn random_exponential(random: &dyn Fn() -> f32, rate: Option<f32>) -> f32 {
    let rate = rate.unwrap_or(1.0);
    if !rate.is_finite() || rate <= 0.0 {
        throw_range_error("randomExponential: rate must be finite and > 0");
    }
    let u = random();
    let safe_u = if u == 0.0 { ZERO_SAMPLE_EPSILON } else { u };
    return -safe_u.ln() / rate;
}

/// Return a normally-distributed random number with the given `mean` and
/// `standard_deviation`, using the Box-Muller transform.
///
/// Each call consumes two values from `random` and discards one.
// flight-lint: allow(f64) retain TS quarter-turn accuracy before narrowing the Box-Muller cosine to f32
pub fn random_gaussian(
    random: &dyn Fn() -> f32,
    mean: Option<f32>,
    standard_deviation: Option<f32>,
) -> f32 {
    let mean = mean.unwrap_or(0.0);
    let standard_deviation = standard_deviation.unwrap_or(1.0);
    let u1 = random();
    let u2 = random();
    let safe_u1 = if u1 == 0.0 { ZERO_SAMPLE_EPSILON } else { u1 };
    let angle = std::f64::consts::TAU * u2 as f64;
    let z = (-2.0 * safe_u1.ln()).sqrt() * angle.cos() as f32;
    return mean + z * standard_deviation;
}

/// Return two independent normally-distributed random numbers as `(z0, z1)`
/// sharing the same Box-Muller pair.
///
/// Prefer this over calling `random_gaussian` twice when both samples are
/// needed — it consumes exactly 2 values from `random` instead of 4.
// flight-lint: allow(f64) retain TS quarter-turn accuracy before narrowing Box-Muller trigonometric values to f32
pub fn random_gaussian_pair(
    random: &dyn Fn() -> f32,
    mean: Option<f32>,
    standard_deviation: Option<f32>,
) -> (f32, f32) {
    let mean = mean.unwrap_or(0.0);
    let standard_deviation = standard_deviation.unwrap_or(1.0);
    let u1 = random();
    let u2 = random();
    let safe_u1 = if u1 == 0.0 { ZERO_SAMPLE_EPSILON } else { u1 };
    let mag = (-2.0 * safe_u1.ln()).sqrt();
    let angle = std::f64::consts::TAU * u2 as f64;
    let z0 = mean + mag * angle.cos() as f32 * standard_deviation;
    let z1 = mean + mag * angle.sin() as f32 * standard_deviation;
    return (z0, z1);
}

/// Sample a uniformly-distributed point inside the unit disc (including the
/// boundary) and write it into `out[0]` / `out[1]`.
///
/// Uses rejection sampling to avoid the over-dense centre that polar-radius
/// sampling without a square-root correction produces.
// flight-lint: allow(conform-params) D9b approved out-first convention places the caller-owned output before the random source
pub fn random_inside_unit_disc(out: &mut [f32; 2], random: &dyn Fn() -> f32) {
    loop {
        let x = random() * 2.0 - 1.0;
        let y = random() * 2.0 - 1.0;
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
// flight-lint: allow(conform-params) D9b approved out-first convention places the caller-owned output before the random source
pub fn random_inside_unit_sphere(out: &mut [f32; 3], random: &dyn Fn() -> f32) {
    loop {
        let x = random() * 2.0 - 1.0;
        let y = random() * 2.0 - 1.0;
        let z = random() * 2.0 - 1.0;
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
// flight-lint: allow(conform-params) D9b approved out-first convention places the caller-owned output before the random source
// flight-lint: allow(f64) retain TS quarter-turn accuracy before narrowing unit-circle coordinates to f32
pub fn random_on_unit_circle(out: &mut [f32; 2], random: &dyn Fn() -> f32) {
    let angle = random() as f64 * std::f64::consts::TAU;
    let x = angle.cos() as f32;
    let y = angle.sin() as f32;
    out[0] = x;
    out[1] = y;
}

/// Sample a uniformly-distributed point on the surface of the unit sphere
/// and write it into `out[0]` / `out[1]` / `out[2]`.
///
/// Uses the Marsaglia (1972) method.
// flight-lint: allow(conform-params) D9b approved out-first convention places the caller-owned output before the random source
pub fn random_on_unit_sphere(out: &mut [f32; 3], random: &dyn Fn() -> f32) {
    let mut x: f32;
    let mut y: f32;
    let mut s: f32;
    loop {
        x = random() * 2.0 - 1.0;
        y = random() * 2.0 - 1.0;
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
pub fn random_poisson(random: &dyn Fn() -> f32, lambda: Option<f32>) -> i32 {
    let lambda = lambda.unwrap_or(1.0);
    if !lambda.is_finite() || lambda <= 0.0 {
        throw_range_error("randomPoisson: lambda must be finite and > 0");
    }
    let limit = (-lambda).exp();
    let mut k = 0_i32;
    let mut product = random();
    while product > limit {
        k += 1;
        product *= random();
    }
    return k;
}

/// Return a random index from a weight array, selected proportionally to
/// each weight. Weights do not need to sum to 1.
///
/// Returns `-1` for an empty or all-zero weight array.
// flight-lint: allow(conform-array) read-only statistic input widened to ArrayLike (negotiated)
pub fn random_weighted(random: &dyn Fn() -> f32, weights: &[f32]) -> i32 {
    let mut total = 0.0_f32;
    let mut i = 0;
    while i < weights.len() {
        total += weights[i];
        i += 1;
    }
    if total <= 0.0 {
        return -1;
    }
    let mut r = random() * total;
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

/// Clear and fill `out` with the elements of `items` shuffled in a random order
/// (Fisher-Yates / Knuth shuffle). Reuses the caller's allocation and does not mutate `items`.
// flight-lint: allow(conform-params) D24: computed collections use a first required caller-owned output in the TS target
pub fn shuffle<T: Clone>(out: &mut Vec<T>, random: &dyn Fn() -> f32, items: &[T]) {
    out.clear();
    out.extend_from_slice(items);
    shuffle_in_place(random, out);
}

/// Shuffle `items` in place using the Fisher-Yates algorithm.
///
/// Mutates `items`. Deterministic: same random state -> same shuffled order.
pub fn shuffle_in_place<T>(random: &dyn Fn() -> f32, items: &mut [T]) {
    let len = items.len();
    if len <= 1 {
        return;
    }
    let mut i = len - 1;
    while i > 0 {
        let j = (random() * (i + 1) as f32).floor() as usize;
        items.swap(i, j);
        i -= 1;
    }
}
