use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-6,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod linear_channel_to_srgb {
    use super::*;

    #[test]
    fn maps_zero_to_zero() {
        assert_eq!(linear_channel_to_srgb(0.0), 0.0);
    }

    #[test]
    fn maps_one_to_one() {
        assert_approx_tight(linear_channel_to_srgb(1.0), 1.0);
    }

    #[test]
    fn is_the_inverse_of_the_srgb_decode_for_a_round_trip() {
        let linear = 0.5;
        let srgb = linear_channel_to_srgb(linear);
        assert_approx_tight(srgb_channel_to_linear(srgb), linear);
    }
}

mod srgb_channel_to_linear {
    use super::*;

    #[test]
    fn maps_zero_to_zero_and_one_to_one() {
        assert_eq!(srgb_channel_to_linear(0.0), 0.0);
        assert_approx_tight(srgb_channel_to_linear(1.0), 1.0);
    }

    #[test]
    fn decodes_mid_srgb_below_the_linear_midpoint() {
        assert_approx(srgb_channel_to_linear(0x80 as f32 / 0xff as f32), 0.21586);
    }

    #[test]
    fn round_trips_with_linear_channel_to_srgb() {
        let srgb = 0.25;
        assert_approx_tight(linear_channel_to_srgb(srgb_channel_to_linear(srgb)), srgb);
    }
}
