use crate::RandomSource;
use crate::next_random;

/// Return a random boolean with the given `probability` of being `true`.
///
/// Values outside `[0, 1]` behave like the nearest endpoint; `0.5` is a fair coin flip.
pub fn random_bool(random: &mut RandomSource, probability: f32) -> bool {
    return next_random(random) < probability;
}

/// Return a random integer in the inclusive range `[min, max]`.
///
/// Panics if `min` is greater than `max`.
pub fn random_int(random: &mut RandomSource, min: i32, max: i32) -> i32 {
    if min > max {
        panic!("random_int: min must be <= max");
    }
    return min + (next_random(random) * (max - min + 1) as f32).floor() as i32;
}

/// Return a random float in the half-open range `[min, max)`.
pub fn random_range(random: &mut RandomSource, min: f32, max: f32) -> f32 {
    return min + next_random(random) * (max - min);
}

/// Return a random sign: either `1` or `-1` with equal probability.
pub fn random_sign(random: &mut RandomSource) -> f32 {
    return if next_random(random) < 0.5 { -1.0 } else { 1.0 };
}
