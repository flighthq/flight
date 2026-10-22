use flight_notification::*;

mod get_notification_cancel_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (
                NotificationCancelReason::AlreadyCancelled,
                "already-cancelled",
            ),
            (NotificationCancelReason::Ok, "ok"),
            (
                NotificationCancelReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_cancel_reason_string(variant), expected);
            assert_eq!(parse_notification_cancel_reason(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_cancel_reason("bogus"), None);
    }
}

mod get_notification_close_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationCloseReason::AlreadyClosed, "already-closed"),
            (NotificationCloseReason::Ok, "ok"),
            (NotificationCloseReason::OperationFailed, "operation-failed"),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_close_reason_string(variant), expected);
            assert_eq!(parse_notification_close_reason(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_close_reason("bogus"), None);
    }
}

mod get_notification_delivery_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationDeliveryReason::Accepted, "accepted"),
            (
                NotificationDeliveryReason::InvalidRequest,
                "invalid-request",
            ),
            (
                NotificationDeliveryReason::OperationFailed,
                "operation-failed",
            ),
            (
                NotificationDeliveryReason::PermissionDenied,
                "permission-denied",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_delivery_reason_string(variant), expected);
            assert_eq!(parse_notification_delivery_reason(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_delivery_reason("bogus"), None);
    }
}

mod get_notification_direction_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationDirection::Auto, "auto"),
            (NotificationDirection::Ltr, "ltr"),
            (NotificationDirection::Rtl, "rtl"),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_direction_string(variant), expected);
            assert_eq!(parse_notification_direction(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_direction("bogus"), None);
    }
}

mod get_notification_event_release_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationEventReleaseReason::Ok, "ok"),
            (
                NotificationEventReleaseReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_event_release_reason_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_event_release_reason(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_event_release_reason("bogus"), None);
    }
}

mod get_notification_lifecycle_failure_operation_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationLifecycleFailureOperation::Cancel, "cancel"),
            (NotificationLifecycleFailureOperation::Close, "close"),
            (NotificationLifecycleFailureOperation::Release, "release"),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_lifecycle_failure_operation_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_lifecycle_failure_operation(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_lifecycle_failure_operation("bogus"),
            None
        );
    }
}

mod get_notification_lifecycle_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (
                NotificationLifecycleReason::AlreadyDestroyed,
                "already-destroyed",
            ),
            (NotificationLifecycleReason::Ok, "ok"),
            (
                NotificationLifecycleReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_lifecycle_reason_string(variant), expected);
            assert_eq!(parse_notification_lifecycle_reason(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_lifecycle_reason("bogus"), None);
    }
}

mod get_notification_permission_request_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationPermissionRequestReason::Denied, "denied"),
            (NotificationPermissionRequestReason::Dismissed, "dismissed"),
            (NotificationPermissionRequestReason::Granted, "granted"),
            (
                NotificationPermissionRequestReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_permission_request_reason_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_permission_request_reason(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_permission_request_reason("bogus"), None);
    }
}

mod get_notification_permission_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationPermission::Default, "default"),
            (NotificationPermission::Denied, "denied"),
            (NotificationPermission::Granted, "granted"),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_permission_string(variant), expected);
            assert_eq!(parse_notification_permission(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_permission("bogus"), None);
    }
}

mod get_notification_schedule_precision_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationSchedulePrecision::Exact, "exact"),
            (NotificationSchedulePrecision::Inexact, "inexact"),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_schedule_precision_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_schedule_precision(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_precision("bogus"), None);
    }
}

mod get_notification_schedule_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (
                NotificationScheduleReason::InvalidSchedule,
                "invalid-schedule",
            ),
            (
                NotificationScheduleReason::OperationFailed,
                "operation-failed",
            ),
            (
                NotificationScheduleReason::PermissionDenied,
                "permission-denied",
            ),
            (NotificationScheduleReason::Scheduled, "scheduled"),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_schedule_reason_string(variant), expected);
            assert_eq!(parse_notification_schedule_reason(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_reason("bogus"), None);
    }
}

mod get_notification_schedule_repeat_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationScheduleRepeat::Day, "day"),
            (NotificationScheduleRepeat::Hour, "hour"),
            (NotificationScheduleRepeat::Minute, "minute"),
            (NotificationScheduleRepeat::Month, "month"),
            (NotificationScheduleRepeat::Week, "week"),
            (NotificationScheduleRepeat::Year, "year"),
        ];
        for (variant, expected) in variants {
            assert_eq!(get_notification_schedule_repeat_string(variant), expected);
            assert_eq!(parse_notification_schedule_repeat(expected), Some(variant));
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_repeat("bogus"), None);
    }
}

mod get_notification_subscription_attach_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (NotificationSubscriptionAttachReason::Ok, "ok"),
            (
                NotificationSubscriptionAttachReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_subscription_attach_reason_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_subscription_attach_reason(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_subscription_attach_reason("bogus"), None);
    }
}

mod get_notification_subscription_detach_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (
                NotificationSubscriptionDetachReason::NotAttached,
                "not-attached",
            ),
            (NotificationSubscriptionDetachReason::Ok, "ok"),
            (
                NotificationSubscriptionDetachReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_subscription_detach_reason_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_subscription_detach_reason(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_subscription_detach_reason("bogus"), None);
    }
}

mod get_notification_subscription_dispose_reason_string {
    use super::*;

    #[test]
    fn round_trips_every_variant() {
        let variants = [
            (
                NotificationSubscriptionDisposeReason::AlreadyDisposed,
                "already-disposed",
            ),
            (NotificationSubscriptionDisposeReason::Ok, "ok"),
            (
                NotificationSubscriptionDisposeReason::OperationFailed,
                "operation-failed",
            ),
        ];
        for (variant, expected) in variants {
            assert_eq!(
                get_notification_subscription_dispose_reason_string(variant),
                expected
            );
            assert_eq!(
                parse_notification_subscription_dispose_reason(expected),
                Some(variant)
            );
        }
    }

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_subscription_dispose_reason("bogus"),
            None
        );
    }
}

mod parse_notification_cancel_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_cancel_reason("unknown"), None);
    }
}

mod parse_notification_close_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_close_reason("unknown"), None);
    }
}

mod parse_notification_delivery_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_delivery_reason("unknown"), None);
    }
}

mod parse_notification_direction {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_direction("unknown"), None);
    }
}

mod parse_notification_event_release_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_event_release_reason("unknown"), None);
    }
}

mod parse_notification_lifecycle_failure_operation {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_lifecycle_failure_operation("unknown"),
            None
        );
    }
}

mod parse_notification_lifecycle_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_lifecycle_reason("unknown"), None);
    }
}

mod parse_notification_permission {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_permission("unknown"), None);
    }
}

mod parse_notification_permission_request_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_permission_request_reason("unknown"),
            None
        );
    }
}

mod parse_notification_schedule_precision {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_precision("unknown"), None);
    }
}

mod parse_notification_schedule_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_reason("unknown"), None);
    }
}

mod parse_notification_schedule_repeat {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(parse_notification_schedule_repeat("unknown"), None);
    }
}

mod parse_notification_subscription_attach_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_subscription_attach_reason("unknown"),
            None
        );
    }
}

mod parse_notification_subscription_detach_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_subscription_detach_reason("unknown"),
            None
        );
    }
}

mod parse_notification_subscription_dispose_reason {
    use super::*;

    #[test]
    fn returns_none_for_unknown_string() {
        assert_eq!(
            parse_notification_subscription_dispose_reason("unknown"),
            None
        );
    }
}
