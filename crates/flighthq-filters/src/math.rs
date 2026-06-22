//! Box-blur radius math utilities.
//!
//! These helpers convert a Gaussian standard deviation (sigma) into integer
//! box-blur radii for multi-pass box-blur approximations. Two strategies are
//! provided to match the strategies in the TS reference:
//!
//! - `compute_box_blur_pass_radius`: per-pass radius that varies between two
//!   adjacent odd widths to track sigma closely (use when each pass can have a
//!   different radius, e.g. WebGL separable passes).
//! - `compute_box_blur_radius`: single uniform radius repeated `passes` times
//!   (use when all passes share the same radius).

/// Returns the box-blur radius for a specific `pass` of `passes`, choosing
/// between two adjacent odd box widths so the combined variance tracks a
/// Gaussian of standard deviation `sigma`.
///
/// Lower-numbered passes use the smaller width; the remainder use the next odd
/// width up. Radii are non-decreasing in `pass`.
pub fn compute_box_blur_pass_radius(sigma: f32, passes: u32, pass: u32) -> u32 {
    if sigma <= 0.0 {
        return 0;
    }
    let lower_width = compute_box_blur_lower_width(sigma, passes);
    let lower_count = compute_box_blur_lower_pass_count(sigma, passes, lower_width);
    let width = if pass < lower_count {
        lower_width
    } else {
        lower_width + 2
    };
    ((width as i32 - 1) / 2).max(0) as u32
}

/// Converts `sigma` to the single box-blur radius whose `passes`-fold application
/// has the same variance as a Gaussian with standard deviation `sigma`.
pub fn compute_box_blur_radius(sigma: f32, passes: u32) -> u32 {
    if sigma <= 0.0 {
        return 0;
    }
    let v = (-1.0 + f32::sqrt(1.0 + (12.0 * sigma * sigma) / passes as f32)) / 2.0;
    (v.round() as i32).max(0) as u32
}

/// Largest odd box width whose `passes`-fold variance stays at or below a
/// Gaussian of standard deviation `sigma`.
fn compute_box_blur_lower_width(sigma: f32, passes: u32) -> u32 {
    let mut width = f32::sqrt((12.0 * sigma * sigma) / passes as f32 + 1.0).floor() as u32;
    if width % 2 == 0 {
        width = width.saturating_sub(1);
    }
    width
}

/// Number of passes that use `lower_width`; the remaining passes use
/// `lower_width + 2` so the combined variance tracks sigma.
fn compute_box_blur_lower_pass_count(sigma: f32, passes: u32, lower_width: u32) -> u32 {
    let wl = lower_width as f32;
    let p = passes as f32;
    let numerator = 12.0 * sigma * sigma - p * (wl * wl + 4.0 * wl + 3.0);
    let denominator = -4.0 * wl - 4.0;
    (numerator / denominator).round().max(0.0) as u32
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Combined variance of n box passes of radius rᵢ is Σ (rᵢ² + rᵢ) / 3; the
    // effective σ is its square root.
    fn effective_sigma(radii: &[u32]) -> f32 {
        let sum: f32 = radii
            .iter()
            .map(|&r| {
                let r = r as f32;
                (r * r + r) / 3.0
            })
            .sum();
        sum.sqrt()
    }

    fn pass_radii(sigma: f32, passes: u32) -> Vec<u32> {
        (0..passes)
            .map(|pass| compute_box_blur_pass_radius(sigma, passes, pass))
            .collect()
    }

    #[test]
    fn compute_box_blur_pass_radius_approximates_target_sigma() {
        for &sigma in &[4.0_f32, 8.0, 12.0] {
            let sigma_eff = effective_sigma(&pass_radii(sigma, 3));
            assert!(sigma_eff > sigma * 0.9);
            assert!(sigma_eff <= sigma * 1.02);
        }
    }

    #[test]
    fn compute_box_blur_pass_radius_does_not_overshoot_like_uniform() {
        let naive_radius = compute_box_blur_radius(4.0, 3);
        let naive_sigma = effective_sigma(&[naive_radius, naive_radius, naive_radius]);
        let split_sigma = effective_sigma(&pass_radii(4.0, 3));
        assert!(naive_sigma > 4.0);
        assert!((split_sigma - 4.0).abs() < (naive_sigma - 4.0).abs());
    }

    #[test]
    fn compute_box_blur_pass_radius_non_decreasing() {
        let radii = pass_radii(4.0, 3);
        for i in 1..radii.len() {
            assert!(radii[i] >= radii[i - 1]);
        }
    }

    #[test]
    fn compute_box_blur_pass_radius_uses_at_most_two_sizes() {
        let radii = pass_radii(12.0, 3);
        let mut distinct = radii.clone();
        distinct.sort_unstable();
        distinct.dedup();
        assert!(distinct.len() <= 2);
    }

    #[test]
    fn compute_box_blur_pass_radius_zero_sigma() {
        assert_eq!(pass_radii(0.0, 3), vec![0, 0, 0]);
    }

    #[test]
    fn compute_box_blur_pass_radius_negative_sigma() {
        assert_eq!(pass_radii(-1.0, 2), vec![0, 0]);
    }

    #[test]
    fn compute_box_blur_radius_zero_sigma() {
        assert_eq!(compute_box_blur_radius(0.0, 1), 0);
    }

    #[test]
    fn compute_box_blur_radius_negative_sigma() {
        assert_eq!(compute_box_blur_radius(-4.0, 1), 0);
    }

    #[test]
    fn compute_box_blur_radius_positive() {
        assert!(compute_box_blur_radius(4.0, 1) > 0);
    }

    #[test]
    fn compute_box_blur_radius_smaller_for_more_passes() {
        let r1 = compute_box_blur_radius(10.0, 1);
        let r3 = compute_box_blur_radius(10.0, 3);
        assert!(r3 < r1);
    }

    #[test]
    fn compute_box_blur_radius_sigma_four_one_pass_is_six() {
        assert_eq!(compute_box_blur_radius(4.0, 1), 6);
    }
}
