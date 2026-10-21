use flight_easing::*;
use flight_easing::contract::initialize_easing_samples;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod create_easing_samples {
    use super::*;

    #[test]
    #[should_panic]
    fn panics_for_count_less_than_1() {
        create_easing_samples(&ease_linear, 0);
    }

    #[test]
    fn allocates_a_float32_array_of_the_correct_length() {
        let result = create_easing_samples(&ease_linear, 5);
        assert_eq!(result.len(), 5);
    }

    #[test]
    fn first_sample_is_ease_0_and_last_is_ease_1() {
        let result = create_easing_samples(&ease_in_cubic, 11);
        assert_approx(result[0], ease_in_cubic(0.0));
        assert_approx(result[10], ease_in_cubic(1.0));
    }

    #[test]
    fn samples_ease_linear_uniformly() {
        let count = 6;
        let result = create_easing_samples(&ease_linear, count);
        for i in 0..count {
            assert_approx(result[i], i as f32 / (count as f32 - 1.0));
        }
    }

    #[test]
    fn count_1_samples_at_the_midpoint() {
        let result = create_easing_samples(&ease_in_cubic, 1);
        assert_approx(result[0], ease_in_cubic(0.5));
    }
}

mod initialize_easing_samples {
    use super::*;

    #[test]
    fn writes_into_provided_slice() {
        let mut out = vec![0.0_f32; 5];
        initialize_easing_samples(&mut out, &ease_linear, 5);
        assert_approx(out[0], 0.0);
        assert_approx(out[4], 1.0);
    }

    #[test]
    fn only_writes_first_count_entries() {
        let mut out = vec![0.0_f32; 10];
        initialize_easing_samples(&mut out, &ease_linear, 5);
        assert_approx(out[4], 1.0);
        assert_eq!(out[5], 0.0);
    }
}
