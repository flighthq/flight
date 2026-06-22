//! Updater free functions and backend management.

use flighthq_signals::emit_signal;
use flighthq_types::{AppUpdater, UpdateInfo, UpdaterBackend};
use std::sync::{Arc, Mutex};

/// Begins delivering update lifecycle events to `updater`'s signals by
/// subscribing to the active backend. Wires each `subscribe_*` to its
/// matching signal. Idempotent: a prior subscription is torn down first.
/// Pair with [`detach_app_updater`]/[`dispose_app_updater`].
pub fn attach_app_updater(updater: &AppUpdater) {
    detach_app_updater(updater);
    let backend = get_updater_backend();

    let sig_checking = updater.on_checking.clone();
    let sig_available = updater.on_update_available.clone();
    let sig_not_available = updater.on_update_not_available.clone();
    let sig_progress = updater.on_download_progress.clone();
    let sig_downloaded = updater.on_update_downloaded.clone();
    let sig_error = updater.on_error.clone();

    let unsub_checking = backend.subscribe_checking(Box::new(move || {
        emit_signal(&sig_checking, &());
    }));
    let unsub_available = backend.subscribe_update_available(Box::new(move |info: UpdateInfo| {
        emit_signal(&sig_available, &info);
    }));
    let unsub_not_available = backend.subscribe_update_not_available(Box::new(move || {
        emit_signal(&sig_not_available, &());
    }));
    let unsub_progress = backend.subscribe_download_progress(Box::new(move |percent: f32| {
        emit_signal(&sig_progress, &percent);
    }));
    let unsub_downloaded =
        backend.subscribe_update_downloaded(Box::new(move |info: UpdateInfo| {
            emit_signal(&sig_downloaded, &info);
        }));
    let unsub_error = backend.subscribe_error(Box::new(move |message: String| {
        emit_signal(&sig_error, &message);
    }));

    let updater_ptr = updater as *const AppUpdater as usize;
    let mut subs = SUBSCRIPTIONS
        .lock()
        .expect("updater subscriptions mutex poisoned");
    subs.push(UpdaterSubscription {
        updater_ptr,
        unsub_checking,
        unsub_available,
        unsub_not_available,
        unsub_progress,
        unsub_downloaded,
        unsub_error,
    });
}

/// Asks the active backend to check for an available update. Lifecycle results
/// arrive through the attached [`AppUpdater`]'s signals.
pub fn check_for_updates() {
    get_updater_backend().check_for_updates();
}

/// Allocates an [`AppUpdater`] event entity with inert signals. Call
/// [`attach_app_updater`] to start delivery.
pub fn create_app_updater() -> AppUpdater {
    AppUpdater::default()
}

/// Builds the default web/native backend. Auto-update needs a host, so every
/// command no-ops and every `subscribe_*` returns an inert unsubscribe — there
/// is no application updater to drive until a host backend is installed.
pub fn create_web_updater_backend() -> Arc<dyn UpdaterBackend> {
    Arc::new(WebUpdaterBackend)
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
        (sub.unsub_checking)();
        (sub.unsub_available)();
        (sub.unsub_not_available)();
        (sub.unsub_progress)();
        (sub.unsub_downloaded)();
        (sub.unsub_error)();
    }
}

/// Releases `updater` by detaching its backend subscription. The signals
/// remain plain memory afterward.
pub fn dispose_app_updater(updater: &AppUpdater) {
    detach_app_updater(updater);
}

/// Asks the active backend to download the available update. Progress and
/// completion arrive through the attached [`AppUpdater`]'s signals.
pub fn download_update() {
    get_updater_backend().download_update();
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

/// Quits the application and installs a downloaded update via the active
/// backend.
pub fn quit_and_install_update() {
    get_updater_backend().quit_and_install();
}

/// Installs a native host updater backend. Pass `None` to fall back to the web
/// default on the next call to [`get_updater_backend`].
pub fn set_updater_backend(backend: Option<Arc<dyn UpdaterBackend>>) {
    let mut guard = BACKEND.lock().expect("updater backend mutex poisoned");
    *guard = backend;
}

/// Points the active backend at an update feed URL.
pub fn set_updater_feed_url(url: &str) {
    get_updater_backend().set_feed_url(url);
}

/// Default backend. Auto-update needs a host, so every command no-ops and every
/// `subscribe_*` returns an inert unsubscribe. A native host replaces this via
/// [`set_updater_backend`].
struct WebUpdaterBackend;

impl UpdaterBackend for WebUpdaterBackend {
    fn set_feed_url(&self, _url: &str) {}

    fn check_for_updates(&self) {}

    fn download_update(&self) {}

    fn quit_and_install(&self) {}

    fn subscribe_checking(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_available(
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

    fn subscribe_download_progress(
        &self,
        _listener: Box<dyn Fn(f32) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_update_downloaded(
        &self,
        _listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_error(
        &self,
        _listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

static BACKEND: Mutex<Option<Arc<dyn UpdaterBackend>>> = Mutex::new(None);

/// Holds the six unsubscribe closures that keep backend delivery alive for
/// one attached [`AppUpdater`]. [`detach_app_updater`] invokes each before
/// dropping the entry, telling the backend to stop delivery.
struct UpdaterSubscription {
    // Used only as a map key; never dereferenced.
    updater_ptr: usize,
    unsub_checking: Box<dyn Fn() + Send + Sync>,
    unsub_available: Box<dyn Fn() + Send + Sync>,
    unsub_not_available: Box<dyn Fn() + Send + Sync>,
    unsub_progress: Box<dyn Fn() + Send + Sync>,
    unsub_downloaded: Box<dyn Fn() + Send + Sync>,
    unsub_error: Box<dyn Fn() + Send + Sync>,
}

static SUBSCRIPTIONS: Mutex<Vec<UpdaterSubscription>> = Mutex::new(Vec::new());

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{SlotGuard, connect_signal};
    use serial_test::serial;
    use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};

    type Listener0 = Box<dyn Fn() + Send + Sync>;
    type ListenerInfo = Box<dyn Fn(UpdateInfo) + Send + Sync>;

    /// Backend that records command calls and lets a test fire each event by
    /// invoking the most recently registered listener. Each `subscribe_*`
    /// returns an unsubscribe that clears its stored listener, mirroring the
    /// TS fake so detach actually stops delivery.
    #[derive(Default)]
    struct FakeBackend {
        feed_url: Mutex<String>,
        checked: AtomicU32,
        downloaded: AtomicU32,
        quit: AtomicU32,
        checking: Arc<Mutex<Option<Arc<Listener0>>>>,
        update_available: Arc<Mutex<Option<Arc<ListenerInfo>>>>,
        update_not_available: Arc<Mutex<Option<Arc<Listener0>>>>,
        download_progress: Arc<Mutex<Option<Arc<Box<dyn Fn(f32) + Send + Sync>>>>>,
        update_downloaded: Arc<Mutex<Option<Arc<ListenerInfo>>>>,
        error: Arc<Mutex<Option<Arc<Box<dyn Fn(String) + Send + Sync>>>>>,
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
        fn fire_download_progress(&self, percent: f32) {
            if let Some(l) = self.download_progress.lock().unwrap().clone() {
                l(percent);
            }
        }
        fn fire_update_downloaded(&self, info: UpdateInfo) {
            if let Some(l) = self.update_downloaded.lock().unwrap().clone() {
                l(info);
            }
        }
        fn fire_error(&self, message: String) {
            if let Some(l) = self.error.lock().unwrap().clone() {
                l(message);
            }
        }
    }

    impl UpdaterBackend for FakeBackend {
        fn set_feed_url(&self, url: &str) {
            *self.feed_url.lock().unwrap() = url.to_string();
        }
        fn check_for_updates(&self) {
            self.checked.fetch_add(1, Ordering::SeqCst);
        }
        fn download_update(&self) {
            self.downloaded.fetch_add(1, Ordering::SeqCst);
        }
        fn quit_and_install(&self) {
            self.quit.fetch_add(1, Ordering::SeqCst);
        }
        fn subscribe_checking(&self, listener: Listener0) -> Box<dyn Fn() + Send + Sync> {
            *self.checking.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.checking.clone();
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
        fn subscribe_download_progress(
            &self,
            listener: Box<dyn Fn(f32) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.download_progress.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.download_progress.clone();
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
        fn subscribe_error(
            &self,
            listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.error.lock().unwrap() = Some(Arc::new(listener));
            let slot = self.error.clone();
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
    fn attach_app_updater_wires_every_subscribe_forwarding_payloads() {
        let (_lock, backend) = install_fake();
        let updater = create_app_updater();

        let checking = Arc::new(AtomicU32::new(0));
        let not_available = Arc::new(AtomicU32::new(0));
        let available_version = Arc::new(Mutex::new(String::new()));
        let downloaded_version = Arc::new(Mutex::new(String::new()));
        let percent = Arc::new(AtomicI32::new(-1));
        let message = Arc::new(Mutex::new(String::new()));

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
        let av = available_version.clone();
        let _g3: SlotGuard<UpdateInfo> = connect_signal(
            &updater.on_update_available,
            Arc::new(move |info: &UpdateInfo| {
                *av.lock().unwrap() = info.version.clone();
            }),
            Default::default(),
        );
        let p = percent.clone();
        let _g4: SlotGuard<f32> = connect_signal(
            &updater.on_download_progress,
            Arc::new(move |v: &f32| {
                p.store(*v as i32, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let dv = downloaded_version.clone();
        let _g5: SlotGuard<UpdateInfo> = connect_signal(
            &updater.on_update_downloaded,
            Arc::new(move |info: &UpdateInfo| {
                *dv.lock().unwrap() = info.version.clone();
            }),
            Default::default(),
        );
        let m = message.clone();
        let _g6: SlotGuard<String> = connect_signal(
            &updater.on_error,
            Arc::new(move |s: &String| {
                *m.lock().unwrap() = s.clone();
            }),
            Default::default(),
        );

        attach_app_updater(&updater);

        let info = UpdateInfo {
            version: "1.2.3".to_string(),
            notes: "fixes".to_string(),
            release_date: "2026-06-19".to_string(),
        };
        backend.fire_checking();
        backend.fire_update_available(info.clone());
        backend.fire_update_not_available();
        backend.fire_download_progress(42.0);
        backend.fire_update_downloaded(info.clone());
        backend.fire_error("boom".to_string());

        assert_eq!(checking.load(Ordering::SeqCst), 1);
        assert_eq!(not_available.load(Ordering::SeqCst), 1);
        assert_eq!(*available_version.lock().unwrap(), "1.2.3");
        assert_eq!(*downloaded_version.lock().unwrap(), "1.2.3");
        assert_eq!(percent.load(Ordering::SeqCst), 42);
        assert_eq!(*message.lock().unwrap(), "boom");

        detach_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn check_for_updates_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        check_for_updates();
        assert_eq!(backend.checked.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn create_app_updater_creates_entity_with_all_six_signals() {
        let updater = create_app_updater();
        // Each signal is usable: connecting and emitting does not panic.
        let _g: SlotGuard<()> =
            connect_signal(&updater.on_checking, Arc::new(|_| {}), Default::default());
        emit_signal(&updater.on_checking, &());
        emit_signal(&updater.on_update_not_available, &());
        emit_signal(&updater.on_download_progress, &0.0);
        emit_signal(&updater.on_error, &String::new());
        emit_signal(&updater.on_update_available, &UpdateInfo::default());
        emit_signal(&updater.on_update_downloaded, &UpdateInfo::default());
    }

    #[test]
    #[serial]
    fn create_web_updater_backend_no_ops_and_returns_inert_unsubscribes() {
        let backend = create_web_updater_backend();
        // Commands are clean no-ops.
        backend.set_feed_url("https://example.com/feed");
        backend.check_for_updates();
        backend.download_update();
        backend.quit_and_install();
        // Subscribes return an inert unsubscribe that is safe to call.
        let unsub = backend.subscribe_checking(Box::new(|| {}));
        unsub();
        let unsub = backend.subscribe_error(Box::new(|_| {}));
        unsub();
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
    fn dispose_app_updater_detaches_the_subscription() {
        let (_lock, _backend) = install_fake();
        let updater = create_app_updater();
        attach_app_updater(&updater);
        dispose_app_updater(&updater);
        // Idempotent: a second dispose is a safe no-op.
        dispose_app_updater(&updater);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn download_update_delegates_to_active_backend() {
        let (_lock, backend) = install_fake();
        download_update();
        assert_eq!(backend.downloaded.load(Ordering::SeqCst), 1);
        set_updater_backend(None);
    }

    #[test]
    #[serial]
    fn get_updater_backend_falls_back_to_a_web_backend() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_updater_backend(None);
        // Default backend serves clean sentinels without panicking.
        let backend = get_updater_backend();
        backend.check_for_updates();
        backend.download_update();
        set_updater_backend(None);
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
    fn set_updater_backend_clears_back_to_the_web_fallback_when_passed_none() {
        let (_lock, _backend) = install_fake();
        set_updater_backend(None);
        // Still a backend, serving clean sentinels.
        let backend = get_updater_backend();
        backend.check_for_updates();
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
}
