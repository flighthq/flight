//! flight-compiler: rust-only
//! Rust-only because typed panic payload behavior has no emitted Entity package API.

use flight_entity::*;

use std::cell::Cell;
use std::sync::Arc;

struct SendOnlyPayload {
    marker: Arc<()>,
    value: Cell<u32>,
}

fn panic_payload(run: impl FnOnce() + std::panic::UnwindSafe) -> FlightError {
    let payload = std::panic::catch_unwind(run).expect_err("the call must panic");
    return match payload.downcast::<FlightError>() {
        Ok(error) => *error,
        Err(_) => panic!("panic payload must be a FlightError"),
    };
}

mod get_caught_panic_payload {
    use super::*;

    #[test]
    fn exposes_the_original_send_only_payload_under_a_guard() {
        let marker = Arc::new(());
        let unknown = unknown_from_panic(Box::new(SendOnlyPayload {
            marker: marker.clone(),
            value: Cell::new(37),
        }));
        let caught = unknown
            .as_ref()
            .unwrap()
            .downcast_ref::<CaughtPanic>()
            .unwrap();
        let payload = get_caught_panic_payload(caught);
        let retained = payload.downcast_ref::<SendOnlyPayload>().unwrap();

        assert_eq!(retained.value.get(), 37);
        assert!(Arc::ptr_eq(&retained.marker, &marker));
    }
}

mod get_flight_error_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_class_names() {
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::Error),
            "Error"
        );
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::NotReadableError),
            "NotReadableError"
        );
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::NotSupportedError),
            "NotSupportedError"
        );
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::RangeError),
            "RangeError"
        );
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::SyntaxError),
            "SyntaxError"
        );
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::TypeError),
            "TypeError"
        );
    }
}

mod parse_flight_error_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_class_names() {
        assert_eq!(
            parse_flight_error_kind("Error"),
            Some(FlightErrorKind::Error)
        );
        assert_eq!(
            parse_flight_error_kind("NotReadableError"),
            Some(FlightErrorKind::NotReadableError)
        );
        assert_eq!(
            parse_flight_error_kind("NotSupportedError"),
            Some(FlightErrorKind::NotSupportedError)
        );
        assert_eq!(
            parse_flight_error_kind("RangeError"),
            Some(FlightErrorKind::RangeError)
        );
        assert_eq!(
            parse_flight_error_kind("SyntaxError"),
            Some(FlightErrorKind::SyntaxError)
        );
        assert_eq!(
            parse_flight_error_kind("TypeError"),
            Some(FlightErrorKind::TypeError)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_flight_error_kind("error"), None);
        assert_eq!(parse_flight_error_kind("Range Error"), None);
        assert_eq!(parse_flight_error_kind(""), None);
    }
}

mod throw_error {
    use super::*;

    #[test]
    fn panics_with_the_error_kind_and_message() {
        let error = panic_payload(|| throw_error("createEasingSamples: bad count"));
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(error.message, "createEasingSamples: bad count");
    }
}

mod throw_range_error {
    use super::*;

    #[test]
    fn panics_with_the_range_error_kind_and_message() {
        let error = panic_payload(|| throw_range_error("index out of range"));
        assert_eq!(error.kind, FlightErrorKind::RangeError);
        assert_eq!(error.message, "index out of range");
    }
}

mod throw_syntax_error {
    use super::*;

    #[test]
    fn panics_with_the_syntax_error_kind_and_message() {
        let error = panic_payload(|| throw_syntax_error("invalid regular expression"));
        assert_eq!(error.kind, FlightErrorKind::SyntaxError);
        assert_eq!(error.message, "invalid regular expression");
    }
}

mod throw_type_error {
    use super::*;

    #[test]
    fn panics_with_the_type_error_kind_and_message() {
        let error = panic_payload(|| throw_type_error("expected a number"));
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(error.message, "expected a number");
    }
}

mod unknown_from_panic {
    use super::*;

    #[test]
    fn preserves_flight_error_as_the_concrete_unknown_value() {
        let unknown = unknown_from_panic(Box::new(FlightError {
            kind: FlightErrorKind::TypeError,
            message: "invalid value".to_string(),
        }));
        let error = unknown
            .as_ref()
            .unwrap()
            .downcast_ref::<FlightError>()
            .unwrap();

        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(error.message, "invalid value");
        assert!(
            unknown
                .as_ref()
                .unwrap()
                .downcast_ref::<CaughtPanic>()
                .is_none()
        );
    }

    #[test]
    fn preserves_shared_identity_across_unknown_clones() {
        let unknown = unknown_from_panic(Box::new(Cell::new(11_u32)));
        let cloned = unknown.clone();

        assert!(Arc::ptr_eq(
            unknown.as_ref().unwrap(),
            cloned.as_ref().unwrap()
        ));
        let caught = cloned
            .as_ref()
            .unwrap()
            .downcast_ref::<CaughtPanic>()
            .unwrap();
        let payload = get_caught_panic_payload(caught);
        assert_eq!(payload.downcast_ref::<Cell<u32>>().unwrap().get(), 11);
    }
}
