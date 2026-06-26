/// Returns the box-blur radius for pass `pass` of `passes`, using two adjacent
/// odd box widths so the combined variance tracks a Gaussian of standard
/// deviation `sigma`. The lower passes use the smaller width and the remaining
/// passes use the next odd width up; this avoids the overshoot that repeating a
/// single rounded radius `passes` times accumulates. Radii are non-decreasing in
/// `pass`. Use this for backends that can vary the radius per pass (such as the
/// GL separable passes); `compute_box_blur_radius` covers backends that apply one
/// uniform radius across every pass.
pub fn compute_box_blur_pass_radius(sigma: f64, passes: u32, pass: u32) -> f64 {
    if sigma <= 0.0 {
        return 0.0;
    }
    let lower_width = compute_box_blur_lower_width(sigma, passes);
    let lower_count = compute_box_blur_lower_pass_count(sigma, passes, lower_width);
    let width = if pass < lower_count {
        lower_width
    } else {
        lower_width + 2
    };
    f64::max(0.0, (width as f64 - 1.0) / 2.0)
}

/// Converts sigma to the single box-blur radius whose repeated application
/// (`passes` times) has the same variance as a Gaussian with standard deviation
/// `sigma`. Use this for backends that apply one uniform radius across every
/// pass; for backends that can vary the radius per pass, `compute_box_blur_pass_radius`
/// tracks `sigma` more closely.
pub fn compute_box_blur_radius(sigma: f64, passes: u32) -> f64 {
    if sigma <= 0.0 {
        return 0.0;
    }
    f64::max(
        0.0,
        f64::round((-1.0 + f64::sqrt(1.0 + (12.0 * sigma * sigma) / passes as f64)) / 2.0),
    )
}

/// Converts a box-blur radius to the approximate Gaussian sigma that a single-pass box blur of
/// that radius corresponds to. Inverse of the `compute_box_blur_radius` uniform-pass formula:
/// sigma = sqrt(passes * (2*radius + 1)^2 / 12). Useful for the reverse mapping (e.g. to feed a
/// sigma-based backend from a Flash `blur_x` value).
pub fn compute_gaussian_sigma_for_blur_radius(radius: f64, passes: u32) -> f64 {
    if radius <= 0.0 || passes == 0 {
        return 0.0;
    }
    let width = 2.0 * radius + 1.0;
    f64::sqrt((passes as f64 * width * width) / 12.0)
}

// Largest odd box width whose `passes`-fold variance stays at or below a Gaussian
// of standard deviation `sigma`. Odd keeps the radius (width - 1) / 2 integral.
fn compute_box_blur_lower_width(sigma: f64, passes: u32) -> u32 {
    let mut width = f64::floor(f64::sqrt((12.0 * sigma * sigma) / passes as f64 + 1.0)) as u32;
    if width % 2 == 0 {
        width -= 1;
    }
    width
}

// Number of passes that use `lower_width`; the remaining passes use the next odd
// width up so the combined variance tracks sigma. Derived from
// m·(wl² - 1)/12 + (passes - m)·(wu² - 1)/12 = σ², with wu = wl + 2.
fn compute_box_blur_lower_pass_count(sigma: f64, passes: u32, lower_width: u32) -> u32 {
    let wl = lower_width as f64;
    let n = passes as f64;
    f64::round((12.0 * sigma * sigma - n * (wl * wl + 4.0 * wl + 3.0)) / (-4.0 * wl - 4.0)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn effective_sigma(radii: &[f64]) -> f64 {
        f64::sqrt(radii.iter().fold(0.0, |sum, &r| sum + (r * r + r) / 3.0))
    }

    fn pass_radii(sigma: f64, passes: u32) -> Vec<f64> {
        (0..passes)
            .map(|pass| compute_box_blur_pass_radius(sigma, passes, pass))
            .collect()
    }

    // compute_box_blur_pass_radius

    #[test]
    fn compute_box_blur_pass_radius_returns_zero_for_sigma_zero() {
        assert_eq!(pass_radii(0.0, 3), vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn compute_box_blur_pass_radius_returns_zero_for_negative_sigma() {
        assert_eq!(pass_radii(-1.0, 2), vec![0.0, 0.0]);
    }

    #[test]
    fn compute_box_blur_pass_radius_uses_at_most_two_distinct_box_sizes() {
        let radii = pass_radii(12.0, 3);
        let unique: std::collections::HashSet<u64> = radii.iter().map(|&r| r.to_bits()).collect();
        assert!(unique.len() <= 2);
    }

    #[test]
    fn compute_box_blur_pass_radius_is_non_decreasing_in_pass_index() {
        let radii = pass_radii(4.0, 3);
        for i in 1..radii.len() {
            assert!(radii[i] >= radii[i - 1]);
        }
    }

    #[test]
    fn compute_box_blur_pass_radius_approximates_target_sigma_without_overshooting() {
        for &sigma in &[4.0_f64, 8.0, 12.0] {
            let sigma_eff = effective_sigma(&pass_radii(sigma, 3));
            assert!(sigma_eff > sigma * 0.9);
            assert!(sigma_eff <= sigma * 1.02);
        }
    }

    #[test]
    fn compute_box_blur_pass_radius_does_not_overshoot_like_uniform_radius() {
        let naive_radius = compute_box_blur_radius(4.0, 3);
        let naive_sigma = effective_sigma(&[naive_radius, naive_radius, naive_radius]);
        let split_sigma = effective_sigma(&pass_radii(4.0, 3));
        assert!(naive_sigma > 4.0); // documents the overshoot
        assert!((split_sigma - 4.0).abs() < (naive_sigma - 4.0).abs());
    }

    // compute_box_blur_radius

    #[test]
    fn compute_box_blur_radius_returns_zero_for_sigma_zero() {
        assert_eq!(compute_box_blur_radius(0.0, 1), 0.0);
    }

    #[test]
    fn compute_box_blur_radius_returns_zero_for_negative_sigma() {
        assert_eq!(compute_box_blur_radius(-4.0, 1), 0.0);
    }

    #[test]
    fn compute_box_blur_radius_returns_positive_for_positive_sigma() {
        assert!(compute_box_blur_radius(4.0, 1) > 0.0);
    }

    #[test]
    fn compute_box_blur_radius_returns_smaller_radius_for_more_passes() {
        let r1 = compute_box_blur_radius(10.0, 1);
        let r3 = compute_box_blur_radius(10.0, 3);
        assert!(r3 < r1);
    }

    #[test]
    fn compute_box_blur_radius_returns_6_for_sigma_4_with_1_pass() {
        // round((-1 + sqrt(1 + 12·16/1)) / 2) = round((-1 + sqrt(193)) / 2) ≈ round(6.44) = 6
        assert_eq!(compute_box_blur_radius(4.0, 1), 6.0);
    }

    // compute_gaussian_sigma_for_blur_radius

    #[test]
    fn compute_gaussian_sigma_for_blur_radius_returns_zero_for_radius_zero() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(0.0, 1), 0.0);
    }

    #[test]
    fn compute_gaussian_sigma_for_blur_radius_returns_zero_for_negative_radius() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(-1.0, 1), 0.0);
    }

    #[test]
    fn compute_gaussian_sigma_for_blur_radius_returns_zero_for_zero_passes() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(4.0, 0), 0.0);
    }

    #[test]
    fn compute_gaussian_sigma_for_blur_radius_returns_positive_for_positive_inputs() {
        assert!(compute_gaussian_sigma_for_blur_radius(6.0, 1) > 0.0);
    }

    #[test]
    fn compute_gaussian_sigma_for_blur_radius_produces_larger_sigma_for_more_passes() {
        let s1 = compute_gaussian_sigma_for_blur_radius(4.0, 1);
        let s3 = compute_gaussian_sigma_for_blur_radius(4.0, 3);
        assert!(s3 > s1);
    }
}
