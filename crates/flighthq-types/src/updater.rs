//! Auto-update lifecycle types: the `UpdateInfo` descriptor, download progress
//! and error payloads, the queryable `UpdaterState`, configuration, the
//! `AppUpdater` event entity, and the swappable `UpdaterBackend` seam.

/// Describes an available update. `delta_from_version` and `minimum_os_version`
/// are `None` when not applicable; `staged_rollout_percent` is 0–100 (100 means
/// full rollout).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdateInfo {
    pub delta_from_version: Option<String>,
    pub download_size_bytes: u64,
    pub is_mandatory: bool,
    pub minimum_os_version: Option<String>,
    pub notes: String,
    pub release_date: String,
    pub sha512: String,
    pub staged_rollout_percent: f64,
    pub version: String,
}

/// Progress of an in-flight update download.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdateProgress {
    pub bytes_per_second: f64,
    pub is_delta: bool,
    pub percent: f64,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
}

/// An updater failure. `kind` is a free string (conventionally `Network`,
/// `Signature`, `Cancelled`, etc.) so hosts can define their own categories.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdaterError {
    pub kind: String,
    pub message: String,
}

/// Updater configuration: auto-download, auto-install on app quit, and whether
/// prerelease channels are allowed.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdaterConfig {
    pub allow_prerelease: bool,
    pub auto_download: bool,
    pub auto_install_on_app_quit: bool,
}

/// Signature/integrity verification configuration for a backend.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdaterSignatureConfig {
    pub algorithm: String,
    pub public_key: String,
}

/// The lifecycle phase of an updater. Maps 1:1 to the TS `UpdaterState.phase`
/// string union.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum UpdaterPhase {
    #[default]
    Idle,
    Checking,
    UpdateAvailable,
    Downloading,
    Downloaded,
    Staging,
    Error,
}

/// Queryable lifecycle state for an [`AppUpdater`]. All payloads are `None` in
/// the `Idle` phase.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UpdaterState {
    pub error: Option<UpdaterError>,
    pub info: Option<UpdateInfo>,
    pub phase: UpdaterPhase,
    pub progress: Option<UpdateProgress>,
}

/// Auto-update event entity. Enable delivery with `attach_app_updater`; the
/// signals stay inert until then.
#[derive(Debug, Default)]
pub struct AppUpdater {
    pub on_checking: flighthq_signals::Signal<()>,
    pub on_download_progress: flighthq_signals::Signal<UpdateProgress>,
    pub on_error: flighthq_signals::Signal<UpdaterError>,
    pub on_update_available: flighthq_signals::Signal<UpdateInfo>,
    pub on_update_cancelled: flighthq_signals::Signal<()>,
    pub on_update_downloaded: flighthq_signals::Signal<UpdateInfo>,
    pub on_update_not_available: flighthq_signals::Signal<()>,
    pub on_update_rolled_back: flighthq_signals::Signal<()>,
    pub on_update_staging: flighthq_signals::Signal<()>,
    pub on_update_verified: flighthq_signals::Signal<()>,
}

/// Event seam for auto-update: command methods drive the update lifecycle,
/// `get_*`/`set_*` carry channel/config/signature, and per-event `subscribe_*`
/// methods register listeners. The web default no-ops every command and returns
/// inert unsubscribes; a native host wires these to its own updater.
pub trait UpdaterBackend: Send + Sync {
    fn cancel_download(&self);
    fn check_for_updates(&self);
    fn download_update(&self);
    fn get_channel(&self) -> String;
    fn get_config(&self) -> UpdaterConfig;
    fn quit_and_install(&self);
    fn rollback(&self);
    fn set_channel(&self, channel: &str);
    fn set_config(&self, config: &UpdaterConfig);
    fn set_feed_url(&self, url: &str);
    fn set_signature_config(&self, config: Option<&UpdaterSignatureConfig>);
    fn subscribe_checking(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_download_progress(
        &self,
        listener: Box<dyn Fn(UpdateProgress) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_error(
        &self,
        listener: Box<dyn Fn(UpdaterError) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_available(
        &self,
        listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_cancelled(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_downloaded(
        &self,
        listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_not_available(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_rolled_back(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_staging(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_verified(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}
