use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::Arc;

    fn scheduled_of(
        id: &str,
        request: &NotificationRequest,
        schedule: &NotificationSchedule,
    ) -> ScheduledNotification {
        let mut scheduled = create_scheduled_notification_resource();
        scheduled.id = id.to_string();
        scheduled.request = request.clone();
        scheduled.schedule = schedule.clone();
        return scheduled;
    }

    // D23 (B): notification resources are created empty, then given their identity (Principal 21f7557f).
    fn notification_of(id: &str, title: &str, tag: &str) -> Notification {
        let mut notification = create_notification_resource();
        notification.id = id.to_string();
        notification.title = title.to_string();
        notification.tag = tag.to_string();
        return notification;
    }

    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = std::task::Context::from_waker(std::task::Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                std::task::Poll::Ready(value) => return value,
                std::task::Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    fn make_provider() -> ProviderRef {
        return Arc::new(());
    }

    fn make_request(title: &str) -> NotificationRequest {
        return NotificationRequest {
            title: title.to_string(),
            id: None,
            body: None,
            icon: None,
            badge: None,
            tag: None,
            silent: None,
            actions: None,
            dir: None,
            image: None,
            lang: None,
            renotify: None,
            require_interaction: None,
            timestamp: None,
            vibrate: None,
            data: None,
        };
    }

    fn make_schedule(at: f32) -> NotificationSchedule {
        return NotificationSchedule { at, repeat: None };
    }

    // ── String table delegate tests ──

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

    // ── Behavioral entity/capability tests ──

    #[test]
    fn create_notification_resource_populates_all_identity_fields() {
        let notification = notification_of("n1", "Title", "group");
        assert_eq!(notification.id, "n1");
        assert_eq!(notification.title, "Title");
        assert_eq!(notification.tag, "group");
    }

    #[test]
    fn create_scheduled_notification_resource_carries_request_and_schedule() {
        let request = make_request("Later");
        let schedule = make_schedule(5.0);
        let scheduled = scheduled_of("s1", &request, &schedule);
        assert_eq!(scheduled.id, "s1");
        assert_eq!(scheduled.request.title, "Later");
        assert_eq!(scheduled.schedule.at, 5.0);
    }

    #[test]
    fn bind_notification_close_then_close_returns_ok() {
        let notification = notification_of("n1", "Title", "");
        bind_notification_close(&notification, Arc::new(|| Box::pin(async {
            return NotificationCloseOutcome { reason: NotificationCloseReason::Ok };
        })));
        let outcome = block_on(close_notification(&notification));
        assert_eq!(outcome.reason, NotificationCloseReason::Ok);
    }

    #[test]
    fn close_notification_without_bind_returns_operation_failed() {
        let notification = notification_of("n1", "Title", "");
        let outcome = block_on(close_notification(&notification));
        assert_eq!(outcome.reason, NotificationCloseReason::OperationFailed);
    }

    #[test]
    fn close_notification_is_idempotent_after_success() {
        let notification = notification_of("n1", "Title", "");
        bind_notification_close(&notification, Arc::new(|| Box::pin(async {
            return NotificationCloseOutcome { reason: NotificationCloseReason::Ok };
        })));
        let first = block_on(close_notification(&notification));
        assert_eq!(first.reason, NotificationCloseReason::Ok);
        let second = block_on(close_notification(&notification));
        assert_eq!(second.reason, NotificationCloseReason::AlreadyClosed);
    }

    #[test]
    fn bind_scheduled_notification_cancel_then_cancel_returns_ok() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = scheduled_of("s1", &request, &schedule);
        bind_scheduled_notification_cancel(&scheduled, Arc::new(|| Box::pin(async {
            return NotificationCancelOutcome { reason: NotificationCancelReason::Ok };
        })));
        let outcome = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(outcome.reason, NotificationCancelReason::Ok);
    }

    #[test]
    fn cancel_scheduled_notification_without_bind_returns_operation_failed() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = scheduled_of("s1", &request, &schedule);
        let outcome = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(outcome.reason, NotificationCancelReason::OperationFailed);
    }

    #[test]
    fn cancel_scheduled_notification_is_idempotent_after_success() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = scheduled_of("s1", &request, &schedule);
        bind_scheduled_notification_cancel(&scheduled, Arc::new(|| Box::pin(async {
            return NotificationCancelOutcome { reason: NotificationCancelReason::Ok };
        })));
        let first = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(first.reason, NotificationCancelReason::Ok);
        let second = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(second.reason, NotificationCancelReason::AlreadyCancelled);
    }

    #[test]
    fn close_all_notifications_delegates_to_host_capability() {
        let provider = make_provider();
        let cap = HostNotificationCloseCapability {
            close_all_notifications: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    failures: None,
                };
            })),
            provider,
        };
        let outcome = block_on(close_all_notifications(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
    }

    #[test]
    fn destroy_notification_capabilities_delegates_to_host_capability() {
        let provider = make_provider();
        let cap = HostNotificationLifecycleCapability {
            destroy: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    failures: None,
                };
            })),
            provider,
        };
        let outcome = block_on(destroy_notification_capabilities(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
    }

    #[test]
    fn show_notification_returns_provider_outcome() {
        let notification = notification_of("shown", "Title", "");
        let notification_clone = notification.clone();
        let provider = make_provider();
        let cap = HostNotificationDeliveryCapability {
            notify: Arc::new(move |_request: &NotificationRequest| -> NotificationDeliveryFuture {
                let n = notification_clone.clone();
                return Box::pin(async move {
                    return NotificationDeliveryOutcome {
                        reason: NotificationDeliveryReason::Accepted,
                        notification: Some(n),
                        fields: None,
                    };
                });
            }),
            provider,
        };
        let request = make_request("Title");
        let outcome = block_on(show_notification(&cap, &request));
        assert_eq!(outcome.reason, NotificationDeliveryReason::Accepted);
        assert!(outcome.notification.is_some());
    }

    #[test]
    fn schedule_notification_returns_provider_outcome() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = scheduled_of("s1", &request, &schedule);
        let scheduled_clone = scheduled.clone();
        let provider = make_provider();
        let cap = HostNotificationSchedulingCapability {
            cancel_all_scheduled_notifications: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome { reason: NotificationLifecycleReason::Ok, failures: None };
            })),
            get_pending_notifications: Arc::new(|| Box::pin(async {
                return NotificationPendingListOutcome { reason: NotificationLifecycleReason::Ok, notifications: Some(vec![]) };
            })),
            schedule_notification: Arc::new(move |_request: &NotificationRequest, _schedule: &NotificationSchedule| -> NotificationScheduleFuture {
                let s = scheduled_clone.clone();
                return Box::pin(async move {
                    return NotificationScheduleOutcome {
                        reason: NotificationScheduleReason::Scheduled,
                        precision: Some(NotificationSchedulePrecision::Exact),
                        scheduled: Some(s),
                        fields: None,
                    };
                });
            }),
            provider,
        };
        let outcome = block_on(schedule_notification(&cap, &request, &schedule));
        assert_eq!(outcome.reason, NotificationScheduleReason::Scheduled);
    }

    #[test]
    fn get_notification_permission_returns_provider_outcome() {
        let provider = make_provider();
        let cap = HostNotificationPermissionCapability {
            get_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionQueryOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    permission: Some(NotificationPermission::Granted),
                };
            })),
            request_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionRequestOutcome {
                    reason: NotificationPermissionRequestReason::Granted,
                };
            })),
            provider,
        };
        let outcome = block_on(get_notification_permission(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
        assert_eq!(outcome.permission, Some(NotificationPermission::Granted));
    }

    #[test]
    fn request_notification_permission_returns_provider_outcome() {
        let provider = make_provider();
        let cap = HostNotificationPermissionCapability {
            get_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionQueryOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    permission: Some(NotificationPermission::Default),
                };
            })),
            request_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionRequestOutcome {
                    reason: NotificationPermissionRequestReason::Granted,
                };
            })),
            provider,
        };
        let outcome = block_on(request_notification_permission(&cap));
        assert_eq!(outcome.reason, NotificationPermissionRequestReason::Granted);
    }

    #[test]
    fn get_active_notifications_returns_provider_outcome() {
        let provider = make_provider();
        let cap = HostNotificationActiveListCapability {
            get_active_notifications: Arc::new(|| Box::pin(async {
                return NotificationActiveListOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    notifications: Some(vec![]),
                };
            })),
            provider,
        };
        let outcome = block_on(get_active_notifications(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
        assert_eq!(outcome.notifications.as_ref().unwrap().len(), 0);
    }

    #[test]
    fn get_pending_notifications_returns_provider_outcome() {
        let provider = make_provider();
        let cap = HostNotificationSchedulingCapability {
            cancel_all_scheduled_notifications: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome { reason: NotificationLifecycleReason::Ok, failures: None };
            })),
            get_pending_notifications: Arc::new(|| Box::pin(async {
                return NotificationPendingListOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    notifications: Some(vec![]),
                };
            })),
            schedule_notification: Arc::new(|_request: &NotificationRequest, _schedule: &NotificationSchedule| -> NotificationScheduleFuture {
                return Box::pin(async {
                    return NotificationScheduleOutcome { reason: NotificationScheduleReason::OperationFailed, precision: None, scheduled: None, fields: None };
                });
            }),
            provider,
        };
        let outcome = block_on(get_pending_notifications(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
    }

    #[test]
    fn create_and_attach_click_subscription_returns_ok() {
        let provider = make_provider();
        let cap = HostNotificationClickCapability {
            attach: Arc::new(move |_listener: NotificationClickListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: Some(NotificationEventAttachment {
                            release: Arc::new(|| Box::pin(async {
                                return NotificationEventReleaseOutcome { reason: NotificationEventReleaseReason::Ok };
                            })),
                        }),
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_click_subscription();
        let outcome = block_on(attach_notification_click_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
    }

    #[test]
    fn detach_before_attach_returns_not_attached() {
        let subscription = create_notification_click_subscription();
        let outcome = block_on(detach_notification_click_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }

    #[test]
    fn dispose_subscription_is_terminal_and_idempotent() {
        let subscription = create_notification_click_subscription();
        let first = block_on(dispose_notification_click_subscription(&subscription));
        assert_eq!(first.reason, NotificationSubscriptionDisposeReason::Ok);
        let second = block_on(dispose_notification_click_subscription(&subscription));
        assert_eq!(second.reason, NotificationSubscriptionDisposeReason::AlreadyDisposed);
    }

    #[test]
    fn attach_after_dispose_returns_operation_failed() {
        let provider = make_provider();
        let cap = HostNotificationClickCapability {
            attach: Arc::new(move |_listener: NotificationClickListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: None,
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_click_subscription();
        let _dispose = block_on(dispose_notification_click_subscription(&subscription));
        let outcome = block_on(attach_notification_click_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::OperationFailed);
    }

    #[test]
    fn initialize_notification_resource_resets_fields_on_preallocated_entity() {
        let mut out: Notification = flight_entity::allocate_entity();
        out.id = "n1".to_string();
        out.title = "Title".to_string();
        out.tag = "tag".to_string();
        initialize_notification_resource(&mut out);
        assert_eq!(
            (out.id.as_str(), out.title.as_str(), out.tag.as_str()),
            ("", "", "")
        );
    }

    #[test]
    fn initialize_scheduled_notification_resource_resets_fields_on_preallocated_entity() {
        let request = make_request("Later");
        let schedule = make_schedule(2.0);
        let mut out: ScheduledNotification = flight_entity::allocate_entity();
        out.id = "s1".to_string();
        out.request = request.clone();
        out.schedule = schedule.clone();
        initialize_scheduled_notification_resource(&mut out);
        assert_eq!(out.id, "");
        assert_eq!(out.request.title, "");
        assert!(out.request.body.is_none() && out.request.actions.is_none());
        assert_eq!(out.schedule.at, 0.0);
        assert!(out.schedule.repeat.is_none());
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
