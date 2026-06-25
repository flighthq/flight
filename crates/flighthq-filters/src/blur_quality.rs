//! Maps Flash's quality field to a number of box-blur passes.

/// Maps Flash's quality field (integer 1–15) to a number of box-blur passes.
///
/// Flash uses quality to control how many times the blur kernel is applied:
///   quality 1    → 1 pass  (fast, blocky)
///   quality 2–8  → 2 passes (typical)
///   quality 9–15 → 3 passes (smooth)
/// The input is clamped to [1, 15] before mapping.
pub fn get_blur_pass_count_for_quality(quality: u32) -> u32 {
    let q = quality.clamp(1, 15);
    if q == 1 {
        1
    } else if q <= 8 {
        2
    } else {
        3
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_blur_pass_count_for_quality_one_is_one_pass() {
        assert_eq!(get_blur_pass_count_for_quality(1), 1);
    }

    #[test]
    fn get_blur_pass_count_for_quality_mid_is_two_passes() {
        assert_eq!(get_blur_pass_count_for_quality(2), 2);
        assert_eq!(get_blur_pass_count_for_quality(8), 2);
    }

    #[test]
    fn get_blur_pass_count_for_quality_high_is_three_passes() {
        assert_eq!(get_blur_pass_count_for_quality(9), 3);
        assert_eq!(get_blur_pass_count_for_quality(15), 3);
    }

    #[test]
    fn get_blur_pass_count_for_quality_clamps_high() {
        assert_eq!(get_blur_pass_count_for_quality(100), 3);
    }

    #[test]
    fn get_blur_pass_count_for_quality_clamps_low() {
        assert_eq!(get_blur_pass_count_for_quality(0), 1);
    }
}
