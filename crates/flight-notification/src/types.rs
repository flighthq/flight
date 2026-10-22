use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::{Arc, Mutex};

use flight_entity::EntityRuntimeSlot;
use flight_entity::Unknown;
use flight_signals::Signal;

pub use flight_host::ProviderRef;

// ── Enums ──

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationCancelReason {
    AlreadyCancelled,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationCloseReason {
    AlreadyClosed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationDeliveryReason {
    Accepted,
    InvalidRequest,
    OperationFailed,
    PermissionDenied,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationDirection {
    Auto,
    Ltr,
    Rtl,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationEventReleaseReason {
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationLifecycleFailureOperation {
    Cancel,
    Close,
    Release,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationLifecycleReason {
    AlreadyDestroyed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationPermission {
    Default,
    Denied,
    Granted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationPermissionRequestReason {
    Denied,
    Dismissed,
    Granted,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationSchedulePrecision {
    Exact,
    Inexact,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationScheduleReason {
    InvalidSchedule,
    OperationFailed,
    PermissionDenied,
    Scheduled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationScheduleRepeat {
    Day,
    Hour,
    Minute,
    Month,
    Week,
    Year,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationSubscriptionAttachReason {
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationSubscriptionDetachReason {
    NotAttached,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationSubscriptionDisposeReason {
    AlreadyDisposed,
    Ok,
    OperationFailed,
}

// ── Structs ──

#[derive(Clone)]
pub struct HostNotificationActionCapability {
    pub attach: Arc<dyn Fn(NotificationActionListener) -> NotificationEventBackendAttachFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationActiveListCapability {
    pub get_active_notifications: Arc<dyn Fn() -> NotificationActiveListFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone, Default)]
pub struct HostNotificationCapabilities {
    pub action: Option<HostNotificationActionCapability>,
    pub active_list: Option<HostNotificationActiveListCapability>,
    pub click: Option<HostNotificationClickCapability>,
    pub close: Option<HostNotificationCloseCapability>,
    pub delivery: Option<HostNotificationDeliveryCapability>,
    pub dismiss: Option<HostNotificationDismissCapability>,
    pub lifecycle: Option<HostNotificationLifecycleCapability>,
    pub permission: Option<HostNotificationPermissionCapability>,
    pub received: Option<HostNotificationReceivedCapability>,
    pub reply: Option<HostNotificationReplyCapability>,
    pub scheduling: Option<HostNotificationSchedulingCapability>,
}

#[derive(Clone)]
pub struct HostNotificationClickCapability {
    pub attach: Arc<dyn Fn(NotificationClickListener) -> NotificationEventBackendAttachFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationCloseCapability {
    pub close_all_notifications: Arc<dyn Fn() -> NotificationLifecycleFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationDeliveryCapability {
    pub notify: Arc<dyn Fn(&NotificationRequest) -> NotificationDeliveryFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationDismissCapability {
    pub attach: Arc<dyn Fn(NotificationDismissListener) -> NotificationEventBackendAttachFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationLifecycleCapability {
    pub destroy: Arc<dyn Fn() -> NotificationLifecycleFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationPermissionCapability {
    pub get_permission: Arc<dyn Fn() -> NotificationPermissionQueryFuture + Send + Sync>,
    pub request_permission: Arc<dyn Fn() -> NotificationPermissionRequestFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationReceivedCapability {
    pub attach: Arc<dyn Fn(NotificationReceivedListener) -> NotificationEventBackendAttachFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationReplyCapability {
    pub attach: Arc<dyn Fn(NotificationReplyListener) -> NotificationEventBackendAttachFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct HostNotificationSchedulingCapability {
    pub cancel_all_scheduled_notifications: Arc<dyn Fn() -> NotificationLifecycleFuture + Send + Sync>,
    pub get_pending_notifications: Arc<dyn Fn() -> NotificationPendingListFuture + Send + Sync>,
    pub schedule_notification: Arc<dyn Fn(&NotificationRequest, &NotificationSchedule) -> NotificationScheduleFuture + Send + Sync>,
    pub provider: ProviderRef,
}

pub struct Notification {
    runtime: EntityRuntimeSlot,
    pub id: String,
    pub tag: String,
    pub title: String,
    pub(crate) close_callback: Mutex<Option<Arc<dyn Fn() -> NotificationCloseFuture + Send + Sync>>>,
    pub(crate) closed: AtomicBool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationAction {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
}

pub struct NotificationActionSubscription {
    runtime: EntityRuntimeSlot,
    pub on_notification_action: Signal<(Notification, String)>,
    pub(crate) attachment: Mutex<Option<NotificationEventAttachment>>,
    pub(crate) disposed: AtomicBool,
    pub(crate) dispose_completed: AtomicBool,
    pub(crate) generation: AtomicU32,
}

#[derive(Clone, Debug)]
pub struct NotificationActiveListOutcome {
    pub reason: NotificationLifecycleReason,
    pub notifications: Option<Vec<Notification>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationCancelOutcome {
    pub reason: NotificationCancelReason,
}

pub struct NotificationClickSubscription {
    runtime: EntityRuntimeSlot,
    pub on_notification_click: Signal<Notification>,
    pub(crate) attachment: Mutex<Option<NotificationEventAttachment>>,
    pub(crate) disposed: AtomicBool,
    pub(crate) dispose_completed: AtomicBool,
    pub(crate) generation: AtomicU32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationCloseOutcome {
    pub reason: NotificationCloseReason,
}

#[derive(Clone, Debug)]
pub struct NotificationDeliveryOutcome {
    pub reason: NotificationDeliveryReason,
    pub notification: Option<Notification>,
    pub fields: Option<Vec<NotificationRequestField>>,
}

pub struct NotificationDismissSubscription {
    runtime: EntityRuntimeSlot,
    pub on_notification_dismiss: Signal<Notification>,
    pub(crate) attachment: Mutex<Option<NotificationEventAttachment>>,
    pub(crate) disposed: AtomicBool,
    pub(crate) dispose_completed: AtomicBool,
    pub(crate) generation: AtomicU32,
}

#[derive(Clone)]
pub struct NotificationEventAttachment {
    pub release: Arc<dyn Fn() -> NotificationEventReleaseFuture + Send + Sync>,
}

#[derive(Clone)]
pub struct NotificationEventBackendAttachResult {
    pub reason: NotificationSubscriptionAttachReason,
    pub attachment: Option<NotificationEventAttachment>,
    pub release_failed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationEventReleaseOutcome {
    pub reason: NotificationEventReleaseReason,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationLifecycleFailure {
    pub id: String,
    pub operation: NotificationLifecycleFailureOperation,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationLifecycleOutcome {
    pub reason: NotificationLifecycleReason,
    pub failures: Option<Vec<NotificationLifecycleFailure>>,
}

#[derive(Clone, Debug)]
pub struct NotificationPendingListOutcome {
    pub reason: NotificationLifecycleReason,
    pub notifications: Option<Vec<ScheduledNotification>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationPermissionQueryOutcome {
    pub reason: NotificationLifecycleReason,
    pub permission: Option<NotificationPermission>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationPermissionRequestOutcome {
    pub reason: NotificationPermissionRequestReason,
}

pub struct NotificationReceivedSubscription {
    runtime: EntityRuntimeSlot,
    pub on_notification_received: Signal<Notification>,
    pub(crate) attachment: Mutex<Option<NotificationEventAttachment>>,
    pub(crate) disposed: AtomicBool,
    pub(crate) dispose_completed: AtomicBool,
    pub(crate) generation: AtomicU32,
}

pub struct NotificationReplySubscription {
    runtime: EntityRuntimeSlot,
    pub on_notification_reply: Signal<(Notification, String, String)>,
    pub(crate) attachment: Mutex<Option<NotificationEventAttachment>>,
    pub(crate) disposed: AtomicBool,
    pub(crate) dispose_completed: AtomicBool,
    pub(crate) generation: AtomicU32,
}

#[derive(Clone, Debug, Default)]
pub struct NotificationRequest {
    pub title: String,
    pub id: Option<String>,
    pub body: Option<String>,
    pub icon: Option<String>,
    pub badge: Option<String>,
    pub tag: Option<String>,
    pub silent: Option<bool>,
    pub actions: Option<Vec<NotificationAction>>,
    pub dir: Option<NotificationDirection>,
    pub image: Option<String>,
    pub lang: Option<String>,
    pub renotify: Option<bool>,
    pub require_interaction: Option<bool>,
    pub timestamp: Option<f32>,
    pub vibrate: Option<Vec<f32>>,
    pub data: Option<Unknown>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NotificationRequestField(pub &'static str);

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NotificationSchedule {
    pub at: f32,
    pub repeat: Option<NotificationScheduleRepeat>,
}

#[derive(Clone, Debug)]
pub struct NotificationScheduleOutcome {
    pub reason: NotificationScheduleReason,
    pub precision: Option<NotificationSchedulePrecision>,
    pub scheduled: Option<ScheduledNotification>,
    pub fields: Option<Vec<NotificationRequestField>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationSubscriptionAttachOutcome {
    pub reason: NotificationSubscriptionAttachReason,
    pub attach_failed: Option<bool>,
    pub release_failed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationSubscriptionDetachOutcome {
    pub reason: NotificationSubscriptionDetachReason,
    pub release_failed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NotificationSubscriptionDisposeOutcome {
    pub reason: NotificationSubscriptionDisposeReason,
    pub attach_failed: Option<bool>,
    pub release_failed: Option<bool>,
}

pub struct ScheduledNotification {
    runtime: EntityRuntimeSlot,
    pub id: String,
    pub request: NotificationRequest,
    pub schedule: NotificationSchedule,
    pub(crate) cancel_callback: Mutex<Option<Arc<dyn Fn() -> NotificationCancelFuture + Send + Sync>>>,
    pub(crate) cancelled: AtomicBool,
}

// ── Type aliases ──

pub type NotificationActionListener = Arc<dyn Fn(&Notification, &str) + Send + Sync>;
pub type NotificationActiveListFuture = Pin<Box<dyn Future<Output = NotificationActiveListOutcome> + Send>>;
pub type NotificationCancelFuture = Pin<Box<dyn Future<Output = NotificationCancelOutcome> + Send>>;
pub type NotificationClickListener = Arc<dyn Fn(&Notification) + Send + Sync>;
pub type NotificationCloseFuture = Pin<Box<dyn Future<Output = NotificationCloseOutcome> + Send>>;
pub type NotificationDeliveryFuture = Pin<Box<dyn Future<Output = NotificationDeliveryOutcome> + Send>>;
pub type NotificationDismissListener = Arc<dyn Fn(&Notification) + Send + Sync>;
pub type NotificationEventBackendAttachFuture = Pin<Box<dyn Future<Output = NotificationEventBackendAttachOutcome> + Send>>;
pub type NotificationEventBackendAttachOutcome = NotificationEventBackendAttachResult;
pub type NotificationEventReleaseFuture = Pin<Box<dyn Future<Output = NotificationEventReleaseOutcome> + Send>>;
pub type NotificationLifecycleFuture = Pin<Box<dyn Future<Output = NotificationLifecycleOutcome> + Send>>;
pub type NotificationPendingListFuture = Pin<Box<dyn Future<Output = NotificationPendingListOutcome> + Send>>;
pub type NotificationPermissionQueryFuture = Pin<Box<dyn Future<Output = NotificationPermissionQueryOutcome> + Send>>;
pub type NotificationPermissionRequestFuture = Pin<Box<dyn Future<Output = NotificationPermissionRequestOutcome> + Send>>;
pub type NotificationReceivedListener = Arc<dyn Fn(&Notification) + Send + Sync>;
pub type NotificationReplyListener = Arc<dyn Fn(&Notification, &str, &str) + Send + Sync>;
pub type NotificationScheduleFuture = Pin<Box<dyn Future<Output = NotificationScheduleOutcome> + Send>>;
pub type NotificationSubscriptionAttachFuture = Pin<Box<dyn Future<Output = NotificationSubscriptionAttachOutcome> + Send>>;
pub type NotificationSubscriptionDetachFuture = Pin<Box<dyn Future<Output = NotificationSubscriptionDetachOutcome> + Send>>;
pub type NotificationSubscriptionDisposeFuture = Pin<Box<dyn Future<Output = NotificationSubscriptionDisposeOutcome> + Send>>;

// ── Impl blocks ──

impl NotificationRequestField {
    pub const TITLE: Self = Self("title");
    pub const ID: Self = Self("id");
    pub const BODY: Self = Self("body");
    pub const ICON: Self = Self("icon");
    pub const BADGE: Self = Self("badge");
    pub const TAG: Self = Self("tag");
    pub const SILENT: Self = Self("silent");
    pub const ACTIONS: Self = Self("actions");
    pub const DIR: Self = Self("dir");
    pub const IMAGE: Self = Self("image");
    pub const LANG: Self = Self("lang");
    pub const RENOTIFY: Self = Self("renotify");
    pub const REQUIRE_INTERACTION: Self = Self("requireInteraction");
    pub const TIMESTAMP: Self = Self("timestamp");
    pub const VIBRATE: Self = Self("vibrate");
    pub const DATA: Self = Self("data");
    pub const AT: Self = Self("at");
    pub const REPEAT: Self = Self("repeat");
}

impl Clone for Notification {
    fn clone(&self) -> Self {
        return Notification {
            runtime: EntityRuntimeSlot::default(),
            id: self.id.clone(),
            tag: self.tag.clone(),
            title: self.title.clone(),
            close_callback: Mutex::new(None),
            closed: AtomicBool::new(false),
        };
    }
}

impl std::fmt::Debug for Notification {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f.debug_struct("Notification")
            .field("id", &self.id)
            .field("tag", &self.tag)
            .field("title", &self.title)
            .finish();
    }
}

impl Default for Notification {
    fn default() -> Self {
        return Notification {
            runtime: EntityRuntimeSlot::default(),
            id: String::new(),
            tag: String::new(),
            title: String::new(),
            close_callback: Mutex::new(None),
            closed: AtomicBool::new(false),
        };
    }
}

impl Default for NotificationActionSubscription {
    fn default() -> Self {
        return NotificationActionSubscription {
            runtime: EntityRuntimeSlot::default(),
            on_notification_action: Signal::default(),
            attachment: Mutex::new(None),
            disposed: AtomicBool::new(false),
            dispose_completed: AtomicBool::new(false),
            generation: AtomicU32::new(0),
        };
    }
}

impl Default for NotificationCancelReason {
    fn default() -> Self {
        return NotificationCancelReason::OperationFailed;
    }
}

impl Default for NotificationClickSubscription {
    fn default() -> Self {
        return NotificationClickSubscription {
            runtime: EntityRuntimeSlot::default(),
            on_notification_click: Signal::default(),
            attachment: Mutex::new(None),
            disposed: AtomicBool::new(false),
            dispose_completed: AtomicBool::new(false),
            generation: AtomicU32::new(0),
        };
    }
}

impl Default for NotificationCloseReason {
    fn default() -> Self {
        return NotificationCloseReason::OperationFailed;
    }
}

impl Default for NotificationDirection {
    fn default() -> Self {
        return NotificationDirection::Auto;
    }
}

impl Default for NotificationDismissSubscription {
    fn default() -> Self {
        return NotificationDismissSubscription {
            runtime: EntityRuntimeSlot::default(),
            on_notification_dismiss: Signal::default(),
            attachment: Mutex::new(None),
            disposed: AtomicBool::new(false),
            dispose_completed: AtomicBool::new(false),
            generation: AtomicU32::new(0),
        };
    }
}

impl Default for NotificationPermission {
    fn default() -> Self {
        return NotificationPermission::Default;
    }
}

impl Default for NotificationReceivedSubscription {
    fn default() -> Self {
        return NotificationReceivedSubscription {
            runtime: EntityRuntimeSlot::default(),
            on_notification_received: Signal::default(),
            attachment: Mutex::new(None),
            disposed: AtomicBool::new(false),
            dispose_completed: AtomicBool::new(false),
            generation: AtomicU32::new(0),
        };
    }
}

impl Default for NotificationReplySubscription {
    fn default() -> Self {
        return NotificationReplySubscription {
            runtime: EntityRuntimeSlot::default(),
            on_notification_reply: Signal::default(),
            attachment: Mutex::new(None),
            disposed: AtomicBool::new(false),
            dispose_completed: AtomicBool::new(false),
            generation: AtomicU32::new(0),
        };
    }
}

impl Default for NotificationScheduleRepeat {
    fn default() -> Self {
        return NotificationScheduleRepeat::Day;
    }
}

impl Clone for ScheduledNotification {
    fn clone(&self) -> Self {
        return ScheduledNotification {
            runtime: EntityRuntimeSlot::default(),
            id: self.id.clone(),
            request: self.request.clone(),
            schedule: self.schedule.clone(),
            cancel_callback: Mutex::new(None),
            cancelled: AtomicBool::new(false),
        };
    }
}

impl std::fmt::Debug for ScheduledNotification {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f.debug_struct("ScheduledNotification")
            .field("id", &self.id)
            .field("request", &self.request)
            .field("schedule", &self.schedule)
            .finish();
    }
}

impl Default for ScheduledNotification {
    fn default() -> Self {
        return ScheduledNotification {
            runtime: EntityRuntimeSlot::default(),
            id: String::new(),
            request: NotificationRequest::default(),
            schedule: NotificationSchedule::default(),
            cancel_callback: Mutex::new(None),
            cancelled: AtomicBool::new(false),
        };
    }
}

flight_entity::impl_entity!(Notification);
flight_entity::impl_entity!(NotificationActionSubscription);
flight_entity::impl_entity!(NotificationClickSubscription);
flight_entity::impl_entity!(NotificationDismissSubscription);
flight_entity::impl_entity!(NotificationReceivedSubscription);
flight_entity::impl_entity!(NotificationReplySubscription);
flight_entity::impl_entity!(ScheduledNotification);
