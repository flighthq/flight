use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError, Ref};
use flight_host::ProviderRef;
use flight_menu::MenuItemTemplate;
use flight_signals::Signal;

/// macOS activation policy controlling dock presence and Command-Tab visibility (TS
/// `AppActivationPolicy`). `Regular` shows in the dock and switcher; `Accessory` hides from both
/// (menu-bar/agent apps); `Prohibited` is fully background. No-op on non-macOS and web.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppActivationPolicy {
    Regular,
    Accessory,
    Prohibited,
}

/// App login-item (launch-at-startup) settings (TS `AppLoginItem`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppLoginItem {
    /// Whether the app launches automatically when the user logs in.
    pub open_at_login: bool,
    /// Whether the app launches hidden/minimized (macOS).
    pub open_as_hidden: bool,
    /// The executable path the login item points at. "" uses the host default.
    pub path: String,
    /// Extra command-line arguments passed at login launch.
    pub args: Vec<String>,
}

/// Partial login-item settings for `set_app_login_item` (TS `AppLoginItemLike`). `None` fields keep
/// their current values. Plain record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AppLoginItemLike {
    pub open_at_login: Option<bool>,
    pub open_as_hidden: Option<bool>,
    pub path: Option<String>,
    pub args: Option<Vec<String>>,
}

/// App-identity-relative directory kinds resolved by `get_app_directory_path` (TS `AppPathKind`).
/// Bare OS directories live in flight-filesystem, not here.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppPathKind {
    UserData,
    Logs,
    CrashDumps,
}

/// Mobile host target (TS `MobileOsProfile`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MobileOsProfile {
    Android,
    Ios,
}

/// The release a host event subscription returns (TS `() => void`).
pub type AppUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// A host listener for a payload-free app event (TS `() => void`).
pub type AppListener = Arc<dyn Fn() + Send + Sync>;

/// A host listener for an opened file path (TS `(path: string) => void`).
pub type AppOpenFileListener = Arc<dyn Fn(&str) + Send + Sync>;

/// The native quit veto a quit-request listener receives (TS `cancelHost: () => void`).
pub type AppCancelHost = Arc<dyn Fn() + Send + Sync>;

/// A host listener for a quit request (TS `(cancelHost: () => void) => void`).
pub type AppQuitRequestListener = Arc<dyn Fn(AppCancelHost) + Send + Sync>;

/// A host listener for a second-instance launch (TS `(argv: readonly string[]) => void`).
pub type AppSecondInstanceListener = Arc<dyn Fn(&[String]) + Send + Sync>;

/// A provider Promise (D15). `Err` is its rejection, which reaches the caller as the source's
/// returned Promise rejects.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type AppProviderFuture<T> = Pin<Box<dyn Future<Output = Result<T, FlightError>> + Send>>;

/// The six host event slots `AppEvents` attaches, in the source's `AppSubscriptions` key order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AppSubscriptionKey {
    Activate,
    AllWindowsClosed,
    OpenFile,
    QuitRequest,
    Ready,
    SecondInstance,
}

/// The app event entity (TS `AppEvents extends Entity`). Enable delivery with `attach_app_events`;
/// the signals stay inert until then. A listener calls `cancel_signal(&app.on_quit_request)` to veto
/// a quit. The private `subscriptions` replace the source's module WeakMap keyed by the entity: one
/// release per attached host event, kept in first-attach order (the source object's key order), a
/// replacement keeping its slot.
#[derive(Default)]
pub struct AppEvents {
    runtime: EntityRuntimeSlot,
    pub on_activate: Signal<()>,
    pub on_all_windows_closed: Signal<()>,
    pub on_open_file: Signal<String>,
    pub on_quit_request: Signal<()>,
    pub on_ready: Signal<()>,
    pub on_second_instance: Signal<Vec<String>>,
    pub(crate) subscriptions: Option<Vec<(AppSubscriptionKey, AppUnsubscribe)>>,
}

/// TS `HostAppActivateCapability`.
#[derive(Clone)]
pub struct HostAppActivateCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppActivationPolicyCapability`.
#[derive(Clone)]
pub struct HostAppActivationPolicyCapability {
    pub provider: ProviderRef,
    pub set_activation_policy: Arc<dyn Fn(AppActivationPolicy) + Send + Sync>,
}

/// TS `HostAppAllWindowsClosedCapability`.
#[derive(Clone)]
pub struct HostAppAllWindowsClosedCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppBadgeCapability`.
#[derive(Clone)]
pub struct HostAppBadgeCapability {
    pub provider: ProviderRef,
    pub set_badge_count: Arc<dyn Fn(i32) -> AppProviderFuture<bool> + Send + Sync>,
}

/// TS `HostAppDockCapability`. Attention and bounce ids are the provider's integer handles.
#[derive(Clone)]
pub struct HostAppDockCapability {
    pub provider: ProviderRef,
    pub bounce_dock: Arc<dyn Fn() -> i32 + Send + Sync>,
    pub cancel_attention: Arc<dyn Fn(i32) + Send + Sync>,
    pub cancel_dock_bounce: Arc<dyn Fn(i32) + Send + Sync>,
    pub request_attention: Arc<dyn Fn(bool) -> i32 + Send + Sync>,
    pub set_dock_badge: Arc<dyn Fn(&str) + Send + Sync>,
    pub set_dock_menu: Arc<dyn Fn(&[Ref<MenuItemTemplate>]) + Send + Sync>,
}

/// TS `HostAppFocusCapability`.
#[derive(Clone)]
pub struct HostAppFocusCapability {
    pub provider: ProviderRef,
    pub focus: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppHideCapability`.
#[derive(Clone)]
pub struct HostAppHideCapability {
    pub provider: ProviderRef,
    pub hide_app: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppLocaleCapability`.
#[derive(Clone)]
pub struct HostAppLocaleCapability {
    pub provider: ProviderRef,
    pub get_locale: Arc<dyn Fn() -> String + Send + Sync>,
    pub get_preferred_system_languages: Arc<dyn Fn() -> Vec<String> + Send + Sync>,
    pub get_system_locale: Arc<dyn Fn() -> String + Send + Sync>,
}

/// TS `HostAppLoginItemCapability`.
#[derive(Clone)]
pub struct HostAppLoginItemCapability {
    pub provider: ProviderRef,
    pub get_login_item: Arc<dyn Fn() -> AppLoginItem + Send + Sync>,
    pub set_login_item: Arc<dyn Fn(&AppLoginItemLike) + Send + Sync>,
}

/// TS `HostAppNameCapability`.
#[derive(Clone)]
pub struct HostAppNameCapability {
    pub provider: ProviderRef,
    pub get_name: Arc<dyn Fn() -> String + Send + Sync>,
}

/// TS `HostAppNameWriteCapability`.
#[derive(Clone)]
pub struct HostAppNameWriteCapability {
    pub provider: ProviderRef,
    pub set_name: Arc<dyn Fn(&str) + Send + Sync>,
}

/// TS `HostAppOpenFileCapability`.
#[derive(Clone)]
pub struct HostAppOpenFileCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppOpenFileListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppPathCapability`.
#[derive(Clone)]
pub struct HostAppPathCapability {
    pub provider: ProviderRef,
    pub get_app_directory_path: Arc<dyn Fn(AppPathKind) -> String + Send + Sync>,
    pub get_app_path: Arc<dyn Fn() -> String + Send + Sync>,
    pub get_executable_path: Arc<dyn Fn() -> String + Send + Sync>,
}

/// TS `HostAppQuitCapability`.
#[derive(Clone)]
pub struct HostAppQuitCapability {
    pub provider: ProviderRef,
    pub quit: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppQuitRequestCapability`.
#[derive(Clone)]
pub struct HostAppQuitRequestCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppQuitRequestListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppReadyCapability`.
#[derive(Clone)]
pub struct HostAppReadyCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppRecentDocumentsCapability`.
#[derive(Clone)]
pub struct HostAppRecentDocumentsCapability {
    pub provider: ProviderRef,
    pub add_recent_document: Arc<dyn Fn(&str) + Send + Sync>,
    pub clear_recent_documents: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppRelaunchCapability`.
#[derive(Clone)]
pub struct HostAppRelaunchCapability {
    pub provider: ProviderRef,
    pub relaunch: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppSecondInstanceCapability`.
#[derive(Clone)]
pub struct HostAppSecondInstanceCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppSecondInstanceListener) -> AppUnsubscribe + Send + Sync>,
}

/// TS `HostAppShowCapability`.
#[derive(Clone)]
pub struct HostAppShowCapability {
    pub provider: ProviderRef,
    pub show_app: Arc<dyn Fn() + Send + Sync>,
}

/// TS `HostAppSingleInstanceCapability`.
#[derive(Clone)]
pub struct HostAppSingleInstanceCapability {
    pub provider: ProviderRef,
    pub has_single_instance_lock: Arc<dyn Fn() -> bool + Send + Sync>,
    pub release_single_instance_lock: Arc<dyn Fn() + Send + Sync>,
    pub request_single_instance_lock: Arc<dyn Fn() -> bool + Send + Sync>,
}

/// TS `HostAppUserModelIdCapability`.
#[derive(Clone)]
pub struct HostAppUserModelIdCapability {
    pub provider: ProviderRef,
    pub set_user_model_id: Arc<dyn Fn(&str) + Send + Sync>,
}

/// TS `HostAppVersionCapability`.
#[derive(Clone)]
pub struct HostAppVersionCapability {
    pub provider: ProviderRef,
    pub get_version: Arc<dyn Fn() -> String + Send + Sync>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscriptions are closures, so Debug reports how many are attached
impl fmt::Debug for AppEvents {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("AppEvents")
            .field("on_activate", &self.on_activate)
            .field("on_all_windows_closed", &self.on_all_windows_closed)
            .field("on_open_file", &self.on_open_file)
            .field("on_quit_request", &self.on_quit_request)
            .field("on_ready", &self.on_ready)
            .field("on_second_instance", &self.on_second_instance)
            .field(
                "attached",
                &self
                    .subscriptions
                    .as_ref()
                    .map_or(0, |entries| entries.len()),
            )
            .finish();
    }
}

flight_entity::impl_entity!(AppEvents);
