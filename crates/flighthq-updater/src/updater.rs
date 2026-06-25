//! Updater free functions and backend management.

use flighthq_signals::emit_signal;
use flighthq_types::{
    AppUpdater, UpdateInfo, UpdateProgress, UpdaterBackend, UpdaterConfig, UpdaterError,
    UpdaterPhase, UpdaterSignatureConfig, UpdaterState,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Begins delivering update lifecycle events to `updater`'s signals by
/// subscribing to the active backend. Each `subscribe_*` is wired to its
/// matching signal, and the phase state is updated on every event so
/// [`get_app_updater_state`] reflects the latest lifecycle. Idempotent: a prior
/// subscription is torn down first. Pair with
/// [`detach_app_updater`]/[`dispose_app_updater`].
pub fn attach_app_updater(updater: &AppUpdater) {
    detach_app_updater(updater);
    let backend = get_updater_backend();
    let updater_ptr = updater as *const AppUpdater as usize;

    let sig_checking = updater.on_checking.clone();
    let sig_available = updater.on_update_available.clone();
    let sig_not_available = updater.on_update_not_available.clone();
    let sig_progress = updater.on_download_progress.clone();
    let sig_downloaded = updater.on_update_downloaded.clone();
    let sig_error = updater.on_error.clone();
    let sig_cancelled = updater.on_update_cancelled.clone();
    let sig_staging = updater.on_update_staging.clone();
    let sig_verified = updater.on_update_verified.clone();
    let sig_rolled_back = updater.on_update_rolled_back.clone();

    let unsub_checking = backend.subscribe_checking(Box::new(move || {
        set_state(updater_ptr, |_| UpdaterState {
            phase: UpdaterPhase::Checking,
            info: None,
            progress: None,
            error: None,
        });
        emit_signal(&sig_checking, &());
    }));
    let unsub_available = backend.subscribe_update_available(Box::new(move |info: UpdateInfo| {
        let info_for_signal = info.clone();
        set_state(updater_ptr, move |_| UpdaterState {
            phase: UpdaterPhase::UpdateAvailable,
            info: Some(info.clone()),
            progress: None,
            error: None,
        });
        emit_signal(&sig_available, &info_for_signal);
    }));
    let unsub_not_available = backend.subscribe_update_not_available(Box::new(move || {
        set_state(updater_ptr, |prev| UpdaterState {
            phase: UpdaterPhase::Idle,
            ..prev
        });
        emit_signal(&sig_not_available, &());
    }));
    let unsub_progress =
        backend.subscribe_download_progress(Box::new(move |progress: UpdateProgress| {
            let progress_for_signal = progress.clone();
            set_state(updater_ptr, move |prev| UpdaterState {
                phase: UpdaterPhase::Downloading,
                progress: Some(progress.clone()),
                ..prev
            });
            emit_signal(&sig_progress, &progress_for_signal);
        }));
    let unsub_downloaded =
        backend.subscribe_update_downloaded(Box::new(move |info: UpdateInfo| {
            let info_for_signal = info.clone();
            set_state(updater_ptr, move |prev| UpdaterState {
                phase: UpdaterPhase::Downloaded,
                info: Some(info.clone()),
                progress: None,
                ..prev
            });
            emit_signal(&sig_downloaded, &info_for_signal);
        }));
    let unsub_error = backend.subscribe_error(Box::new(move |error: UpdaterError| {
        let error_for_signal = error.clone();
        set_state(updater_ptr, move |prev| UpdaterState {
            phase: UpdaterPhase::Error,
            error: Some(error.clone()),
            ..prev
        });
        emit_signal(&sig_error, &error_for_signal);
    }));
    let unsub_cancelled = backend.subscribe_update_cancelled(Box::new(move || {
        set_state(updater_ptr, |prev| UpdaterState {
            phase: UpdaterPhase::Idle,
            ..prev
        });
        emit_signal(&sig_cancelled, &());
    }));
    let unsub_staging = backend.subscribe_update_staging(Box::new(move || {
        set_state(updater_ptr, |prev| UpdaterState {
            phase: UpdaterPhase::Staging,
            ..prev
        });
        emit_signal(&sig_staging, &());
    }));
    let unsub_verified = backend.subscribe_update_verified(Box::new(move || {
        emit_signal(&sig_verified, &());
    }));
    let unsub_rolled_back = backend.subscribe_update_rolled_back(Box::new(move || {
        set_state(updater_ptr, |_| UpdaterState {
            phase: UpdaterPhase::Idle,
            info: None,
            progress: None,
            error: None,
        });
        emit_signal(&sig_rolled_back, &());
    }));

    let mut subs = SUBSCRIPTIONS
        .lock()
        .expect("updater subscriptions mutex poisoned");
    subs.push(UpdaterSubscription {
        updater_ptr,
        unsubscribes: vec![
            unsub_checking,
            unsub_available,
            unsub_not_available,
            unsub_progress,
            unsub_downloaded,
            unsub_error,
            unsub_cancelled,
            unsub_staging,
            unsub_verified,
            unsub_rolled_back,
        ],
    });
}

/// Asks the active backend to cancel a download in progress. Result arrives via
/// `on_update_cancelled` or `on_error(kind: 'Cancelled')` depending on the
/// backend.
pub fn cancel_app_update_download() {
    get_updater_backend().cancel_download();
}

/// Triggers a check; if an update is found and `auto_download` is true, also
/// starts the download. This is a single-call convenience; results still arrive
/// through signals.
pub fn check_and_download_app_update() {
    let config = get_updater_config();
    get_updater_backend().check_for_updates();
    if config.auto_download {
        get_updater_backend().download_update();
    }
}

/// Asks the active backend to check for an available update. Lifecycle results
/// arrive through the attached [`AppUpdater`]'s signals.
pub fn check_for_app_update() {
    get_updater_backend().check_for_updates();
}

/// Allocates an [`AppUpdater`] event entity with inert signals and an Idle
/// state. Call [`attach_app_updater`] to start delivery.
pub fn create_app_updater() -> AppUpdater {
    AppUpdater::default()
}

/// Allocates an [`UpdaterConfig`] with the recommended defaults: manual
/// download, no auto-install, no prerelease.
pub fn create_updater_config() -> UpdaterConfig {
    UpdaterConfig {
        allow_prerelease: false,
        auto_download: false,
        auto_install_on_app_quit: false,
    }
}

/// Allocates a zeroed [`UpdaterState`] at the Idle phase with all payloads
/// `None`.
pub fn create_updater_state() -> UpdaterState {
    UpdaterState {
        error: None,
        info: None,
        phase: UpdaterPhase::Idle,
        progress: None,
    }
}

/// Builds the default web backend. Auto-update needs a native host, so every
/// command no-ops and every `subscribe_*` returns an inert unsubscribe — the
/// browser has no application updater to drive.
pub fn create_web_updater_backend() -> Arc<dyn UpdaterBackend> {
    Arc::new(WebUpdaterBackend {
        config: Mutex::new(create_updater_config()),
        channel: Mutex::new("stable".to_string()),
    })
}

/// Stops delivery to `updater` and forgets its subscription. Safe to call
/// when not attached.
pub fn detach_app_updater(updater: &AppUpdater) {
    let updater_ptr = updater as *const AppUpdater as usize;
    let removed = {
        let mut subs = SUBSCRIPTIONS
            .lock()
            .expect("updater subscriptions mutex poisoned");
        let index = subs.iter().position(|s| s.updater_ptr == updater_ptr);
        index.map(|i| subs.swap_remove(i))
    };
    // Invoke each unsubscribe to tell the backend to stop delivery. Dropping
    // the closures is not enough; the backend only stops when each is called.
    if let Some(sub) = removed {
        for unsubscribe in &sub.unsubscribes {
            unsubscribe();
        }
    }
}

/// Releases `updater` by detaching its backend subscription. The signals
/// remain plain memory afterward.
pub fn dispose_app_updater(updater: &AppUpdater) {
    detach_app_updater(updater);
}

/// Asks the active backend to download the available update. Progress and
/// completion arrive through the attached [`AppUpdater`]'s signals.
pub fn download_app_update() {
    get_updater_backend().download_update();
}

/// Returns the current queryable lifecycle state for `updater`. This lets a late
/// subscriber or UI read whether a check is pending, what update is available,
/// or the last error, without having listened since the beginning.
pub fn get_app_updater_state(updater: &AppUpdater) -> UpdaterState {
    let updater_ptr = updater as *const AppUpdater as usize;
    let states = STATES.lock().expect("updater states mutex poisoned");
    states
        .as_ref()
        .and_then(|m| m.get(&updater_ptr).cloned())
        .unwrap_or_else(create_updater_state)
}

/// Returns the active updater backend. Lazily installs the web default when
/// none has been set. There is always a backend.
pub fn get_updater_backend() -> Arc<dyn UpdaterBackend> {
    let mut guard = BACKEND.lock().expect("updater backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_web_updater_backend());
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Returns the active update channel string. Conventional values are `stable`,
/// `beta`, `alpha`.
pub fn get_updater_channel() -> String {
    get_updater_backend().get_channel()
}

/// Returns a copy of the active updater configuration.
pub fn get_updater_config() -> UpdaterConfig {
    get_updater_backend().get_config()
}

/// Deterministic check for staged-rollout eligibility. Returns true when the
/// given `rollout_seed` (a number in `[0, 1)`) falls within the update's staged
/// rollout percentage. A seed derived from a stable device/user identifier
/// ensures consistent results across sessions for the same device.
/// NOTE: `staged_rollout_percent` is 0–100; 100 means full rollout.
pub fn is_app_update_eligible(info: &UpdateInfo, rollout_seed: f64) -> bool {
    rollout_seed * 100.0 < info.staged_rollout_percent
}

/// Quits the application and installs a downloaded update via the active
/// backend.
pub fn quit_and_install_update() {
    get_updater_backend().quit_and_install();
}

/// Requests the active backend to roll back the last installed update. The
/// backend must support rollback (Squirrel/MSIX); the web default no-ops.
/// Result arrives via `on_update_rolled_back`.
pub fn rollback_app_update() {
    get_updater_backend().rollback();
}

/// Installs a native host updater backend. Pass `None` to fall back to the web
/// default on the next call to [`get_updater_backend`].
pub fn set_updater_backend(backend: Option<Arc<dyn UpdaterBackend>>) {
    let mut guard = BACKEND.lock().expect("updater backend mutex poisoned");
    *guard = backend;
}

/// Sets the active update channel. Conventional values: `stable`, `beta`,
/// `alpha`. Free string so hosts and apps can define their own channels.
/// Layered over the feed URL, not replacing it.
pub fn set_updater_channel(channel: &str) {
    get_updater_backend().set_channel(channel);
}

/// Applies an updater configuration (auto-download, auto-install-on-quit,
/// allow-prerelease) to the active backend.
pub fn set_updater_config(config: &UpdaterConfig) {
    get_updater_backend().set_config(config);
}

/// Points the active backend at an update feed URL.
pub fn set_updater_feed_url(url: &str) {
    get_updater_backend().set_feed_url(url);
}

/// Configures signature/integrity verification for the active backend.
/// Verification executes in the host backend; this package owns the
/// configuration contract and the result events. Pass `None` to clear any
/// previously set signature config.
pub fn set_updater_signature_config(config: Option<&UpdaterSignatureConfig>) {
    get_updater_backend().set_signature_config(config);
}

/// Updates the per-entity state. The `update` closure receives the previous
/// state (or a fresh Idle state) and returns the next state.
fn set_state(updater_ptr: usize, update: impl FnOnce(UpdaterState) -> UpdaterState) {
    let mut guard = STATES.lock().expect("updater states mutex poisoned");
    let states = guard.get_or_insert_with(HashMap::new);
    let prev = states
        .get(&updater_ptr)
        .cloned()
        .unwrap_or_else(create_updater_state);
    states.insert(updater_ptr, update(prev));
}

/// Default backend. Auto-update needs a host, so every command no-ops (the
/// channel and config are still stored/returned so queries are consistent) and
/// every `subscribe_*` returns an inert unsubscribe. A native host replaces this
/// via [`set_updater_backend`].
struct WebUpdaterBackend {
    config: Mutex<UpdaterConfig>,
    channel: Mutex<String>,
}

impl UpdaterBackend for WebUpdaterBackend {
    fn cancel_download(&self) {}

    fn check_for_updates(&self) {}

    fn download_update(&self) {}

    fn get_channel(&self) -> String {
        self.channel.lock().unwrap().clone()
    }

    fn get_config(&self) -> UpdaterConfig {
        self.config.lock().unwrap().clone()
    }

    fn quit_and_install(&self) {}

    fn rollback(&self) {}

    fn set_channel(&self, channel: &str) {
        *self.channel.lock().unwrap() = channel.to_string();
    }

    fn set_config(&self, config: &UpdaterConfig) {
        *self.config.lock().unwrap() = config.clone();
    }

    fn set_feed_url(&self, _url: &str) {}

    fn set_signature_config(&self, _config: Option<&UpdaterSignatureConfig>) {}

    fn subscribe_checking(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_download_progress(
        &self,
        _listener: Box<dyn Fn(UpdateProgress) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_error(
        &self,
        _listener: Box<dyn Fn(UpdaterError) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_available(
        &self,
        _listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_cancelled(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_downloaded(
        &self,
        _listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_not_available(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_rolled_back(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_staging(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_verified(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

static BACKEND: Mutex<Option<Arc<dyn UpdaterBackend>>> = Mutex::new(None);

/// Per-entity lifecycle state, keyed by the [`AppUpdater`]'s address. The Rust
/// analogue of the TS `WeakMap<AppUpdater, UpdaterState>`; entries are cleared
/// when the entity is dropped only via explicit detach paths, matching the
/// interaction-state seam divergence.
static STATES: Mutex<Option<HashMap<usize, UpdaterState>>> = Mutex::new(None);

/// Holds the unsubscribe closures that keep backend delivery alive for one
/// attached [`AppUpdater`]. [`detach_app_updater`] invokes each before dropping
/// the entry, telling the backend to stop delivery.
struct UpdaterSubscription {
    // Used only as a map key; never dereferenced.
    updater_ptr: usize,
    unsubscribes: Vec<Box<dyn Fn() + Send + Sync>>,
}

static SUBSCRIPTIONS: Mutex<Vec<UpdaterSubscription>> = Mutex::new(Vec::new());

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{SlotGuard, connect_signal};
    use serial_test::serial;
    use std::sync::atomic::{AtomicU32, Ordering};

    type Listener0 = Box<dyn Fn() + Send + Sync>;
    type ListenerInfo = Box<dyn Fn(UpdateInfo) + Send + Sync>;
    type ListenerProgress = Box<dyn Fn(UpdateProgress) + Send + Sync>;
    type ListenerError = Box<dyn Fn(UpdaterError) + Send + Sync>;

    fn full_update_info() -> UpdateInfo {
        UpdateInfo {
            delta_from_version: None,
            download_size_bytes: 10_000_000,
            is_mandatory: false,
            minimum_os_version: None,
            notes: "fixes".to_string(),
            release_date: "2026-06-19".to_string(),
            sha512: "abc123".to_string(),
            staged_rollout_percent: 100.0,
            version: "1.2.3".to_string(),
        }
    }

    /// Backend that records command calls and lets a test fire each event by
    /// invoking the most recently registered listener. Each `subscribe_*`
    /// returns an unsubscribe that clears its stored listener, mirroring the
    /// TS fake so detach actually stops delivery.
    #[derive(Default)]
    struct FakeBackend {
        feed_url: Mutex<String>,
        channel: Mutex<Option<String>>,
        config: Mutex<Option<UpdaterConfig>>,
        checked: AtomicU32,
        downloaded: AtomicU32,
        quit: AtomicU32,
        cancelled: AtomicU32,
        rolled_back: AtomicU32,
        checking: Arc<Mutex<Option<Arc<Listener0>>>>,
        update_available: Arc<Mutex<Option<Arc<ListenerInfo>>>>,
        update_not_available: Arc<Mutex<Option<Arc<Listener0>>>>,
        download_progress: Arc<Mutex<Option<Arc<ListenerProgress>>>>,
        update_downloaded: Arc<Mutex<Option<Arc<ListenerInfo>>>>,
        error: Arc<Mutex<Option<Arc<ListenerError>>>>,
        update_cancelled: Arc<Mutex<Option<Arc<Listener0>>>>,
        update_staging: Arc<Mutex<Option<Arc<Listener0>>>>,
        update_verified: Arc<Mutex<Option<Arc<Listener0>>>>,
        update_rolled_back: Arc<Mutex<Option<Arc<Listener0>>>>,
    }

    impl FakeBackend {
        fn fire_checking(&self) {
            if let Some(l) = self.checking.lock().unwrap().clone() {
                l();
            }
        }
        fn fire_update_available(&self, info: UpdateInfo) {
            if let Some(l) = self.update_available.lock().unwrap().clone() {
                l(info);
            }
        }
        fn fire_update_not_available(&self) {
            if let Some(l) = self.update_not_available.lock().unwrap().clone() {
                l();
            }
        }
        fn fire_download_progress(&self, progress: UpdateProgress) {
            if let Some(l) = self.download_progress.lock().unwrap().clone() {
                l(progress);
            }
        }
        fn fire_update_downloaded(&self, info: UpdateInfo) {
            if let Some(l) = self.update_downloaded.lock().unwrap().clone() {
                l(info);
            }
        }
        fn fire_error(&self, error: UpdaterError) {
            if let Some(l) = self.error.lock().unwrap().clone() {
                l(error);
            }
        }
        fn fire_update_cancelled(&self) {
            if let Some(l) = self.update_cancelled.lock().unwrap().clone() {
                l();
            }
        }
        fn fire_update_staging(&self) {
            if let Some(l) = self.update_staging.lock().unwrap().clone() {
                l();
            }
        }
        fn fire_update_verified(&self) {
            if let Some(l) = self.update_verified.lock().unwrap().clone() {
                l();
            }
        }
        fn fire_update_rolled_back(&self) {
            if let Some(l) = self.update_rolled_back.lock().unwrap().clone() {
                l();
            }
        }
    }

    impl UpdaterBackend for FakeBackend {
        fn cancel_download(&self) {
            self.cancelled.fetch_add(1, Ordering::SeqCst);
        }
        fn check_for_updates(&self) {
            self.checked.fetch_add(1, Ordering::SeqCst);
        }
        fn download_update(&self) {
            self.downloaded.fetch_add(1, Ordering::SeqCst);
        }
        fn get_channel(&self) -> String {
            self.channel
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| "stable".to_string())
        }
        fn get_config(&self) -> UpdaterConfig {
            self.config
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(create_updater_config)
        }
        fn quit_and_install(&self) {
            self.quit.fetch_add(1, Ordering::SeqCst);
        }
        fn rollback(&self) {
            self.rolled_back.fetch_add(1, Ordering::SeqCst);
        }
        fn set_channel(&self, channel: &str) {
            *self.channel.lock().unwrap() = Some(channel.to_string());
        }
        fn set_config(&self, config: &UpdaterConfig) {
            *self.config.lock().unwrap() = Some(config.clone());
        }
        fn set_feed_url(&self, url: &str) {
            *self.feed_url.lock().unwrap() = url.to_string();
        }
        fn set_signature_config(&self, _config: Option<&UpdaterSignatureConfig>) {}
        fn subscribe_checking(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.checking.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.checking.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_download_progress(
            &self,
            listener: ListenerProgress,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.download_progress.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.download_progress.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_error(&self, listener: ListenerError) -> Box<dyn Fn() + Send + Sync> {
            *self.error.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.error.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_available(
            &self,
            listener: ListenerInfo,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.update_available.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_available.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_cancelled(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.update_cancelled.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_cancelled.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_downloaded(
            &self,
            listener: ListenerInfo,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.update_downloaded.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_downloaded.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_not_available(
            &self,
            listener: Listener0,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.update_not_available.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_not_available.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_rolled_back(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.update_rolled_back.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_rolled_back.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_staging(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.update_staging.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_staging.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn subscribe_update_verified(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.update_verified.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.update_verified.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
    }

    // The backend registry is a process-global static, so tests that install a
    // backend must not run concurrently. Each test takes this lock for its
    // duration; the returned guard is held until the test returns.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn install_fake() -> (std::sync::MutexGuard<'static, ()>, Arc<FakeBackend>) {
        let guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let backend = Arc::new(FakeBackend::default());
        set_updater_backend(Some(backend.clone()));
        (guard, backend)
    }

    #[test]
    #[serial]
    fn attach_app_updater_is_idempotent_reattach_tears_down_first() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();
        let checking = Arc::new(AtomicU32::new(0));
        let c = checking.clone();
        let _g: SlotGuard<()> = connect_signal(
            &updater.on_checking,
            Arc::new(move |_| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        attach_app_updater(&updater);
        attach_app_updater(&updater);
        backend.fire_checking();
        assert_eq!(checking.load(Ordering::SeqCst), 1);
        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn attach_app_updater_is_safe_when_not_previously_attached() {
        let (_lock, _backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);
        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn attach_app_updater_wires_all_ten_signals_and_updates_state() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();

        let checking = Arc::new(AtomicU32::new(0));
        let not_available = Arc::new(AtomicU32::new(0));
        let available = Arc::new(Mutex::new(None::<UpdateInfo>));
        let downloaded = Arc::new(Mutex::new(None::<UpdateInfo>));
        let progress = Arc::new(Mutex::new(None::<UpdateProgress>));
        let received_error = Arc::new(Mutex::new(None::<UpdaterError>));
        let cancelled = Arc::new(AtomicU32::new(0));
        let staging = Arc::new(AtomicU32::new(0));
        let verified = Arc::new(AtomicU32::new(0));
        let rolled_back = Arc::new(AtomicU32::new(0));

        let c = checking.clone();
        let _g1: SlotGuard<()> = connect_signal(
            &updater.on_checking,
            Arc::new(move |_| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let n = not_available.clone();
        let _g2: SlotGuard<()> = connect_signal(
            &updater.on_update_not_available,
            Arc::new(move |_| {
                n.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let av = available.clone();
        let _g3: SlotGuard<UpdateInfo> = connect_signal(
            &updater.on_update_available,
            Arc::new(move |info: &UpdateInfo| {
                *av.lock().unwrap() = Some(info.clone());
            }),
            Default::default(),
        );
        let p = progress.clone();
        let _g4: SlotGuard<UpdateProgress> = connect_signal(
            &updater.on_download_progress,
            Arc::new(move |v: &UpdateProgress| {
                *p.lock().unwrap() = Some(v.clone());
            }),
            Default::default(),
        );
        let dv = downloaded.clone();
        let _g5: SlotGuard<UpdateInfo> = connect_signal(
            &updater.on_update_downloaded,
            Arc::new(move |info: &UpdateInfo| {
                *dv.lock().unwrap() = Some(info.clone());
            }),
            Default::default(),
        );
        let e = received_error.clone();
        let _g6: SlotGuard<UpdaterError> = connect_signal(
            &updater.on_error,
            Arc::new(move |err: &UpdaterError| {
                *e.lock().unwrap() = Some(err.clone());
            }),
            Default::default(),
        );
        let cl = cancelled.clone();
        let _g7: SlotGuard<()> = connect_signal(
            &updater.on_update_cancelled,
            Arc::new(move |_| {
                cl.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let st = staging.clone();
        let _g8: SlotGuard<()> = connect_signal(
            &updater.on_update_staging,
            Arc::new(move |_| {
                st.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let vf = verified.clone();
        let _g9: SlotGuard<()> = connect_signal(
            &updater.on_update_verified,
            Arc::new(move |_| {
                vf.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let rb = rolled_back.clone();
        let _g10: SlotGuard<()> = connect_signal(
            &updater.on_update_rolled_back,
            Arc::new(move |_| {
                rb.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_app_updater(&updater);

        let prog = UpdateProgress {
            bytes_per_second: 1000.0,
            is_delta: false,
            percent: 42.0,
            total_bytes: 100,
            transferred_bytes: 42,
        };
        let err = UpdaterError {
            kind: "Network".to_string(),
            message: "timeout".to_string(),
        };

        backend.fire_checking();
        backend.fire_update_available(full_update_info());
        backend.fire_update_not_available();
        backend.fire_download_progress(prog.clone());
        backend.fire_update_downloaded(full_update_info());
        backend.fire_error(err.clone());
        backend.fire_update_cancelled();
        backend.fire_update_staging();
        backend.fire_update_verified();
        backend.fire_update_rolled_back();

        assert_eq!(checking.load(Ordering::SeqCst), 1);
        assert_eq!(not_available.load(Ordering::SeqCst), 1);
        assert_eq!(*available.lock().unwrap(), Some(full_update_info()));
        assert_eq!(*downloaded.lock().unwrap(), Some(full_update_info()));
        assert_eq!(*progress.lock().unwrap(), Some(prog));
        assert_eq!(*received_error.lock().unwrap(), Some(err));
        assert_eq!(cancelled.load(Ordering::SeqCst), 1);
        assert_eq!(staging.load(Ordering::SeqCst), 1);
        assert_eq!(verified.load(Ordering::SeqCst), 1);
        assert_eq!(rolled_back.load(Ordering::SeqCst), 1);

        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn attach_app_updater_updates_state_machine_phases_in_order() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);

        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Idle);

        backend.fire_checking();
        assert_eq!(
            get_app_updater_state(&updater).phase,
            UpdaterPhase::Checking
        );

        backend.fire_update_available(full_update_info());
        assert_eq!(
            get_app_updater_state(&updater).phase,
            UpdaterPhase::UpdateAvailable
        );
        assert_eq!(
            get_app_updater_state(&updater).info,
            Some(full_update_info())
        );

        let prog = UpdateProgress {
            bytes_per_second: 500.0,
            is_delta: false,
            percent: 50.0,
            total_bytes: 200,
            transferred_bytes: 100,
        };
        backend.fire_download_progress(prog.clone());
        assert_eq!(
            get_app_updater_state(&updater).phase,
            UpdaterPhase::Downloading
        );
        assert_eq!(get_app_updater_state(&updater).progress, Some(prog));

        backend.fire_update_downloaded(full_update_info());
        assert_eq!(
            get_app_updater_state(&updater).phase,
            UpdaterPhase::Downloaded
        );

        backend.fire_update_staging();
        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Staging);

        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn attach_app_updater_transitions_to_error_phase() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);

        let err = UpdaterError {
            kind: "Signature".to_string(),
            message: "bad sig".to_string(),
        };
        backend.fire_error(err.clone());
        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Error);
        assert_eq!(get_app_updater_state(&updater).error, Some(err));

        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn attach_app_updater_resets_to_idle_on_cancel_and_rollback() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);

        backend.fire_checking();
        backend.fire_update_cancelled();
        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Idle);

        backend.fire_checking();
        backend.fire_update_rolled_back();
        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Idle);
        assert_eq!(get_app_updater_state(&updater).info, None);

        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn cancel_app_update_download_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        cancel_app_update_download();
        assert_eq!(backend.cancelled.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn check_and_download_app_update_respects_auto_download() {
        let (_lock, backend) = install_fake();
        backend.set_config(&UpdaterConfig {
            allow_prerelease: false,
            auto_download: true,
            auto_install_on_app_quit: false,
        });
        check_and_download_app_update();
        assert_eq!(backend.checked.load(Ordering::SeqCst), 1);
        assert_eq!(backend.downloaded.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn check_and_download_app_update_only_checks_when_auto_download_false() {
        let (_lock, backend) = install_fake();
        backend.set_config(&UpdaterConfig {
            allow_prerelease: false,
            auto_download: false,
            auto_install_on_app_quit: false,
        });
        check_and_download_app_update();
        assert_eq!(backend.checked.load(Ordering::SeqCst), 1);
        assert_eq!(backend.downloaded.load(Ordering::SeqCst), 0);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn check_for_app_update_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        check_for_app_update();
        assert_eq!(backend.checked.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn create_app_updater_creates_entity_with_all_ten_signals() {
        let updater = create_app_updater();
        let _g: SlotGuard<()> =
            connect_signal(&updater.on_checking, Arc::new(|_| {}), Default::default());
        emit_signal(&updater.on_checking, &());
        emit_signal(&updater.on_update_not_available, &());
        emit_signal(&updater.on_download_progress, &UpdateProgress::default());
        emit_signal(&updater.on_error, &UpdaterError::default());
        emit_signal(&updater.on_update_available, &UpdateInfo::default());
        emit_signal(&updater.on_update_cancelled, &());
        emit_signal(&updater.on_update_downloaded, &UpdateInfo::default());
        emit_signal(&updater.on_update_rolled_back, &());
        emit_signal(&updater.on_update_staging, &());
        emit_signal(&updater.on_update_verified, &());
    }

    #[test]
    #[serial]
    fn create_app_updater_starts_in_idle_with_null_payloads() {
        let updater = create_app_updater();
        let state = get_app_updater_state(&updater);
        assert_eq!(state.phase, UpdaterPhase::Idle);
        assert_eq!(state.info, None);
        assert_eq!(state.progress, None);
        assert_eq!(state.error, None);
    }

    #[test]
    #[serial]
    fn create_updater_config_returns_safe_defaults() {
        let config = create_updater_config();
        assert!(!config.auto_download);
        assert!(!config.auto_install_on_app_quit);
        assert!(!config.allow_prerelease);
    }

    #[test]
    #[serial]
    fn create_updater_state_returns_idle_with_null_payloads() {
        let state = create_updater_state();
        assert_eq!(state.phase, UpdaterPhase::Idle);
        assert_eq!(state.info, None);
        assert_eq!(state.progress, None);
        assert_eq!(state.error, None);
    }

    #[test]
    #[serial]
    fn create_web_updater_backend_no_ops_and_stores_channel_config() {
        let backend = create_web_updater_backend();
        backend.set_feed_url("https://example.com/feed");
        backend.check_for_updates();
        backend.download_update();
        backend.quit_and_install();
        backend.cancel_download();
        backend.rollback();
        backend.set_signature_config(None);
        backend.set_signature_config(Some(&UpdaterSignatureConfig {
            algorithm: "ed25519".to_string(),
            public_key: "abc".to_string(),
        }));
        let unsub = backend.subscribe_checking(Box::new(|| {}));
        unsub();
        let unsub = backend.subscribe_update_cancelled(Box::new(|| {}));
        unsub();
        let unsub = backend.subscribe_update_staging(Box::new(|| {}));
        unsub();
        let unsub = backend.subscribe_update_verified(Box::new(|| {}));
        unsub();
        let unsub = backend.subscribe_update_rolled_back(Box::new(|| {}));
        unsub();

        // Stores and returns channel.
        assert_eq!(backend.get_channel(), "stable");
        backend.set_channel("beta");
        assert_eq!(backend.get_channel(), "beta");

        // Stores and returns config.
        let config = create_updater_config();
        assert_eq!(backend.get_config(), config);
        backend.set_config(&UpdaterConfig {
            auto_download: true,
            ..config
        });
        assert!(backend.get_config().auto_download);
    }

    #[test]
    #[serial]
    fn detach_app_updater_stops_further_delivery() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();
        let checking = Arc::new(AtomicU32::new(0));
        let c = checking.clone();
        let _g: SlotGuard<()> = connect_signal(
            &updater.on_checking,
            Arc::new(move |_| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        attach_app_updater(&updater);
        detach_app_updater(&updater);
        backend.fire_checking();
        assert_eq!(checking.load(Ordering::SeqCst), 0);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn detach_app_updater_is_safe_when_not_attached() {
        let updater = create_app_updater();
        detach_app_updater(&updater);
    }

    #[test]
    #[serial]
    fn dispose_app_updater_detaches_the_subscription() {
        let (_lock, _backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);
        dispose_app_updater(&updater);
        dispose_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn download_app_update_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        download_app_update();
        assert_eq!(backend.downloaded.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn get_app_updater_state_returns_idle_when_never_attached() {
        let updater = create_app_updater();
        assert_eq!(get_app_updater_state(&updater).phase, UpdaterPhase::Idle);
    }

    #[test]
    #[serial]
    fn get_app_updater_state_is_per_entity() {
        let (_lock, backend) = install_fake();
        let a = create_app_updater();
        let b = create_app_updater();
        attach_app_updater(&a);
        backend.fire_checking();
        assert_eq!(get_app_updater_state(&a).phase, UpdaterPhase::Checking);
        assert_eq!(get_app_updater_state(&b).phase, UpdaterPhase::Idle);
        detach_app_updater(&a);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn get_updater_backend_falls_back_to_a_web_backend() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_updater_backend(None);
        let backend = get_updater_backend();
        backend.check_for_updates();
        backend.download_update();
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn get_updater_channel_returns_channel_from_active_backend() {
        let (_lock, backend) = install_fake();
        backend.set_channel("beta");
        assert_eq!(get_updater_channel(), "beta");
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn get_updater_config_returns_config_from_active_backend() {
        let (_lock, _backend) = install_fake();
        assert!(!get_updater_config().auto_download);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn is_app_update_eligible_returns_true_within_rollout() {
        let info = UpdateInfo {
            staged_rollout_percent: 50.0,
            ..full_update_info()
        };
        assert!(is_app_update_eligible(&info, 0.4));
    }

    #[test]
    #[serial]
    fn is_app_update_eligible_returns_false_at_or_above_rollout() {
        let info = UpdateInfo {
            staged_rollout_percent: 50.0,
            ..full_update_info()
        };
        assert!(!is_app_update_eligible(&info, 0.5));
        assert!(!is_app_update_eligible(&info, 0.9));
    }

    #[test]
    #[serial]
    fn is_app_update_eligible_always_eligible_at_full_rollout() {
        let info = UpdateInfo {
            staged_rollout_percent: 100.0,
            ..full_update_info()
        };
        assert!(is_app_update_eligible(&info, 0.99));
    }

    #[test]
    #[serial]
    fn is_app_update_eligible_never_eligible_at_zero_rollout() {
        let info = UpdateInfo {
            staged_rollout_percent: 0.0,
            ..full_update_info()
        };
        assert!(!is_app_update_eligible(&info, 0.0));
    }

    #[test]
    #[serial]
    fn quit_and_install_update_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        quit_and_install_update();
        assert_eq!(backend.quit.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn rollback_app_update_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        rollback_app_update();
        assert_eq!(backend.rolled_back.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn set_updater_backend_clears_back_to_the_web_fallback_when_passed_none() {
        let (_lock, _backend) = install_fake();
        set_updater_backend(None);
        let backend = get_updater_backend();
        backend.check_for_updates();
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn set_updater_channel_sets_channel_on_active_backend() {
        let (_lock, backend) = install_fake();
        set_updater_channel("alpha");
        assert_eq!(backend.get_channel(), "alpha");
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn set_updater_config_forwards_config_to_active_backend() {
        let (_lock, backend) = install_fake();
        set_updater_config(&UpdaterConfig {
            allow_prerelease: true,
            auto_download: true,
            auto_install_on_app_quit: true,
        });
        let config = backend.get_config();
        assert!(config.allow_prerelease);
        assert!(config.auto_download);
        assert!(config.auto_install_on_app_quit);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn set_updater_feed_url_forwards_the_url_to_the_active_backend() {
        let (_lock, backend) = install_fake();
        set_updater_feed_url("https://example.com/feed");
        assert_eq!(
            *backend.feed_url.lock().unwrap(),
            "https://example.com/feed"
        );
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn set_updater_signature_config_forwards_without_panicking() {
        let (_lock, _backend) = install_fake();
        set_updater_signature_config(Some(&UpdaterSignatureConfig {
            algorithm: "ed25519".to_string(),
            public_key: "pubkey".to_string(),
        }));
        set_updater_signature_config(None);
        set_updater_backend(None);
    }
}
