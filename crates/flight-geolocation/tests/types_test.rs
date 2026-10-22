use flight_geolocation::*;

mod get_geolocation_access_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::CleanupFailed
            ),
            "cleanup-failed"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::Denied
            ),
            "denied"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::Dismissed
            ),
            "dismissed"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::Granted
            ),
            "granted"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::OperationFailed
            ),
            "operation-failed"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::RuntimeUnavailable
            ),
            "runtime-unavailable"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_access_reason_string(
                GeolocationAccessReason::Timeout
            ),
            "timeout"
        );
    }
}

mod get_geolocation_error_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            flight_geolocation::get_geolocation_error_reason_string(GeolocationErrorReason::Denied),
            "denied"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_error_reason_string(
                GeolocationErrorReason::Timeout
            ),
            "timeout"
        );
        assert_eq!(
            flight_geolocation::get_geolocation_error_reason_string(
                GeolocationErrorReason::Unavailable
            ),
            "unavailable"
        );
    }
}

mod parse_geolocation_access_reason {
    use super::*;

    #[test]
    fn parses_every_source_string_and_rejects_unknown_values() {
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("cleanup-failed"),
            Some(GeolocationAccessReason::CleanupFailed)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("denied"),
            Some(GeolocationAccessReason::Denied)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("dismissed"),
            Some(GeolocationAccessReason::Dismissed)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("granted"),
            Some(GeolocationAccessReason::Granted)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("operation-failed"),
            Some(GeolocationAccessReason::OperationFailed)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("runtime-unavailable"),
            Some(GeolocationAccessReason::RuntimeUnavailable)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("timeout"),
            Some(GeolocationAccessReason::Timeout)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_access_reason("unknown"),
            None
        );
    }
}

mod parse_geolocation_error_reason {
    use super::*;

    #[test]
    fn parses_every_source_string_and_rejects_unknown_values() {
        assert_eq!(
            flight_geolocation::parse_geolocation_error_reason("denied"),
            Some(GeolocationErrorReason::Denied)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_error_reason("timeout"),
            Some(GeolocationErrorReason::Timeout)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_error_reason("unavailable"),
            Some(GeolocationErrorReason::Unavailable)
        );
        assert_eq!(
            flight_geolocation::parse_geolocation_error_reason("unknown"),
            None
        );
    }
}
