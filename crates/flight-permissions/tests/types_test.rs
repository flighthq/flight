use flight_permissions::contract::*;

mod get_permission_query_failure_reason_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        assert_eq!(
            get_permission_query_failure_reason_string(
                PermissionQueryFailureReason::OperationFailed
            ),
            "operation-failed"
        );
        assert_eq!(
            get_permission_query_failure_reason_string(
                PermissionQueryFailureReason::RuntimeUnavailable
            ),
            "runtime-unavailable"
        );
        assert_eq!(
            get_permission_query_failure_reason_string(PermissionQueryFailureReason::Unsupported),
            "unsupported"
        );
    }
}

mod get_permission_query_reason_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        let cases = [
            (PermissionQueryReason::BestEffort, "best-effort"),
            (PermissionQueryReason::Ok, "ok"),
            (PermissionQueryReason::OperationFailed, "operation-failed"),
            (
                PermissionQueryReason::RuntimeUnavailable,
                "runtime-unavailable",
            ),
            (PermissionQueryReason::Unsupported, "unsupported"),
        ];
        for (value, expected) in cases {
            assert_eq!(get_permission_query_reason_string(value), expected);
        }
    }
}

mod get_permission_request_failure_reason_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        let cases = [
            (
                PermissionRequestFailureReason::NoRequestRoute,
                "no-request-route",
            ),
            (
                PermissionRequestFailureReason::OperationFailed,
                "operation-failed",
            ),
            (
                PermissionRequestFailureReason::RuntimeUnavailable,
                "runtime-unavailable",
            ),
            (PermissionRequestFailureReason::Timeout, "timeout"),
            (PermissionRequestFailureReason::Unsupported, "unsupported"),
        ];
        for (value, expected) in cases {
            assert_eq!(
                get_permission_request_failure_reason_string(value),
                expected
            );
        }
    }
}

mod get_permission_request_reason_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        let cases = [
            (PermissionRequestReason::BestEffort, "best-effort"),
            (PermissionRequestReason::CleanupFailed, "cleanup-failed"),
            (PermissionRequestReason::Denied, "denied"),
            (PermissionRequestReason::Dismissed, "dismissed"),
            (PermissionRequestReason::Granted, "granted"),
            (PermissionRequestReason::NoRequestRoute, "no-request-route"),
            (PermissionRequestReason::OperationFailed, "operation-failed"),
            (
                PermissionRequestReason::RuntimeUnavailable,
                "runtime-unavailable",
            ),
            (PermissionRequestReason::Timeout, "timeout"),
            (PermissionRequestReason::Unsupported, "unsupported"),
        ];
        for (value, expected) in cases {
            assert_eq!(get_permission_request_reason_string(value), expected);
        }
    }
}

mod get_permission_state_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        assert_eq!(
            get_permission_state_string(PermissionState::Denied),
            "denied"
        );
        assert_eq!(
            get_permission_state_string(PermissionState::Granted),
            "granted"
        );
        assert_eq!(
            get_permission_state_string(PermissionState::Prompt),
            "prompt"
        );
    }
}

mod get_storage_persistence_outcome_reason_string {
    use super::*;

    #[test]
    fn returns_every_canonical_value() {
        assert_eq!(
            get_storage_persistence_outcome_reason_string(
                StoragePersistenceOutcomeReason::BestEffort
            ),
            "best-effort"
        );
        assert_eq!(
            get_storage_persistence_outcome_reason_string(
                StoragePersistenceOutcomeReason::OperationFailed
            ),
            "operation-failed"
        );
        assert_eq!(
            get_storage_persistence_outcome_reason_string(
                StoragePersistenceOutcomeReason::Persistent
            ),
            "persistent"
        );
    }
}

mod parse_permission_query_failure_reason {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            PermissionQueryFailureReason::OperationFailed,
            PermissionQueryFailureReason::RuntimeUnavailable,
            PermissionQueryFailureReason::Unsupported,
        ] {
            assert_eq!(
                parse_permission_query_failure_reason(get_permission_query_failure_reason_string(
                    value
                )),
                Some(value)
            );
        }
        assert_eq!(parse_permission_query_failure_reason("other"), None);
    }
}

mod parse_permission_query_reason {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            PermissionQueryReason::BestEffort,
            PermissionQueryReason::Ok,
            PermissionQueryReason::OperationFailed,
            PermissionQueryReason::RuntimeUnavailable,
            PermissionQueryReason::Unsupported,
        ] {
            assert_eq!(
                parse_permission_query_reason(get_permission_query_reason_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_permission_query_reason("other"), None);
    }
}

mod parse_permission_request_failure_reason {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            PermissionRequestFailureReason::NoRequestRoute,
            PermissionRequestFailureReason::OperationFailed,
            PermissionRequestFailureReason::RuntimeUnavailable,
            PermissionRequestFailureReason::Timeout,
            PermissionRequestFailureReason::Unsupported,
        ] {
            assert_eq!(
                parse_permission_request_failure_reason(
                    get_permission_request_failure_reason_string(value)
                ),
                Some(value)
            );
        }
        assert_eq!(parse_permission_request_failure_reason("other"), None);
    }
}

mod parse_permission_request_reason {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            PermissionRequestReason::BestEffort,
            PermissionRequestReason::CleanupFailed,
            PermissionRequestReason::Denied,
            PermissionRequestReason::Dismissed,
            PermissionRequestReason::Granted,
            PermissionRequestReason::NoRequestRoute,
            PermissionRequestReason::OperationFailed,
            PermissionRequestReason::RuntimeUnavailable,
            PermissionRequestReason::Timeout,
            PermissionRequestReason::Unsupported,
        ] {
            assert_eq!(
                parse_permission_request_reason(get_permission_request_reason_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_permission_request_reason("other"), None);
    }
}

mod parse_permission_state {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            PermissionState::Denied,
            PermissionState::Granted,
            PermissionState::Prompt,
        ] {
            assert_eq!(
                parse_permission_state(get_permission_state_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_permission_state("other"), None);
    }
}

mod parse_storage_persistence_outcome_reason {
    use super::*;

    #[test]
    fn parses_all_values_and_rejects_unknown_text() {
        for value in [
            StoragePersistenceOutcomeReason::BestEffort,
            StoragePersistenceOutcomeReason::OperationFailed,
            StoragePersistenceOutcomeReason::Persistent,
        ] {
            assert_eq!(
                parse_storage_persistence_outcome_reason(
                    get_storage_persistence_outcome_reason_string(value)
                ),
                Some(value)
            );
        }
        assert_eq!(parse_storage_persistence_outcome_reason("other"), None);
    }
}
