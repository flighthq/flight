use flight_entity::throw_range_error;

/// Return a random boolean with the given `probability` of being `true`.
///
/// Values outside `[0, 1]` behave like the nearest endpoint; `0.5` is a fair coin flip.
pub fn random_bool(random: &dyn Fn() -> f32, probability: Option<f32>) -> bool {
    let probability = probability.unwrap_or(0.5);
    return random() < probability;
}

/// Return a random integer in the inclusive range `[min, max]`.
///
/// Panics if `min` is greater than `max`.
pub fn random_int(random: &dyn Fn() -> f32, min: i32, max: i32) -> i32 {
    if min > max {
        throw_range_error("randomInt: min must be <= max");
    }
    return min + (random() * (max - min + 1) as f32).floor() as i32;
}

/// Return a random float in the half-open range `[min, max)`.
pub fn random_range(random: &dyn Fn() -> f32, min: f32, max: f32) -> f32 {
    return min + random() * (max - min);
}

/// Return a random sign: either `1` or `-1` with equal probability.
pub fn random_sign(random: &dyn Fn() -> f32) -> f32 {
    return if random() < 0.5 { -1.0 } else { 1.0 };
}
