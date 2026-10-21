use std::sync::Arc;

use flight_entity::Entity;
use flight_notification::*;
use crate::block_on;

fn assert_is_entity<T: Entity>(_entity: &T) {}

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

fn make_provider() -> ProviderRef {
    return Arc::new(());
}

fn make_click_backend(
    attach_failure: bool,
    release_failure: bool,
) -> HostNotificationClickCapability {
    let provider = make_provider();
    return HostNotificationClickCapability {
        attach: Arc::new(move |_listener: NotificationClickListener| -> NotificationEventBackendAttachFuture {
            let release_failure = release_failure;
            let attach_failure = attach_failure;
            return Box::pin(async move {
                if attach_failure {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::OperationFailed,
                        attachment: None,
                        release_failed: if release_failure { Some(true) } else { Some(false) },
                    };
                }
                return NotificationEventBackendAttachResult {
                    reason: NotificationSubscriptionAttachReason::Ok,
                    attachment: Some(NotificationEventAttachment {
                        release: Arc::new(move || -> NotificationEventReleaseFuture {
                            let release_failure = release_failure;
                            return Box::pin(async move {
                                if release_failure {
                                    return NotificationEventReleaseOutcome {
                                        reason: NotificationEventReleaseReason::OperationFailed,
                                    };
                                }
                                return NotificationEventReleaseOutcome {
                                    reason: NotificationEventReleaseReason::Ok,
                                };
                            });
                        }),
                    }),
                    release_failed: None,
                };
            });
        }),
        provider,
    };
}

mod attach_notification_action_subscription {
    use super::*;

    #[test]
    fn acquires_the_action_event() {
        let provider = make_provider();
        let cap = HostNotificationActionCapability {
            attach: Arc::new(move |_listener: NotificationActionListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: Some(NotificationEventAttachment {
                            release: Arc::new(|| Box::pin(async {
                                return NotificationEventReleaseOutcome {
                                    reason: NotificationEventReleaseReason::Ok,
                                };
                            })),
                        }),
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_action_subscription();
        let outcome = block_on(attach_notification_action_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
    }
}

mod attach_notification_click_subscription {
    use super::*;

    #[test]
    fn routes_the_provider_entity_and_owns_only_its_acquired_release() {
        let backend = make_click_backend(false, false);
        let subscription = create_notification_click_subscription();
        let outcome = block_on(attach_notification_click_subscription(&backend, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
        let detach_outcome = block_on(detach_notification_click_subscription(&subscription));
        assert_eq!(detach_outcome.reason, NotificationSubscriptionDetachReason::Ok);
    }
}

mod attach_notification_dismiss_subscription {
    use super::*;

    #[test]
    fn acquires_and_releases_the_dismiss_event() {
        let provider = make_provider();
        let cap = HostNotificationDismissCapability {
            attach: Arc::new(move |_listener: NotificationDismissListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: Some(NotificationEventAttachment {
                            release: Arc::new(|| Box::pin(async {
                                return NotificationEventReleaseOutcome {
                                    reason: NotificationEventReleaseReason::Ok,
                                };
                            })),
                        }),
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_dismiss_subscription();
        let outcome = block_on(attach_notification_dismiss_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
        let detach_outcome = block_on(detach_notification_dismiss_subscription(&subscription));
        assert_eq!(detach_outcome.reason, NotificationSubscriptionDetachReason::Ok);
    }
}

mod attach_notification_received_subscription {
    use super::*;

    #[test]
    fn acquires_and_releases_the_received_event() {
        let provider = make_provider();
        let cap = HostNotificationReceivedCapability {
            attach: Arc::new(move |_listener: NotificationReceivedListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: Some(NotificationEventAttachment {
                            release: Arc::new(|| Box::pin(async {
                                return NotificationEventReleaseOutcome {
                                    reason: NotificationEventReleaseReason::Ok,
                                };
                            })),
                        }),
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_received_subscription();
        let outcome = block_on(attach_notification_received_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
        let detach_outcome = block_on(detach_notification_received_subscription(&subscription));
        assert_eq!(detach_outcome.reason, NotificationSubscriptionDetachReason::Ok);
    }
}

mod attach_notification_reply_subscription {
    use super::*;

    #[test]
    fn acquires_and_releases_the_reply_event() {
        let provider = make_provider();
        let cap = HostNotificationReplyCapability {
            attach: Arc::new(move |_listener: NotificationReplyListener| -> NotificationEventBackendAttachFuture {
                return Box::pin(async {
                    return NotificationEventBackendAttachResult {
                        reason: NotificationSubscriptionAttachReason::Ok,
                        attachment: Some(NotificationEventAttachment {
                            release: Arc::new(|| Box::pin(async {
                                return NotificationEventReleaseOutcome {
                                    reason: NotificationEventReleaseReason::Ok,
                                };
                            })),
                        }),
                        release_failed: None,
                    };
                });
            }),
            provider,
        };
        let subscription = create_notification_reply_subscription();
        let outcome = block_on(attach_notification_reply_subscription(&cap, &subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionAttachReason::Ok);
        let detach_outcome = block_on(detach_notification_reply_subscription(&subscription));
        assert_eq!(detach_outcome.reason, NotificationSubscriptionDetachReason::Ok);
    }
}

mod bind_notification_close {
    use super::*;

    #[test]
    fn pins_the_provider_close_operation_to_its_notification_entity() {
        let notification = create_notification_resource("bound", "Bound", "");
        bind_notification_close(&notification, Arc::new(|| Box::pin(async {
            return NotificationCloseOutcome { reason: NotificationCloseReason::Ok };
        })));
        let outcome = block_on(close_notification(&notification));
        assert_eq!(outcome.reason, NotificationCloseReason::Ok);
    }
}

mod bind_scheduled_notification_cancel {
    use super::*;

    #[test]
    fn pins_the_provider_cancel_operation_to_its_scheduled_notification_entity() {
        let request = make_request("Bound");
        let schedule = make_schedule(1.0);
        let scheduled = create_scheduled_notification_resource("bound", &request, &schedule);
        bind_scheduled_notification_cancel(&scheduled, Arc::new(|| Box::pin(async {
            return NotificationCancelOutcome { reason: NotificationCancelReason::Ok };
        })));
        let outcome = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(outcome.reason, NotificationCancelReason::Ok);
    }
}

mod cancel_scheduled_notification {
    use super::*;

    #[test]
    fn uses_only_the_origin_pinned_cancellation_and_is_idempotent() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = create_scheduled_notification_resource("same", &request, &schedule);
        let cancels = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let cancels_clone = cancels.clone();
        bind_scheduled_notification_cancel(&scheduled, Arc::new(move || {
            cancels_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Box::pin(async { NotificationCancelOutcome { reason: NotificationCancelReason::Ok } });
        }));
        let outcome = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(outcome.reason, NotificationCancelReason::Ok);
        let outcome2 = block_on(cancel_scheduled_notification(&scheduled));
        assert_eq!(outcome2.reason, NotificationCancelReason::AlreadyCancelled);
        assert_eq!(cancels.load(std::sync::atomic::Ordering::Relaxed), 1);
    }
}

mod close_all_notifications {
    use super::*;

    #[test]
    fn dispatches_provider_wide_close_through_the_exact_host_trait() {
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
}

mod close_notification {
    use super::*;

    #[test]
    fn never_accepts_a_replacement_host_and_never_reroutes_a_foreign_id() {
        let notification = create_notification_resource("shared", "A", "");
        let outcome = block_on(close_notification(&notification));
        assert_eq!(outcome.reason, NotificationCloseReason::OperationFailed);
    }

    #[test]
    fn uses_only_the_origin_pinned_close_and_is_idempotent() {
        let notification = create_notification_resource("same", "A", "");
        let closes = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let closes_clone = closes.clone();
        bind_notification_close(&notification, Arc::new(move || {
            closes_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Box::pin(async { NotificationCloseOutcome { reason: NotificationCloseReason::Ok } });
        }));
        let outcome = block_on(close_notification(&notification));
        assert_eq!(outcome.reason, NotificationCloseReason::Ok);
        let outcome2 = block_on(close_notification(&notification));
        assert_eq!(outcome2.reason, NotificationCloseReason::AlreadyClosed);
        assert_eq!(closes.load(std::sync::atomic::Ordering::Relaxed), 1);
    }
}

mod create_notification_action_subscription {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_inert_signal() {
        let subscription = create_notification_action_subscription();
        assert_is_entity(&subscription);
    }
}

mod create_notification_click_subscription {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_inert_signal() {
        let subscription = create_notification_click_subscription();
        assert_is_entity(&subscription);
    }
}

mod create_notification_dismiss_subscription {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_inert_signal() {
        let subscription = create_notification_dismiss_subscription();
        assert_is_entity(&subscription);
    }
}

mod create_notification_received_subscription {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_inert_signal() {
        let subscription = create_notification_received_subscription();
        assert_is_entity(&subscription);
    }
}

mod create_notification_reply_subscription {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_inert_signal() {
        let subscription = create_notification_reply_subscription();
        assert_is_entity(&subscription);
    }
}

mod create_notification_resource {
    use super::*;

    #[test]
    fn creates_stable_public_identity_without_a_native_key() {
        let notification = create_notification_resource("n1", "Title", "group");
        assert_is_entity(&notification);
        assert_eq!(notification.id, "n1");
        assert_eq!(notification.tag, "group");
        assert_eq!(notification.title, "Title");
    }
}

mod create_scheduled_notification_resource {
    use super::*;

    #[test]
    fn creates_a_stable_scheduled_entity_with_request_and_schedule_facts() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = create_scheduled_notification_resource("s1", &request, &schedule);
        assert_is_entity(&scheduled);
        assert_eq!(scheduled.id, "s1");
        assert_eq!(scheduled.request.title, "Later");
        assert_eq!(scheduled.schedule.at, 1.0);
    }
}

mod destroy_notification_capabilities {
    use super::*;

    #[test]
    fn dispatches_through_lifecycle_and_preserves_retry_only_failures() {
        let calls = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let calls_clone = calls.clone();
        let provider = make_provider();
        let cap = HostNotificationLifecycleCapability {
            destroy: Arc::new(move || {
                let count = calls_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                return Box::pin(async move {
                    if count == 1 {
                        return NotificationLifecycleOutcome {
                            reason: NotificationLifecycleReason::OperationFailed,
                            failures: Some(vec![NotificationLifecycleFailure {
                                id: "n1".to_string(),
                                operation: NotificationLifecycleFailureOperation::Close,
                            }]),
                        };
                    }
                    return NotificationLifecycleOutcome {
                        reason: NotificationLifecycleReason::Ok,
                        failures: None,
                    };
                });
            }),
            provider,
        };
        let outcome = block_on(destroy_notification_capabilities(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::OperationFailed);
        let outcome2 = block_on(destroy_notification_capabilities(&cap));
        assert_eq!(outcome2.reason, NotificationLifecycleReason::Ok);
    }
}

mod detach_notification_action_subscription {
    use super::*;

    #[test]
    fn is_harmless_before_attach() {
        let subscription = create_notification_action_subscription();
        let outcome = block_on(detach_notification_action_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }
}

mod detach_notification_click_subscription {
    use super::*;

    #[test]
    fn is_harmless_before_attach() {
        let subscription = create_notification_click_subscription();
        let outcome = block_on(detach_notification_click_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }
}

mod detach_notification_dismiss_subscription {
    use super::*;

    #[test]
    fn is_harmless_before_attach() {
        let subscription = create_notification_dismiss_subscription();
        let outcome = block_on(detach_notification_dismiss_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }
}

mod detach_notification_received_subscription {
    use super::*;

    #[test]
    fn is_harmless_before_attach() {
        let subscription = create_notification_received_subscription();
        let outcome = block_on(detach_notification_received_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }
}

mod detach_notification_reply_subscription {
    use super::*;

    #[test]
    fn is_harmless_before_attach() {
        let subscription = create_notification_reply_subscription();
        let outcome = block_on(detach_notification_reply_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDetachReason::NotAttached);
    }
}

mod dispose_notification_action_subscription {
    use super::*;

    #[test]
    fn is_terminal_and_idempotent() {
        let subscription = create_notification_action_subscription();
        let outcome = block_on(dispose_notification_action_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDisposeReason::Ok);
        let outcome2 = block_on(dispose_notification_action_subscription(&subscription));
        assert_eq!(outcome2.reason, NotificationSubscriptionDisposeReason::AlreadyDisposed);
    }
}

mod dispose_notification_click_subscription {
    use super::*;

    #[test]
    fn keeps_a_failed_release_observable() {
        let backend = make_click_backend(false, true);
        let subscription = create_notification_click_subscription();
        let _attach = block_on(attach_notification_click_subscription(&backend, &subscription));
        let outcome = block_on(dispose_notification_click_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDisposeReason::OperationFailed);
        assert_eq!(outcome.release_failed, Some(true));
    }
}

mod dispose_notification_dismiss_subscription {
    use super::*;

    #[test]
    fn is_terminal() {
        let subscription = create_notification_dismiss_subscription();
        let outcome = block_on(dispose_notification_dismiss_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDisposeReason::Ok);
    }
}

mod dispose_notification_received_subscription {
    use super::*;

    #[test]
    fn is_terminal() {
        let subscription = create_notification_received_subscription();
        let outcome = block_on(dispose_notification_received_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDisposeReason::Ok);
    }
}

mod dispose_notification_reply_subscription {
    use super::*;

    #[test]
    fn is_terminal() {
        let subscription = create_notification_reply_subscription();
        let outcome = block_on(dispose_notification_reply_subscription(&subscription));
        assert_eq!(outcome.reason, NotificationSubscriptionDisposeReason::Ok);
    }
}

mod get_active_notifications {
    use super::*;

    #[test]
    fn returns_provider_reconciled_stable_entity_identity() {
        let notification = create_notification_resource("same", "Title", "");
        let notification_clone = notification.clone();
        let provider = make_provider();
        let cap = HostNotificationActiveListCapability {
            get_active_notifications: Arc::new(move || {
                let n = notification_clone.clone();
                return Box::pin(async move {
                    return NotificationActiveListOutcome {
                        reason: NotificationLifecycleReason::Ok,
                        notifications: Some(vec![n]),
                    };
                });
            }),
            provider,
        };
        let outcome = block_on(get_active_notifications(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::Ok);
        assert!(outcome.notifications.is_some());
        assert_eq!(outcome.notifications.as_ref().unwrap().len(), 1);
    }
}

mod get_notification_cancel_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_cancel_reason_string(NotificationCancelReason::Ok), "ok");
        assert_eq!(parse_notification_cancel_reason("ok"), Some(NotificationCancelReason::Ok));
    }
}

mod get_notification_close_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_close_reason_string(NotificationCloseReason::Ok), "ok");
        assert_eq!(parse_notification_close_reason("ok"), Some(NotificationCloseReason::Ok));
    }
}

mod get_notification_delivery_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_delivery_reason_string(NotificationDeliveryReason::Accepted), "accepted");
        assert_eq!(parse_notification_delivery_reason("accepted"), Some(NotificationDeliveryReason::Accepted));
    }
}

mod get_notification_direction_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_direction_string(NotificationDirection::Auto), "auto");
        assert_eq!(parse_notification_direction("auto"), Some(NotificationDirection::Auto));
    }
}

mod get_notification_event_release_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_event_release_reason_string(NotificationEventReleaseReason::Ok), "ok");
        assert_eq!(parse_notification_event_release_reason("ok"), Some(NotificationEventReleaseReason::Ok));
    }
}

mod get_notification_lifecycle_failure_operation_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_lifecycle_failure_operation_string(NotificationLifecycleFailureOperation::Cancel), "cancel");
        assert_eq!(parse_notification_lifecycle_failure_operation("cancel"), Some(NotificationLifecycleFailureOperation::Cancel));
    }
}

mod get_notification_lifecycle_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_lifecycle_reason_string(NotificationLifecycleReason::Ok), "ok");
        assert_eq!(parse_notification_lifecycle_reason("ok"), Some(NotificationLifecycleReason::Ok));
    }
}

mod get_notification_permission {
    use super::*;

    #[test]
    fn preserves_query_failure_instead_of_collapsing_it_to_denied() {
        let provider = make_provider();
        let cap = HostNotificationPermissionCapability {
            get_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionQueryOutcome {
                    reason: NotificationLifecycleReason::OperationFailed,
                    permission: None,
                };
            })),
            request_permission: Arc::new(|| Box::pin(async {
                return NotificationPermissionRequestOutcome {
                    reason: NotificationPermissionRequestReason::OperationFailed,
                };
            })),
            provider,
        };
        let outcome = block_on(get_notification_permission(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::OperationFailed);
    }
}

mod get_notification_permission_request_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_permission_request_reason_string(NotificationPermissionRequestReason::Granted), "granted");
        assert_eq!(parse_notification_permission_request_reason("granted"), Some(NotificationPermissionRequestReason::Granted));
    }
}

mod get_notification_permission_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_permission_string(NotificationPermission::Default), "default");
        assert_eq!(parse_notification_permission("default"), Some(NotificationPermission::Default));
    }
}

mod get_notification_schedule_precision_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_schedule_precision_string(NotificationSchedulePrecision::Exact), "exact");
        assert_eq!(parse_notification_schedule_precision("exact"), Some(NotificationSchedulePrecision::Exact));
    }
}

mod get_notification_schedule_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_schedule_reason_string(NotificationScheduleReason::Scheduled), "scheduled");
        assert_eq!(parse_notification_schedule_reason("scheduled"), Some(NotificationScheduleReason::Scheduled));
    }
}

mod get_notification_schedule_repeat_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_schedule_repeat_string(NotificationScheduleRepeat::Day), "day");
        assert_eq!(parse_notification_schedule_repeat("day"), Some(NotificationScheduleRepeat::Day));
    }
}

mod get_notification_subscription_attach_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_subscription_attach_reason_string(NotificationSubscriptionAttachReason::Ok), "ok");
        assert_eq!(parse_notification_subscription_attach_reason("ok"), Some(NotificationSubscriptionAttachReason::Ok));
    }
}

mod get_notification_subscription_detach_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_subscription_detach_reason_string(NotificationSubscriptionDetachReason::Ok), "ok");
        assert_eq!(parse_notification_subscription_detach_reason("ok"), Some(NotificationSubscriptionDetachReason::Ok));
    }
}

mod get_notification_subscription_dispose_reason_string {
    use super::*;
    #[test]
    fn round_trips() {
        assert_eq!(get_notification_subscription_dispose_reason_string(NotificationSubscriptionDisposeReason::Ok), "ok");
        assert_eq!(parse_notification_subscription_dispose_reason("ok"), Some(NotificationSubscriptionDisposeReason::Ok));
    }
}

mod get_pending_notifications {
    use super::*;

    #[test]
    fn preserves_provider_failure_instead_of_returning_an_empty_success() {
        let provider = make_provider();
        let cap = HostNotificationSchedulingCapability {
            cancel_all_scheduled_notifications: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    failures: None,
                };
            })),
            get_pending_notifications: Arc::new(|| Box::pin(async {
                return NotificationPendingListOutcome {
                    reason: NotificationLifecycleReason::OperationFailed,
                    notifications: None,
                };
            })),
            schedule_notification: Arc::new(|_request: &NotificationRequest, _schedule: &NotificationSchedule| -> NotificationScheduleFuture {
                return Box::pin(async {
                    return NotificationScheduleOutcome {
                        reason: NotificationScheduleReason::OperationFailed,
                        precision: None,
                        scheduled: None,
                        fields: None,
                    };
                });
            }),
            provider,
        };
        let outcome = block_on(get_pending_notifications(&cap));
        assert_eq!(outcome.reason, NotificationLifecycleReason::OperationFailed);
    }
}

mod initialize_notification_action_subscription {
    use super::*;
    use flight_entity::allocate_entity;
    use flight_signals::{connect_signal, has_signal_slots};

    #[test]
    fn is_the_construction_initializer_of_create_notification_action_subscription() {
        let mut out: NotificationActionSubscription = allocate_entity();
        initialize_notification_action_subscription(&mut out);
        connect_signal(&out.on_notification_action, Arc::new(|_| {}), None);
        assert!(has_signal_slots(&out.on_notification_action));

        initialize_notification_action_subscription(&mut out);

        assert!(!has_signal_slots(&out.on_notification_action));
    }
}

mod initialize_notification_click_subscription {
    use super::*;
    use flight_entity::allocate_entity;
    use flight_signals::{connect_signal, has_signal_slots};

    #[test]
    fn is_the_construction_initializer_of_create_notification_click_subscription() {
        let mut out: NotificationClickSubscription = allocate_entity();
        initialize_notification_click_subscription(&mut out);
        connect_signal(&out.on_notification_click, Arc::new(|_| {}), None);
        assert!(has_signal_slots(&out.on_notification_click));

        initialize_notification_click_subscription(&mut out);

        assert!(!has_signal_slots(&out.on_notification_click));
    }
}

mod initialize_notification_dismiss_subscription {
    use super::*;
    use flight_entity::allocate_entity;
    use flight_signals::{connect_signal, has_signal_slots};

    #[test]
    fn is_the_construction_initializer_of_create_notification_dismiss_subscription() {
        let mut out: NotificationDismissSubscription = allocate_entity();
        initialize_notification_dismiss_subscription(&mut out);
        connect_signal(&out.on_notification_dismiss, Arc::new(|_| {}), None);
        assert!(has_signal_slots(&out.on_notification_dismiss));

        initialize_notification_dismiss_subscription(&mut out);

        assert!(!has_signal_slots(&out.on_notification_dismiss));
    }
}

mod initialize_notification_received_subscription {
    use super::*;
    use flight_entity::allocate_entity;
    use flight_signals::{connect_signal, has_signal_slots};

    #[test]
    fn is_the_construction_initializer_of_create_notification_received_subscription() {
        let mut out: NotificationReceivedSubscription = allocate_entity();
        initialize_notification_received_subscription(&mut out);
        connect_signal(&out.on_notification_received, Arc::new(|_| {}), None);
        assert!(has_signal_slots(&out.on_notification_received));

        initialize_notification_received_subscription(&mut out);

        assert!(!has_signal_slots(&out.on_notification_received));
    }
}

mod initialize_notification_reply_subscription {
    use super::*;
    use flight_entity::allocate_entity;
    use flight_signals::{connect_signal, has_signal_slots};

    #[test]
    fn is_the_construction_initializer_of_create_notification_reply_subscription() {
        let mut out: NotificationReplySubscription = allocate_entity();
        initialize_notification_reply_subscription(&mut out);
        connect_signal(&out.on_notification_reply, Arc::new(|_| {}), None);
        assert!(has_signal_slots(&out.on_notification_reply));

        initialize_notification_reply_subscription(&mut out);

        assert!(!has_signal_slots(&out.on_notification_reply));
    }
}

mod initialize_notification_resource {
    use super::*;
    use flight_entity::allocate_entity;

    #[test]
    fn is_the_construction_initializer_of_create_notification_resource() {
        let mut out: Notification = allocate_entity();
        initialize_notification_resource(&mut out, "n1", "Title", "tag");
        assert_eq!(out.id, "n1");
        assert_eq!(out.title, "Title");
        assert_eq!(out.tag, "tag");
    }
}

mod initialize_scheduled_notification_resource {
    use super::*;
    use flight_entity::allocate_entity;

    #[test]
    fn is_the_construction_initializer_of_create_scheduled_notification_resource() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let mut out: ScheduledNotification = allocate_entity();
        initialize_scheduled_notification_resource(&mut out, "s1", &request, &schedule);
        assert_eq!(out.id, "s1");
        assert_eq!(out.request.title, "Later");
        assert_eq!(out.schedule.at, 1.0);
    }
}

mod parse_notification_cancel_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_cancel_reason("bogus"), None);
    }
}

mod parse_notification_close_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_close_reason("bogus"), None);
    }
}

mod parse_notification_delivery_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_delivery_reason("bogus"), None);
    }
}

mod parse_notification_direction {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_direction("bogus"), None);
    }
}

mod parse_notification_event_release_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_event_release_reason("bogus"), None);
    }
}

mod parse_notification_lifecycle_failure_operation {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_lifecycle_failure_operation("bogus"), None);
    }
}

mod parse_notification_lifecycle_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_lifecycle_reason("bogus"), None);
    }
}

mod parse_notification_permission {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_permission("bogus"), None);
    }
}

mod parse_notification_permission_request_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_permission_request_reason("bogus"), None);
    }
}

mod parse_notification_schedule_precision {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_schedule_precision("bogus"), None);
    }
}

mod parse_notification_schedule_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_schedule_reason("bogus"), None);
    }
}

mod parse_notification_schedule_repeat {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_schedule_repeat("bogus"), None);
    }
}

mod parse_notification_subscription_attach_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_subscription_attach_reason("bogus"), None);
    }
}

mod parse_notification_subscription_detach_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_subscription_detach_reason("bogus"), None);
    }
}

mod parse_notification_subscription_dispose_reason {
    use super::*;
    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(parse_notification_subscription_dispose_reason("bogus"), None);
    }
}

mod request_notification_permission {
    use super::*;

    #[test]
    fn preserves_the_provider_request_outcome() {
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
                    reason: NotificationPermissionRequestReason::Dismissed,
                };
            })),
            provider,
        };
        let outcome = block_on(request_notification_permission(&cap));
        assert_eq!(outcome.reason, NotificationPermissionRequestReason::Dismissed);
    }
}

mod schedule_notification {
    use super::*;

    #[test]
    fn returns_the_provider_created_stable_entity() {
        let request = make_request("Later");
        let schedule = make_schedule(1.0);
        let scheduled = create_scheduled_notification_resource("later", &request, &schedule);
        let scheduled_clone = scheduled.clone();
        let provider = make_provider();
        let cap = HostNotificationSchedulingCapability {
            cancel_all_scheduled_notifications: Arc::new(|| Box::pin(async {
                return NotificationLifecycleOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    failures: None,
                };
            })),
            get_pending_notifications: Arc::new(|| Box::pin(async {
                return NotificationPendingListOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    notifications: Some(vec![]),
                };
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
        assert_eq!(outcome.precision, Some(NotificationSchedulePrecision::Exact));
        assert!(outcome.scheduled.is_some());
    }
}

mod show_notification {
    use super::*;

    #[test]
    fn returns_only_the_provider_acquisition_outcome() {
        let notification = create_notification_resource("shown", "Title", "");
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
}
