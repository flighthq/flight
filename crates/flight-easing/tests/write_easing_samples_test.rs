use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod write_easing_samples {
    use super::*;

    #[test]
    fn first_sample_is_ease_0_and_last_is_ease_1() {
        let mut result = [0.0; 11];
        write_easing_samples(&mut result, &ease_in_cubic);
        assert_approx(result[0], ease_in_cubic(0.0));
        assert_approx(result[10], ease_in_cubic(1.0));
    }

    #[test]
    fn samples_ease_linear_uniformly() {
        let mut result = [0.0; 6];
        write_easing_samples(&mut result, &ease_linear);
        for i in 0..result.len() {
            assert_approx(result[i], i as f32 / (result.len() as f32 - 1.0));
        }
    }

    #[test]
    fn one_entry_samples_at_the_midpoint() {
        let mut result = [99.0];
        write_easing_samples(&mut result, &ease_in_cubic);
        assert_approx(result[0], ease_in_cubic(0.5));
    }

    #[test]
    fn derives_sample_count_from_a_larger_output() {
        let mut out = [-7.0; 10];
        write_easing_samples(&mut out, &ease_linear);
        assert_approx(out[4], 4.0 / 9.0);
        assert_approx(out[5], 5.0 / 9.0);
        assert_eq!(out[0], 0.0);
        assert_eq!(out[9], 1.0);
    }

    #[test]
    fn evaluates_samples_and_endpoint_callbacks_in_source_order() {
        let calls = std::cell::Cell::new([0.0; 5]);
        let call_count = std::cell::Cell::new(0);
        let ease = |t| {
            let index = call_count.get();
            let mut values = calls.get();
            values[index] = t;
            calls.set(values);
            call_count.set(index + 1);
            return t + 10.0;
        };
        let mut out = [0.0; 3];
        write_easing_samples(&mut out, &ease);
        assert_eq!(calls.get(), [0.0, 0.5, 1.0, 0.0, 1.0]);
        assert_eq!(out, [10.0, 10.5, 11.0]);
    }

    #[test]
    fn invokes_midpoint_callback_once_for_one_entry() {
        let calls = std::cell::Cell::new(0);
        let ease = |t| {
            calls.set(calls.get() + 1);
            return t;
        };
        let mut out = [-7.0];
        write_easing_samples(&mut out, &ease);
        assert_eq!(calls.get(), 1);
        assert_eq!(out, [0.5]);
    }

    #[test]
    #[should_panic]
    fn rejects_empty_output() {
        let mut out = [];
        write_easing_samples(&mut out, &ease_linear);
    }
}
