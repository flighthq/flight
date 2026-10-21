use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;
use flight_entity::EntityConstruction;
use flight_signals::{create_signal, clear_signal, emit_signal};

use crate::types::*;

pub fn create_notification_action_subscription() -> NotificationActionSubscription {
    let mut out: NotificationActionSubscription = allocate_entity();
    initialize_notification_action_subscription(&mut out);
    return out;
}

pub fn create_notification_click_subscription() -> NotificationClickSubscription {
    let mut out: NotificationClickSubscription = allocate_entity();
    initialize_notification_click_subscription(&mut out);
    return out;
}

pub fn create_notification_dismiss_subscription() -> NotificationDismissSubscription {
    let mut out: NotificationDismissSubscription = allocate_entity();
    initialize_notification_dismiss_subscription(&mut out);
    return out;
}

pub fn create_notification_received_subscription() -> NotificationReceivedSubscription {
    let mut out: NotificationReceivedSubscription = allocate_entity();
    initialize_notification_received_subscription(&mut out);
    return out;
}

pub fn create_notification_reply_subscription() -> NotificationReplySubscription {
    let mut out: NotificationReplySubscription = allocate_entity();
    initialize_notification_reply_subscription(&mut out);
    return out;
}

pub fn create_notification_resource(id: &str, title: &str, tag: &str) -> Notification {
    let mut out: Notification = allocate_entity();
    initialize_notification_resource(&mut out, id, title, tag);
    return out;
}

pub fn create_scheduled_notification_resource(
    id: &str,
    request: &NotificationRequest,
    schedule: &NotificationSchedule,
) -> ScheduledNotification {
    let mut out: ScheduledNotification = allocate_entity();
    initialize_scheduled_notification_resource(&mut out, id, request, schedule);
    return out;
}

// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_notification_action_subscription(out: &mut NotificationActionSubscription) {
    out.on_notification_action = create_signal();
}

// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_notification_click_subscription(out: &mut NotificationClickSubscription) {
    out.on_notification_click = create_signal();
}

// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_notification_dismiss_subscription(out: &mut NotificationDismissSubscription) {
    out.on_notification_dismiss = create_signal();
}

// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_notification_received_subscription(out: &mut NotificationReceivedSubscription) {
    out.on_notification_received = create_signal();
}

// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_notification_reply_subscription(out: &mut NotificationReplySubscription) {
    out.on_notification_reply = create_signal();
}

pub fn initialize_notification_resource(
    out: &mut EntityConstruction<Notification>,
    id: &str,
    title: &str,
    tag: &str,
) {
    out.id = id.to_string();
    out.title = title.to_string();
    out.tag = tag.to_string();
}

pub fn initialize_scheduled_notification_resource(
    out: &mut EntityConstruction<ScheduledNotification>,
    id: &str,
    request: &NotificationRequest,
    schedule: &NotificationSchedule,
) {
    out.id = id.to_string();
    out.request = request.clone();
    out.schedule = schedule.clone();
}

pub async fn attach_notification_action_subscription(
    host_notification_action: &HostNotificationActionCapability,
    subscription: &NotificationActionSubscription,
) -> NotificationSubscriptionAttachOutcome {
    let signal = subscription.on_notification_action.clone();
    let attach_fn = host_notification_action.attach.clone();
    let listener: NotificationActionListener = Arc::new(move |notification: &Notification, action_id: &str| {
        emit_signal(&signal, &(notification.clone(), action_id.to_string()));
    });
    return attach_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.generation,
        move || (attach_fn)(listener.clone()),
    ).await;
}

pub async fn attach_notification_click_subscription(
    host_notification_click: &HostNotificationClickCapability,
    subscription: &NotificationClickSubscription,
) -> NotificationSubscriptionAttachOutcome {
    let signal = subscription.on_notification_click.clone();
    let attach_fn = host_notification_click.attach.clone();
    let listener: NotificationClickListener = Arc::new(move |notification: &Notification| {
        emit_signal(&signal, &notification.clone());
    });
    return attach_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.generation,
        move || (attach_fn)(listener.clone()),
    ).await;
}

pub async fn attach_notification_dismiss_subscription(
    host_notification_dismiss: &HostNotificationDismissCapability,
    subscription: &NotificationDismissSubscription,
) -> NotificationSubscriptionAttachOutcome {
    let signal = subscription.on_notification_dismiss.clone();
    let attach_fn = host_notification_dismiss.attach.clone();
    let listener: NotificationDismissListener = Arc::new(move |notification: &Notification| {
        emit_signal(&signal, &notification.clone());
    });
    return attach_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.generation,
        move || (attach_fn)(listener.clone()),
    ).await;
}

pub async fn attach_notification_received_subscription(
    host_notification_received: &HostNotificationReceivedCapability,
    subscription: &NotificationReceivedSubscription,
) -> NotificationSubscriptionAttachOutcome {
    let signal = subscription.on_notification_received.clone();
    let attach_fn = host_notification_received.attach.clone();
    let listener: NotificationReceivedListener = Arc::new(move |notification: &Notification| {
        emit_signal(&signal, &notification.clone());
    });
    return attach_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.generation,
        move || (attach_fn)(listener.clone()),
    ).await;
}

pub async fn attach_notification_reply_subscription(
    host_notification_reply: &HostNotificationReplyCapability,
    subscription: &NotificationReplySubscription,
) -> NotificationSubscriptionAttachOutcome {
    let signal = subscription.on_notification_reply.clone();
    let attach_fn = host_notification_reply.attach.clone();
    let listener: NotificationReplyListener = Arc::new(move |notification: &Notification, action_id: &str, text: &str| {
        emit_signal(&signal, &(notification.clone(), action_id.to_string(), text.to_string()));
    });
    return attach_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.generation,
        move || (attach_fn)(listener.clone()),
    ).await;
}

async fn attach_notification_subscription_impl<F>(
    attachment: &Mutex<Option<NotificationEventAttachment>>,
    disposed: &AtomicBool,
    generation: &AtomicU32,
    attach: F,
) -> NotificationSubscriptionAttachOutcome
where
    F: FnOnce() -> NotificationEventBackendAttachFuture,
{
    if disposed.load(Ordering::Relaxed) {
        return NotificationSubscriptionAttachOutcome {
            reason: NotificationSubscriptionAttachReason::OperationFailed,
            attach_failed: Some(true),
            release_failed: Some(false),
        };
    }

    let detached = detach_notification_subscription_impl(attachment).await;
    if detached.reason == NotificationSubscriptionDetachReason::OperationFailed {
        return NotificationSubscriptionAttachOutcome {
            reason: NotificationSubscriptionAttachReason::OperationFailed,
            attach_failed: Some(false),
            release_failed: Some(true),
        };
    }

    let new_generation = generation.fetch_add(1, Ordering::Relaxed) + 1;

    let pending = attach();
    let outcome = pending.await;

    if outcome.reason == NotificationSubscriptionAttachReason::OperationFailed {
        return NotificationSubscriptionAttachOutcome {
            reason: NotificationSubscriptionAttachReason::OperationFailed,
            attach_failed: Some(true),
            release_failed: outcome.release_failed,
        };
    }

    let stale = disposed.load(Ordering::Relaxed) || generation.load(Ordering::Relaxed) != new_generation;

    if stale {
        if let Some(att) = outcome.attachment {
            let release_outcome = (att.release)().await;
            if release_outcome.reason == NotificationEventReleaseReason::Ok {
                return NotificationSubscriptionAttachOutcome {
                    reason: NotificationSubscriptionAttachReason::Ok,
                    attach_failed: None,
                    release_failed: None,
                };
            } else {
                return NotificationSubscriptionAttachOutcome {
                    reason: NotificationSubscriptionAttachReason::OperationFailed,
                    attach_failed: Some(false),
                    release_failed: Some(true),
                };
            }
        }
        return NotificationSubscriptionAttachOutcome {
            reason: NotificationSubscriptionAttachReason::Ok,
            attach_failed: None,
            release_failed: None,
        };
    }

    *attachment.lock().unwrap() = outcome.attachment;

    return NotificationSubscriptionAttachOutcome {
        reason: NotificationSubscriptionAttachReason::Ok,
        attach_failed: None,
        release_failed: None,
    };
}

pub fn bind_notification_close(
    notification: &Notification,
    close: Arc<dyn Fn() -> NotificationCloseFuture + Send + Sync>,
) {
    *notification.close_callback.lock().unwrap() = Some(close);
}

pub fn bind_scheduled_notification_cancel(
    scheduled: &ScheduledNotification,
    cancel: Arc<dyn Fn() -> NotificationCancelFuture + Send + Sync>,
) {
    *scheduled.cancel_callback.lock().unwrap() = Some(cancel);
}

pub async fn cancel_scheduled_notification(
    scheduled: &ScheduledNotification,
) -> NotificationCancelOutcome {
    if scheduled.cancelled.load(Ordering::Relaxed) {
        return NotificationCancelOutcome { reason: NotificationCancelReason::AlreadyCancelled };
    }
    let cancel = scheduled.cancel_callback.lock().unwrap().clone();
    if cancel.is_none() {
        return NotificationCancelOutcome { reason: NotificationCancelReason::OperationFailed };
    }
    let cancel = cancel.unwrap();
    let outcome = (cancel)().await;
    if outcome.reason == NotificationCancelReason::Ok || outcome.reason == NotificationCancelReason::AlreadyCancelled {
        *scheduled.cancel_callback.lock().unwrap() = None;
        scheduled.cancelled.store(true, Ordering::Relaxed);
    }
    return outcome;
}

pub async fn close_all_notifications(
    host_notification_close: &HostNotificationCloseCapability,
) -> NotificationLifecycleOutcome {
    return (host_notification_close.close_all_notifications)().await;
}

pub async fn close_notification(
    notification: &Notification,
) -> NotificationCloseOutcome {
    if notification.closed.load(Ordering::Relaxed) {
        return NotificationCloseOutcome { reason: NotificationCloseReason::AlreadyClosed };
    }
    let close = notification.close_callback.lock().unwrap().clone();
    if close.is_none() {
        return NotificationCloseOutcome { reason: NotificationCloseReason::OperationFailed };
    }
    let close = close.unwrap();
    let outcome = (close)().await;
    if outcome.reason == NotificationCloseReason::Ok || outcome.reason == NotificationCloseReason::AlreadyClosed {
        *notification.close_callback.lock().unwrap() = None;
        notification.closed.store(true, Ordering::Relaxed);
    }
    return outcome;
}

pub async fn destroy_notification_capabilities(
    host_notification_lifecycle: &HostNotificationLifecycleCapability,
) -> NotificationLifecycleOutcome {
    return (host_notification_lifecycle.destroy)().await;
}

pub async fn detach_notification_action_subscription(
    subscription: &NotificationActionSubscription,
) -> NotificationSubscriptionDetachOutcome {
    return detach_notification_subscription_impl(&subscription.attachment).await;
}

pub async fn detach_notification_click_subscription(
    subscription: &NotificationClickSubscription,
) -> NotificationSubscriptionDetachOutcome {
    return detach_notification_subscription_impl(&subscription.attachment).await;
}

pub async fn detach_notification_dismiss_subscription(
    subscription: &NotificationDismissSubscription,
) -> NotificationSubscriptionDetachOutcome {
    return detach_notification_subscription_impl(&subscription.attachment).await;
}

pub async fn detach_notification_received_subscription(
    subscription: &NotificationReceivedSubscription,
) -> NotificationSubscriptionDetachOutcome {
    return detach_notification_subscription_impl(&subscription.attachment).await;
}

pub async fn detach_notification_reply_subscription(
    subscription: &NotificationReplySubscription,
) -> NotificationSubscriptionDetachOutcome {
    return detach_notification_subscription_impl(&subscription.attachment).await;
}

async fn detach_notification_subscription_impl(
    attachment: &Mutex<Option<NotificationEventAttachment>>,
) -> NotificationSubscriptionDetachOutcome {
    let current = attachment.lock().unwrap().clone();

    let current = match current {
        Some(a) => a,
        None => return NotificationSubscriptionDetachOutcome {
            reason: NotificationSubscriptionDetachReason::NotAttached,
            release_failed: None,
        },
    };

    let release_outcome = (current.release)().await;
    if release_outcome.reason == NotificationEventReleaseReason::OperationFailed {
        return NotificationSubscriptionDetachOutcome {
            reason: NotificationSubscriptionDetachReason::OperationFailed,
            release_failed: Some(true),
        };
    }

    *attachment.lock().unwrap() = None;

    return NotificationSubscriptionDetachOutcome {
        reason: NotificationSubscriptionDetachReason::Ok,
        release_failed: None,
    };
}

pub async fn dispose_notification_action_subscription(
    subscription: &NotificationActionSubscription,
) -> NotificationSubscriptionDisposeOutcome {
    let result = dispose_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.dispose_completed,
        &subscription.generation,
    ).await;
    clear_signal(&subscription.on_notification_action);
    return result;
}

pub async fn dispose_notification_click_subscription(
    subscription: &NotificationClickSubscription,
) -> NotificationSubscriptionDisposeOutcome {
    let result = dispose_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.dispose_completed,
        &subscription.generation,
    ).await;
    clear_signal(&subscription.on_notification_click);
    return result;
}

pub async fn dispose_notification_dismiss_subscription(
    subscription: &NotificationDismissSubscription,
) -> NotificationSubscriptionDisposeOutcome {
    let result = dispose_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.dispose_completed,
        &subscription.generation,
    ).await;
    clear_signal(&subscription.on_notification_dismiss);
    return result;
}

pub async fn dispose_notification_received_subscription(
    subscription: &NotificationReceivedSubscription,
) -> NotificationSubscriptionDisposeOutcome {
    let result = dispose_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.dispose_completed,
        &subscription.generation,
    ).await;
    clear_signal(&subscription.on_notification_received);
    return result;
}

pub async fn dispose_notification_reply_subscription(
    subscription: &NotificationReplySubscription,
) -> NotificationSubscriptionDisposeOutcome {
    let result = dispose_notification_subscription_impl(
        &subscription.attachment,
        &subscription.disposed,
        &subscription.dispose_completed,
        &subscription.generation,
    ).await;
    clear_signal(&subscription.on_notification_reply);
    return result;
}

async fn dispose_notification_subscription_impl(
    attachment: &Mutex<Option<NotificationEventAttachment>>,
    disposed: &AtomicBool,
    dispose_completed: &AtomicBool,
    generation: &AtomicU32,
) -> NotificationSubscriptionDisposeOutcome {
    if dispose_completed.load(Ordering::Relaxed) {
        return NotificationSubscriptionDisposeOutcome {
            reason: NotificationSubscriptionDisposeReason::AlreadyDisposed,
            attach_failed: None,
            release_failed: None,
        };
    }

    disposed.store(true, Ordering::Relaxed);
    generation.fetch_add(1, Ordering::Relaxed);

    let detached = detach_notification_subscription_impl(attachment).await;
    let release_failed = detached.reason == NotificationSubscriptionDetachReason::OperationFailed;

    if release_failed {
        return NotificationSubscriptionDisposeOutcome {
            reason: NotificationSubscriptionDisposeReason::OperationFailed,
            attach_failed: Some(false),
            release_failed: Some(true),
        };
    }

    dispose_completed.store(true, Ordering::Relaxed);

    return NotificationSubscriptionDisposeOutcome {
        reason: NotificationSubscriptionDisposeReason::Ok,
        attach_failed: None,
        release_failed: None,
    };
}

pub async fn get_active_notifications(
    host_notification_active_list: &HostNotificationActiveListCapability,
) -> NotificationActiveListOutcome {
    return (host_notification_active_list.get_active_notifications)().await;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationCancelReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_cancel_reason_string(value: NotificationCancelReason) -> &'static str {
    return match value {
        NotificationCancelReason::AlreadyCancelled => "already-cancelled",
        NotificationCancelReason::Ok => "ok",
        NotificationCancelReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationCloseReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_close_reason_string(value: NotificationCloseReason) -> &'static str {
    return match value {
        NotificationCloseReason::AlreadyClosed => "already-closed",
        NotificationCloseReason::Ok => "ok",
        NotificationCloseReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationDeliveryReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_delivery_reason_string(value: NotificationDeliveryReason) -> &'static str {
    return match value {
        NotificationDeliveryReason::Accepted => "accepted",
        NotificationDeliveryReason::InvalidRequest => "invalid-request",
        NotificationDeliveryReason::OperationFailed => "operation-failed",
        NotificationDeliveryReason::PermissionDenied => "permission-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationDirection string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_direction_string(value: NotificationDirection) -> &'static str {
    return match value {
        NotificationDirection::Auto => "auto",
        NotificationDirection::Ltr => "ltr",
        NotificationDirection::Rtl => "rtl",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationEventReleaseReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_event_release_reason_string(value: NotificationEventReleaseReason) -> &'static str {
    return match value {
        NotificationEventReleaseReason::Ok => "ok",
        NotificationEventReleaseReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationLifecycleFailureOperation string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_lifecycle_failure_operation_string(value: NotificationLifecycleFailureOperation) -> &'static str {
    return match value {
        NotificationLifecycleFailureOperation::Cancel => "cancel",
        NotificationLifecycleFailureOperation::Close => "close",
        NotificationLifecycleFailureOperation::Release => "release",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationLifecycleReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_lifecycle_reason_string(value: NotificationLifecycleReason) -> &'static str {
    return match value {
        NotificationLifecycleReason::AlreadyDestroyed => "already-destroyed",
        NotificationLifecycleReason::Ok => "ok",
        NotificationLifecycleReason::OperationFailed => "operation-failed",
    };
}

pub async fn get_notification_permission(
    host_notification_permission: &HostNotificationPermissionCapability,
) -> NotificationPermissionQueryOutcome {
    return (host_notification_permission.get_permission)().await;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationPermissionRequestReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_permission_request_reason_string(value: NotificationPermissionRequestReason) -> &'static str {
    return match value {
        NotificationPermissionRequestReason::Denied => "denied",
        NotificationPermissionRequestReason::Dismissed => "dismissed",
        NotificationPermissionRequestReason::Granted => "granted",
        NotificationPermissionRequestReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationPermission string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_permission_string(value: NotificationPermission) -> &'static str {
    return match value {
        NotificationPermission::Default => "default",
        NotificationPermission::Denied => "denied",
        NotificationPermission::Granted => "granted",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSchedulePrecision string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_schedule_precision_string(value: NotificationSchedulePrecision) -> &'static str {
    return match value {
        NotificationSchedulePrecision::Exact => "exact",
        NotificationSchedulePrecision::Inexact => "inexact",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationScheduleReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_schedule_reason_string(value: NotificationScheduleReason) -> &'static str {
    return match value {
        NotificationScheduleReason::InvalidSchedule => "invalid-schedule",
        NotificationScheduleReason::OperationFailed => "operation-failed",
        NotificationScheduleReason::PermissionDenied => "permission-denied",
        NotificationScheduleReason::Scheduled => "scheduled",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationScheduleRepeat string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_schedule_repeat_string(value: NotificationScheduleRepeat) -> &'static str {
    return match value {
        NotificationScheduleRepeat::Day => "day",
        NotificationScheduleRepeat::Hour => "hour",
        NotificationScheduleRepeat::Minute => "minute",
        NotificationScheduleRepeat::Month => "month",
        NotificationScheduleRepeat::Week => "week",
        NotificationScheduleRepeat::Year => "year",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionAttachReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_subscription_attach_reason_string(value: NotificationSubscriptionAttachReason) -> &'static str {
    return match value {
        NotificationSubscriptionAttachReason::Ok => "ok",
        NotificationSubscriptionAttachReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionDetachReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_subscription_detach_reason_string(value: NotificationSubscriptionDetachReason) -> &'static str {
    return match value {
        NotificationSubscriptionDetachReason::NotAttached => "not-attached",
        NotificationSubscriptionDetachReason::Ok => "ok",
        NotificationSubscriptionDetachReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionDisposeReason string union; the TS package exports no get_/parse_ free functions
pub fn get_notification_subscription_dispose_reason_string(value: NotificationSubscriptionDisposeReason) -> &'static str {
    return match value {
        NotificationSubscriptionDisposeReason::AlreadyDisposed => "already-disposed",
        NotificationSubscriptionDisposeReason::Ok => "ok",
        NotificationSubscriptionDisposeReason::OperationFailed => "operation-failed",
    };
}

pub async fn get_pending_notifications(
    host_notification_scheduling: &HostNotificationSchedulingCapability,
) -> NotificationPendingListOutcome {
    return (host_notification_scheduling.get_pending_notifications)().await;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationCancelReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_cancel_reason(value: &str) -> Option<NotificationCancelReason> {
    return match value {
        "already-cancelled" => Some(NotificationCancelReason::AlreadyCancelled),
        "ok" => Some(NotificationCancelReason::Ok),
        "operation-failed" => Some(NotificationCancelReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationCloseReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_close_reason(value: &str) -> Option<NotificationCloseReason> {
    return match value {
        "already-closed" => Some(NotificationCloseReason::AlreadyClosed),
        "ok" => Some(NotificationCloseReason::Ok),
        "operation-failed" => Some(NotificationCloseReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationDeliveryReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_delivery_reason(value: &str) -> Option<NotificationDeliveryReason> {
    return match value {
        "accepted" => Some(NotificationDeliveryReason::Accepted),
        "invalid-request" => Some(NotificationDeliveryReason::InvalidRequest),
        "operation-failed" => Some(NotificationDeliveryReason::OperationFailed),
        "permission-denied" => Some(NotificationDeliveryReason::PermissionDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationDirection string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_direction(value: &str) -> Option<NotificationDirection> {
    return match value {
        "auto" => Some(NotificationDirection::Auto),
        "ltr" => Some(NotificationDirection::Ltr),
        "rtl" => Some(NotificationDirection::Rtl),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationEventReleaseReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_event_release_reason(value: &str) -> Option<NotificationEventReleaseReason> {
    return match value {
        "ok" => Some(NotificationEventReleaseReason::Ok),
        "operation-failed" => Some(NotificationEventReleaseReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationLifecycleFailureOperation string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_lifecycle_failure_operation(value: &str) -> Option<NotificationLifecycleFailureOperation> {
    return match value {
        "cancel" => Some(NotificationLifecycleFailureOperation::Cancel),
        "close" => Some(NotificationLifecycleFailureOperation::Close),
        "release" => Some(NotificationLifecycleFailureOperation::Release),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationLifecycleReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_lifecycle_reason(value: &str) -> Option<NotificationLifecycleReason> {
    return match value {
        "already-destroyed" => Some(NotificationLifecycleReason::AlreadyDestroyed),
        "ok" => Some(NotificationLifecycleReason::Ok),
        "operation-failed" => Some(NotificationLifecycleReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationPermission string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_permission(value: &str) -> Option<NotificationPermission> {
    return match value {
        "default" => Some(NotificationPermission::Default),
        "denied" => Some(NotificationPermission::Denied),
        "granted" => Some(NotificationPermission::Granted),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationPermissionRequestReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_permission_request_reason(value: &str) -> Option<NotificationPermissionRequestReason> {
    return match value {
        "denied" => Some(NotificationPermissionRequestReason::Denied),
        "dismissed" => Some(NotificationPermissionRequestReason::Dismissed),
        "granted" => Some(NotificationPermissionRequestReason::Granted),
        "operation-failed" => Some(NotificationPermissionRequestReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSchedulePrecision string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_schedule_precision(value: &str) -> Option<NotificationSchedulePrecision> {
    return match value {
        "exact" => Some(NotificationSchedulePrecision::Exact),
        "inexact" => Some(NotificationSchedulePrecision::Inexact),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationScheduleReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_schedule_reason(value: &str) -> Option<NotificationScheduleReason> {
    return match value {
        "invalid-schedule" => Some(NotificationScheduleReason::InvalidSchedule),
        "operation-failed" => Some(NotificationScheduleReason::OperationFailed),
        "permission-denied" => Some(NotificationScheduleReason::PermissionDenied),
        "scheduled" => Some(NotificationScheduleReason::Scheduled),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationScheduleRepeat string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_schedule_repeat(value: &str) -> Option<NotificationScheduleRepeat> {
    return match value {
        "day" => Some(NotificationScheduleRepeat::Day),
        "hour" => Some(NotificationScheduleRepeat::Hour),
        "minute" => Some(NotificationScheduleRepeat::Minute),
        "month" => Some(NotificationScheduleRepeat::Month),
        "week" => Some(NotificationScheduleRepeat::Week),
        "year" => Some(NotificationScheduleRepeat::Year),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionAttachReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_subscription_attach_reason(value: &str) -> Option<NotificationSubscriptionAttachReason> {
    return match value {
        "ok" => Some(NotificationSubscriptionAttachReason::Ok),
        "operation-failed" => Some(NotificationSubscriptionAttachReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionDetachReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_subscription_detach_reason(value: &str) -> Option<NotificationSubscriptionDetachReason> {
    return match value {
        "not-attached" => Some(NotificationSubscriptionDetachReason::NotAttached),
        "ok" => Some(NotificationSubscriptionDetachReason::Ok),
        "operation-failed" => Some(NotificationSubscriptionDetachReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NotificationSubscriptionDisposeReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_notification_subscription_dispose_reason(value: &str) -> Option<NotificationSubscriptionDisposeReason> {
    return match value {
        "already-disposed" => Some(NotificationSubscriptionDisposeReason::AlreadyDisposed),
        "ok" => Some(NotificationSubscriptionDisposeReason::Ok),
        "operation-failed" => Some(NotificationSubscriptionDisposeReason::OperationFailed),
        _ => None,
    };
}

pub async fn request_notification_permission(
    host_notification_permission: &HostNotificationPermissionCapability,
) -> NotificationPermissionRequestOutcome {
    return (host_notification_permission.request_permission)().await;
}

pub async fn schedule_notification(
    host_notification_scheduling: &HostNotificationSchedulingCapability,
    request: &NotificationRequest,
    schedule: &NotificationSchedule,
) -> NotificationScheduleOutcome {
    return (host_notification_scheduling.schedule_notification)(request, schedule).await;
}

pub async fn show_notification(
    host_notification_delivery: &HostNotificationDeliveryCapability,
    request: &NotificationRequest,
) -> NotificationDeliveryOutcome {
    return (host_notification_delivery.notify)(request).await;
}
