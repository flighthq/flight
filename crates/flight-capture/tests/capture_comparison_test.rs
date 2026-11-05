use flight_capture::contract::*;

// Short 1x1 fingerprints: `1:<rr><gg><bb>`, three RGB bytes as six hex chars. The per-channel mean
// distance is (|dR| + |dG| + |dB|) / 3, so a single channel offset of N produces a distance of N / 3.
const BLACK: &str = "1:000000";
const NUDGE_15: &str = "1:0f0000"; // dR = 15 -> distance 5   (== regression tolerance)
const NUDGE_18: &str = "1:120000"; // dR = 18 -> distance 6   (>  regression tolerance)
const NUDGE_45: &str = "1:2d0000"; // dR = 45 -> distance 15  (== parity tolerance)
const NUDGE_48: &str = "1:300000"; // dR = 48 -> distance 16  (>  parity tolerance)
const WHITE: &str = "1:ffffff"; // distance 255 from black

mod compare_capture_fingerprints {
    use super::*;

    #[test]
    fn is_zero_for_identical_fingerprints() {
        assert_eq!(compare_capture_fingerprints(BLACK, BLACK), 0.0);
        assert_eq!(compare_capture_fingerprints(WHITE, WHITE), 0.0);
    }

    #[test]
    fn measures_the_mean_absolute_per_channel_distance() {
        assert_eq!(compare_capture_fingerprints(BLACK, NUDGE_15), 5.0);
        assert_eq!(compare_capture_fingerprints(BLACK, WHITE), 255.0);
    }

    #[test]
    fn is_infinite_when_either_fingerprint_is_unparseable() {
        assert_eq!(
            compare_capture_fingerprints("not-a-fingerprint", BLACK),
            f64::INFINITY
        );
        assert_eq!(compare_capture_fingerprints(BLACK, ""), f64::INFINITY);
    }

    #[test]
    fn is_infinite_when_the_grid_sizes_differ() {
        let two_by_two = format!("2:{}", "00".repeat(2 * 2 * 3));
        assert_eq!(
            compare_capture_fingerprints(BLACK, &two_by_two),
            f64::INFINITY
        );
    }
}

mod evaluate_capture_parity {
    use super::*;

    #[test]
    fn defaults_to_the_parity_tolerance_and_passes_at_the_boundary() {
        let result = evaluate_capture_parity(BLACK, NUDGE_45, None);
        assert_eq!(result.tolerance, CAPTURE_PARITY_TOLERANCE);
        assert_eq!(result.difference, 15.0);
        assert!(result.pass);
    }

    #[test]
    fn fails_just_past_the_parity_tolerance() {
        let result = evaluate_capture_parity(BLACK, NUDGE_48, None);
        assert_eq!(result.difference, 16.0);
        assert!(!result.pass);
    }

    #[test]
    fn fails_on_an_unparseable_fingerprint_via_the_infinity_sentinel() {
        let result = evaluate_capture_parity(BLACK, "broken", None);
        assert_eq!(result.difference, f64::INFINITY);
        assert!(!result.pass);
    }

    #[test]
    fn honors_an_explicit_tolerance_override() {
        assert!(evaluate_capture_parity(BLACK, NUDGE_48, Some(20.0)).pass);
    }
}

mod evaluate_capture_regression {
    use super::*;

    #[test]
    fn defaults_to_the_regression_tolerance_and_passes_at_the_boundary() {
        let result = evaluate_capture_regression(BLACK, NUDGE_15, None);
        assert_eq!(result.tolerance, CAPTURE_REGRESSION_TOLERANCE);
        assert_eq!(result.difference, 5.0);
        assert!(result.pass);
    }

    #[test]
    fn passes_for_an_identical_fingerprint() {
        let result = evaluate_capture_regression(WHITE, WHITE, None);
        assert_eq!(result.difference, 0.0);
        assert!(result.pass);
    }

    #[test]
    fn fails_just_past_the_regression_tolerance() {
        let result = evaluate_capture_regression(BLACK, NUDGE_18, None);
        assert_eq!(result.difference, 6.0);
        assert!(!result.pass);
    }

    #[test]
    fn fails_on_an_unparseable_baseline_via_the_infinity_sentinel() {
        let result = evaluate_capture_regression(BLACK, "no-baseline", None);
        assert_eq!(result.difference, f64::INFINITY);
        assert!(!result.pass);
    }

    #[test]
    fn honors_an_explicit_tolerance_override() {
        assert!(evaluate_capture_regression(BLACK, NUDGE_18, Some(10.0)).pass);
    }
}
