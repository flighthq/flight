use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn notification_cancel_reason_parse_delegates() {
        let method = NotificationCancelReason::parse("ok");
        let free = parse_notification_cancel_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_cancel_reason_to_string_delegates() {
        let method = NotificationCancelReason::Ok.to_str();
        let free = get_notification_cancel_reason_string(NotificationCancelReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_close_reason_parse_delegates() {
        let method = NotificationCloseReason::parse("ok");
        let free = parse_notification_close_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_close_reason_to_string_delegates() {
        let method = NotificationCloseReason::Ok.to_str();
        let free = get_notification_close_reason_string(NotificationCloseReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_delivery_reason_parse_delegates() {
        let method = NotificationDeliveryReason::parse("accepted");
        let free = parse_notification_delivery_reason("accepted");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_delivery_reason_to_string_delegates() {
        let method = NotificationDeliveryReason::Accepted.to_str();
        let free = get_notification_delivery_reason_string(NotificationDeliveryReason::Accepted);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_direction_parse_delegates() {
        let method = NotificationDirection::parse("auto");
        let free = parse_notification_direction("auto");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_direction_to_string_delegates() {
        let method = NotificationDirection::Auto.to_str();
        let free = get_notification_direction_string(NotificationDirection::Auto);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_event_release_reason_parse_delegates() {
        let method = NotificationEventReleaseReason::parse("ok");
        let free = parse_notification_event_release_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_event_release_reason_to_string_delegates() {
        let method = NotificationEventReleaseReason::Ok.to_str();
        let free = get_notification_event_release_reason_string(NotificationEventReleaseReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_lifecycle_failure_operation_parse_delegates() {
        let method = NotificationLifecycleFailureOperation::parse("close");
        let free = parse_notification_lifecycle_failure_operation("close");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_lifecycle_failure_operation_to_string_delegates() {
        let method = NotificationLifecycleFailureOperation::Close.to_str();
        let free = get_notification_lifecycle_failure_operation_string(NotificationLifecycleFailureOperation::Close);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_lifecycle_reason_parse_delegates() {
        let method = NotificationLifecycleReason::parse("ok");
        let free = parse_notification_lifecycle_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_lifecycle_reason_to_string_delegates() {
        let method = NotificationLifecycleReason::Ok.to_str();
        let free = get_notification_lifecycle_reason_string(NotificationLifecycleReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_permission_parse_delegates() {
        let method = NotificationPermission::parse("granted");
        let free = parse_notification_permission("granted");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_permission_request_reason_parse_delegates() {
        let method = NotificationPermissionRequestReason::parse("denied");
        let free = parse_notification_permission_request_reason("denied");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_permission_request_reason_to_string_delegates() {
        let method = NotificationPermissionRequestReason::Denied.to_str();
        let free = get_notification_permission_request_reason_string(NotificationPermissionRequestReason::Denied);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_permission_to_string_delegates() {
        let method = NotificationPermission::Granted.to_str();
        let free = get_notification_permission_string(NotificationPermission::Granted);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_precision_parse_delegates() {
        let method = NotificationSchedulePrecision::parse("exact");
        let free = parse_notification_schedule_precision("exact");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_precision_to_string_delegates() {
        let method = NotificationSchedulePrecision::Exact.to_str();
        let free = get_notification_schedule_precision_string(NotificationSchedulePrecision::Exact);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_reason_parse_delegates() {
        let method = NotificationScheduleReason::parse("scheduled");
        let free = parse_notification_schedule_reason("scheduled");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_reason_to_string_delegates() {
        let method = NotificationScheduleReason::Scheduled.to_str();
        let free = get_notification_schedule_reason_string(NotificationScheduleReason::Scheduled);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_repeat_parse_delegates() {
        let method = NotificationScheduleRepeat::parse("day");
        let free = parse_notification_schedule_repeat("day");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_schedule_repeat_to_string_delegates() {
        let method = NotificationScheduleRepeat::Day.to_str();
        let free = get_notification_schedule_repeat_string(NotificationScheduleRepeat::Day);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_attach_reason_parse_delegates() {
        let method = NotificationSubscriptionAttachReason::parse("ok");
        let free = parse_notification_subscription_attach_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_attach_reason_to_string_delegates() {
        let method = NotificationSubscriptionAttachReason::Ok.to_str();
        let free = get_notification_subscription_attach_reason_string(NotificationSubscriptionAttachReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_detach_reason_parse_delegates() {
        let method = NotificationSubscriptionDetachReason::parse("ok");
        let free = parse_notification_subscription_detach_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_detach_reason_to_string_delegates() {
        let method = NotificationSubscriptionDetachReason::Ok.to_str();
        let free = get_notification_subscription_detach_reason_string(NotificationSubscriptionDetachReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_dispose_reason_parse_delegates() {
        let method = NotificationSubscriptionDisposeReason::parse("ok");
        let free = parse_notification_subscription_dispose_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn notification_subscription_dispose_reason_to_string_delegates() {
        let method = NotificationSubscriptionDisposeReason::Ok.to_str();
        let free = get_notification_subscription_dispose_reason_string(NotificationSubscriptionDisposeReason::Ok);
        assert_eq!(method, free);
    }
}

// NotificationCancelReason

impl NotificationCancelReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_cancel_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_cancel_reason_string(self);
    }
}

// NotificationCloseReason

impl NotificationCloseReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_close_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_close_reason_string(self);
    }
}

// NotificationDeliveryReason

impl NotificationDeliveryReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_delivery_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_delivery_reason_string(self);
    }
}

// NotificationDirection

impl NotificationDirection {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_direction(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_direction_string(self);
    }
}

// NotificationEventReleaseReason

impl NotificationEventReleaseReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_event_release_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_event_release_reason_string(self);
    }
}

// NotificationLifecycleFailureOperation

impl NotificationLifecycleFailureOperation {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_lifecycle_failure_operation(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_lifecycle_failure_operation_string(self);
    }
}

// NotificationLifecycleReason

impl NotificationLifecycleReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_lifecycle_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_lifecycle_reason_string(self);
    }
}

// NotificationPermission

impl NotificationPermission {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_permission(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_permission_string(self);
    }
}

// NotificationPermissionRequestReason

impl NotificationPermissionRequestReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_permission_request_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_permission_request_reason_string(self);
    }
}

// NotificationSchedulePrecision

impl NotificationSchedulePrecision {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_schedule_precision(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_schedule_precision_string(self);
    }
}

// NotificationScheduleReason

impl NotificationScheduleReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_schedule_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_schedule_reason_string(self);
    }
}

// NotificationScheduleRepeat

impl NotificationScheduleRepeat {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_schedule_repeat(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_schedule_repeat_string(self);
    }
}

// NotificationSubscriptionAttachReason

impl NotificationSubscriptionAttachReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_subscription_attach_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_subscription_attach_reason_string(self);
    }
}

// NotificationSubscriptionDetachReason

impl NotificationSubscriptionDetachReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_subscription_detach_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_subscription_detach_reason_string(self);
    }
}

// NotificationSubscriptionDisposeReason

impl NotificationSubscriptionDisposeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_notification_subscription_dispose_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_notification_subscription_dispose_reason_string(self);
    }
}
