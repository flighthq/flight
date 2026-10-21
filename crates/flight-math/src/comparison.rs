use crate::EPSILON;

/// Return `true` if `|a - b| <= epsilon`.
///
/// Uses an absolute epsilon, appropriate for values near zero. For magnitudes
/// much larger than 1, use `approx_equal_relative`.
pub fn approx_equal(a: f32, b: f32, epsilon: Option<f32>) -> bool {
    let epsilon = epsilon.unwrap_or(EPSILON);
    return (a - b).abs() <= epsilon;
}

/// Return `true` if `a` and `b` agree to within a relative tolerance.
///
/// Uses `|a - b| <= relative_epsilon * max(|a|, |b|)`, which scales with
/// magnitude and is appropriate for large numbers where absolute epsilon
/// comparisons fail. For values near zero, falls back to `EPSILON`
/// (absolute).
pub fn approx_equal_relative(a: f32, b: f32, relative_epsilon: Option<f32>) -> bool {
    let relative_epsilon = relative_epsilon.unwrap_or(EPSILON);
    let diff = (a - b).abs();
    let largest = if a.abs() > b.abs() { a.abs() } else { b.abs() };
    let threshold = relative_epsilon * largest;
    let threshold = if threshold > EPSILON {
        threshold
    } else {
        EPSILON
    };
    return diff <= threshold;
}

/// Return `true` if `|value| <= epsilon`.
pub fn approx_zero(value: f32, epsilon: Option<f32>) -> bool {
    let epsilon = epsilon.unwrap_or(EPSILON);
    return value.abs() <= epsilon;
}
