/// Return the arithmetic mean of `values`.
///
/// Returns `NaN` for an empty slice. No allocation beyond the accumulator.
pub fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return f64::NAN;
    }
    let scale = finite_absolute_scale(values);
    if !scale.is_finite() {
        return unscaled_mean(values);
    }
    if scale == 0.0 {
        return 0.0;
    }
    return (scaled_sum(values, scale) / values.len() as f64) * scale;
}

/// Return the median of `values`.
///
/// Allocates a sorted copy — does not mutate the input. Returns `NaN` for an
/// empty slice.
pub fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return f64::NAN;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = sorted.len() / 2;
    return if sorted.len() % 2 != 0 {
        sorted[mid]
    } else {
        midpoint(sorted[mid - 1], sorted[mid])
    };
}

/// Return the population standard deviation of `values`.
///
/// Returns `NaN` for an empty slice.
pub fn standard_deviation(values: &[f64]) -> f64 {
    if values.is_empty() {
        return f64::NAN;
    }
    let scale = finite_absolute_scale(values);
    if !scale.is_finite() {
        return unscaled_variance(values).sqrt();
    }
    if scale == 0.0 {
        return 0.0;
    }
    return scaled_variance(values, scale).sqrt() * scale;
}

/// Return the population variance of `values`.
///
/// Returns `NaN` for an empty slice, `0` for a single element.
pub fn variance(values: &[f64]) -> f64 {
    if values.is_empty() {
        return f64::NAN;
    }
    let scale = finite_absolute_scale(values);
    if !scale.is_finite() {
        return unscaled_variance(values);
    }
    if scale == 0.0 {
        return 0.0;
    }
    let normalized = scaled_variance(values, scale);
    if normalized == 0.0 {
        return 0.0;
    }
    return normalized * scale * scale;
}

/// Return the weighted average of `values` using `weights`.
///
/// Each `values[i]` is weighted by `weights[i]`. The slices must have the same
/// length. Returns `NaN` for an empty slice or if total weight is `0`. Panics
/// if `values.len() != weights.len()`.
pub fn weighted_average(values: &[f64], weights: &[f64]) -> f64 {
    if values.len() != weights.len() {
        panic!("weighted_average: values and weights must have the same length");
    }
    if values.is_empty() {
        return f64::NAN;
    }
    let value_scale = finite_absolute_scale(values);
    let weight_scale = finite_absolute_scale(weights);
    if !value_scale.is_finite() || !weight_scale.is_finite() {
        return unscaled_weighted_average(values, weights);
    }
    if weight_scale == 0.0 {
        return f64::NAN;
    }
    let sum_weights = scaled_sum(weights, weight_scale);
    if sum_weights == 0.0 {
        return f64::NAN;
    }
    if value_scale == 0.0 {
        return 0.0;
    }

    let mut sum_product = 0.0_f64;
    let mut correction = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        let term = (values[i] / value_scale) * (weights[i] / weight_scale) - correction;
        let next = sum_product + term;
        correction = next - sum_product - term;
        sum_product = next;
        i += 1;
    }
    return (sum_product / sum_weights) * value_scale;
}

fn finite_absolute_scale(values: &[f64]) -> f64 {
    let mut scale = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        let v = values[i].abs();
        if v.is_nan() {
            return f64::NAN;
        }
        if v > scale {
            scale = v;
        }
        i += 1;
    }
    return scale;
}

fn midpoint(a: f64, b: f64) -> f64 {
    if !a.is_finite() || !b.is_finite() {
        return (a + b) / 2.0;
    }
    if a.to_bits() == b.to_bits() {
        return a;
    }
    if (a >= 0.0 && b >= 0.0) || (a <= 0.0 && b <= 0.0) {
        return a + (b - a) / 2.0;
    }
    return a / 2.0 + b / 2.0;
}

fn scaled_sum(values: &[f64], scale: f64) -> f64 {
    let mut sum = 0.0_f64;
    let mut correction = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        let term = values[i] / scale - correction;
        let next = sum + term;
        correction = next - sum - term;
        sum = next;
        i += 1;
    }
    return sum;
}

fn scaled_variance(values: &[f64], scale: f64) -> f64 {
    let normalized_mean = scaled_sum(values, scale) / values.len() as f64;
    let mut sum = 0.0_f64;
    let mut correction = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        let difference = values[i] / scale - normalized_mean;
        let term = difference * difference - correction;
        let next = sum + term;
        correction = next - sum - term;
        sum = next;
        i += 1;
    }
    return if sum / values.len() as f64 > 0.0 {
        sum / values.len() as f64
    } else {
        0.0
    };
}

fn unscaled_mean(values: &[f64]) -> f64 {
    let mut sum = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        sum += values[i];
        i += 1;
    }
    return sum / values.len() as f64;
}

fn unscaled_variance(values: &[f64]) -> f64 {
    let average = unscaled_mean(values);
    let mut sum = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        let difference = values[i] - average;
        sum += difference * difference;
        i += 1;
    }
    return sum / values.len() as f64;
}

fn unscaled_weighted_average(values: &[f64], weights: &[f64]) -> f64 {
    let mut sum_weights = 0.0_f64;
    let mut sum_product = 0.0_f64;
    let mut i = 0;
    while i < values.len() {
        sum_weights += weights[i];
        sum_product += values[i] * weights[i];
        i += 1;
    }
    return if sum_weights == 0.0 { f64::NAN } else { sum_product / sum_weights };
}
