use flight_easing::*;
use flight_entity::{FlightError, FlightErrorKind};

mod write_easing_samples_native {
    use super::*;

    #[test]
    fn writes_entire_required_output_without_replacing_storage() {
        let mut out = [-7.0_f32; 5];
        let storage = out.as_ptr();
        write_easing_samples(&mut out, &ease_linear);
        assert_eq!(out.as_ptr(), storage);
        assert_eq!(out.len(), 5);
        assert_eq!(out, [0.0, 0.25, 0.5, 0.75, 1.0]);
    }

    #[test]
    fn rejects_empty_output_before_invoking_callback() {
        let calls = std::cell::Cell::new(0);
        let ease = |t| {
            calls.set(calls.get() + 1);
            return t;
        };
        let mut out = [];
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            write_easing_samples(&mut out, &ease);
        }))
        .unwrap_err();
        let error = error.downcast_ref::<FlightError>().unwrap();
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(
            error.message,
            "createEasingSamples: count must be a finite integer >= 1"
        );
        assert_eq!(calls.get(), 0);
        assert!(out.is_empty());
    }
}
