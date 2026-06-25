//! Value types for the app-identity / process seam (`flighthq-app`).
//!
//! The event entity [`App`](crate::platform::App) and the [`AppBackend`](crate::platform::AppBackend)
//! trait live in `platform`; this module holds the plain value descriptors they
//! exchange: login-item settings, the app-relative directory kind, and the macOS
//! activation policy.

/// macOS activation policy, controlling dock presence and Command-Tab
/// visibility. No-op on non-macOS and web. Mirrors the TS `AppActivationPolicy`
/// string union.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum AppActivationPolicy {
    /// The app appears in the dock and the Command-Tab switcher (default).
    Regular,
    /// The app runs as an accessory: no dock icon, not in Command-Tab.
    Accessory,
    /// The app is prohibited from activating (background-only).
    Prohibited,
}

impl AppActivationPolicy {
    /// The canonical string form, matching the TS `AppActivationPolicy` union.
    pub fn as_str(self) -> &'static str {
        match self {
            AppActivationPolicy::Regular => "regular",
            AppActivationPolicy::Accessory => "accessory",
            AppActivationPolicy::Prohibited => "prohibited",
        }
    }
}

/// Application login-item (launch-at-startup) settings. Returned by the backend;
/// the web default reports `open_at_login: false`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AppLoginItem {
    /// Whether the app is registered to launch at login.
    pub open_at_login: bool,
    /// Whether the app launches hidden (macOS).
    pub open_as_hidden: bool,
    /// Extra arguments passed at launch.
    pub args: Vec<String>,
    /// The executable path registered for launch, or `""` when unset.
    pub path: String,
}

/// A partial [`AppLoginItem`] update. Fields left `None` keep their current
/// values. Mirrors the TS `AppLoginItemLike` partial input.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AppLoginItemLike {
    /// When `Some`, sets whether the app launches at login.
    pub open_at_login: Option<bool>,
    /// When `Some`, sets whether the app launches hidden.
    pub open_as_hidden: Option<bool>,
    /// When `Some`, sets the extra launch arguments.
    pub args: Option<Vec<String>>,
    /// When `Some`, sets the registered executable path.
    pub path: Option<String>,
}

/// App-identity-relative directory kinds for the `get_app_directory_path` seam.
/// Distinct from bare OS directories (home, documents, …), which live in
/// `flighthq-filesystem`. Mirrors the TS `AppPathKind` string union.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum AppPathKind {
    /// The per-app user-data directory.
    UserData,
    /// The per-app logs directory.
    Logs,
    /// The per-app crash-dump directory.
    CrashDumps,
}

impl AppPathKind {
    /// The canonical string form, matching the TS `AppPathKind` union.
    pub fn as_str(self) -> &'static str {
        match self {
            AppPathKind::UserData => "userData",
            AppPathKind::Logs => "logs",
            AppPathKind::CrashDumps => "crashDumps",
        }
    }
}
