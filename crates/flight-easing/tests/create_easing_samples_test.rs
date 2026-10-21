use flight_easing::contract::initialize_easing_samples;
use flight_easing::*;

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

mod write_easing_samples {
    use super::*;

    #[test]
    fn writes_required_output_without_replacing_storage_or_tail() {
        let mut out = vec![-7.0_f32; 8];
        let storage = out.as_ptr();
        write_easing_samples(&mut out, &ease_linear, 5);
        assert_eq!(out.as_ptr(), storage);
        assert_eq!(out.len(), 8);
        assert_eq!(&out[..5], &[0.0, 0.25, 0.5, 0.75, 1.0]);
        assert_eq!(&out[5..], &[-7.0; 3]);
    }

    #[test]
    fn samples_midpoint_for_single_entry() {
        let mut out = [99.0, -7.0];
        write_easing_samples(&mut out, &ease_in_cubic, 1);
        assert_eq!(out, [0.125, -7.0]);
    }

    #[test]
    fn evaluates_samples_and_endpoint_callbacks_in_source_order() {
        let calls = std::cell::RefCell::new(Vec::new());
        let ease = |t| {
            calls.borrow_mut().push(t);
            return t + 10.0;
        };
        let mut out = [0.0; 2];
        write_easing_samples(&mut out, &ease, 3);
        assert_eq!(*calls.borrow(), vec![0.0, 0.5, 1.0, 0.0, 1.0]);
        assert_eq!(out, [10.0, 10.5]);
    }

    #[test]
    fn ignores_typed_array_writes_past_empty_output() {
        let calls = std::cell::RefCell::new(Vec::new());
        let ease = |t| {
            calls.borrow_mut().push(t);
            return t;
        };
        let mut out = [];
        write_easing_samples(&mut out, &ease, 1);
        assert_eq!(*calls.borrow(), vec![0.5]);
        calls.borrow_mut().clear();
        write_easing_samples(&mut out, &ease, 2);
        assert_eq!(*calls.borrow(), vec![0.0, 1.0, 0.0, 1.0]);
    }

    #[test]
    fn rejects_zero_count_before_callbacks_or_output_writes() {
        let calls = std::cell::Cell::new(0);
        let ease = |t| {
            calls.set(calls.get() + 1);
            return t;
        };
        let mut out = [7.0];
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            write_easing_samples(&mut out, &ease, 0);
        }))
        .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::Error);
        assert_eq!(
            error.message,
            "createEasingSamples: count must be a finite integer >= 1"
        );
        assert_eq!(calls.get(), 0);
        assert_eq!(out, [7.0]);
    }
}
