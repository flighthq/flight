use flight_entity::*;

fn panic_payload(run: impl FnOnce() + std::panic::UnwindSafe) -> FlightError {
    let payload = std::panic::catch_unwind(run).expect_err("the call must panic");
    return match payload.downcast::<FlightError>() {
        Ok(error) => *error,
        Err(_) => panic!("panic payload must be a FlightError"),
    };
}

mod get_flight_error_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_class_names() {
        assert_eq!(get_flight_error_kind_string(FlightErrorKind::Error), "Error");
        assert_eq!(
            get_flight_error_kind_string(FlightErrorKind::RangeError),
            "RangeError"
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
        assert_eq!(parse_flight_error_kind("Error"), Some(FlightErrorKind::Error));
        assert_eq!(
            parse_flight_error_kind("RangeError"),
            Some(FlightErrorKind::RangeError)
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

mod throw_type_error {
    use super::*;

    #[test]
    fn panics_with_the_type_error_kind_and_message() {
        let error = panic_payload(|| throw_type_error("expected a number"));
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(error.message, "expected a number");
    }
}
