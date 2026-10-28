use flight_velocity::contract::*;

mod get_velocity_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_velocity_reason_string(VelocityReason::NoSample),
            "no-sample"
        );
        assert_eq!(get_velocity_reason_string(VelocityReason::Stale), "stale");
        assert_eq!(
            get_velocity_reason_string(VelocityReason::ExplicitZero),
            "explicit-zero"
        );
        assert_eq!(
            get_velocity_reason_string(VelocityReason::DerivedZero),
            "derived-zero"
        );
        assert_eq!(get_velocity_reason_string(VelocityReason::Ok), "ok");
    }
}

mod parse_velocity_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_velocity_reason("no-sample"),
            Some(VelocityReason::NoSample)
        );
        assert_eq!(parse_velocity_reason("stale"), Some(VelocityReason::Stale));
        assert_eq!(
            parse_velocity_reason("explicit-zero"),
            Some(VelocityReason::ExplicitZero)
        );
        assert_eq!(
            parse_velocity_reason("derived-zero"),
            Some(VelocityReason::DerivedZero)
        );
        assert_eq!(parse_velocity_reason("ok"), Some(VelocityReason::Ok));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_velocity_reason("OK"), None);
        assert_eq!(parse_velocity_reason("no_sample"), None);
        assert_eq!(parse_velocity_reason(""), None);
    }
}
