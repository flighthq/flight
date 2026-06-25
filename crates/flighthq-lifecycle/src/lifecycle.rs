//! Lifecycle free functions and backend management.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{
    AppBackRequest, AppLaunchKind, AppLifecycle, AppLifecycleState, AppMemoryPressure, AppStateBag,
    LifecycleBackend,
};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubLifecycleBackend;

impl LifecycleBackend for StubLifecycleBackend {
    fn get_state(&self) -> AppLifecycleState {
        AppLifecycleState::Active
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active lifecycle backend. Falls back to the no-op stub when no
/// backend has been installed.
pub fn get_lifecycle_backend() -> Arc<dyn LifecycleBackend> {
    let guard = BACKEND.lock().expect("lifecycle backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubLifecycleBackend),
    }
}

/// Installs a native host lifecycle backend. Pass `None` to fall back to the
/// built-in stub.
pub fn set_lifecycle_backend(backend: Option<Arc<dyn LifecycleBackend>>) {
    let mut guard = BACKEND.lock().expect("lifecycle backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Entity construction
// ---------------------------------------------------------------------------

/// Allocates an [`AppLifecycle`] event entity with inert signals. Call
/// [`attach_app_lifecycle`] to begin delivery.
pub fn create_app_lifecycle() -> AppLifecycle {
    AppLifecycle::default()
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering lifecycle changes to `app`'s signals by subscribing to the
/// active backend. On each change it reads the current state and emits
/// `on_state_change` plus `on_resume` when transitioning to
/// [`AppLifecycleState::Active`] and `on_pause` when leaving it. The stub never
/// drives `on_back_button`; native hosts emit it through their own backend.
/// Idempotent: a prior subscription is torn down first. Pair with
/// [`detach_app_lifecycle`] or [`dispose_app_lifecycle`].
///
/// `on_state_change` is raw, not deduped — it fires on every backend
/// notification regardless of whether the derived state changed.
/// `on_resume`/`on_pause` are deduped edges: `Active`→non-`Active` fires
/// `on_pause` (including the interruption edge `Active`→`Inactive`);
/// non-`Active`→`Active` fires `on_resume`. The `Inactive`→`Background` and
/// reverse transitions do not fire `on_pause`/`on_resume` again. Leaving `Active`
/// collects an `on_save_state` bag; returning to `Active` replays it through
/// `on_restore_state`.
pub fn attach_app_lifecycle(app: &AppLifecycle) {
    detach_app_lifecycle(app);
    let backend = get_lifecycle_backend();
    let previous = Arc::new(Mutex::new(backend.get_state()));

    let key = app as *const AppLifecycle as usize;
    let state_backend = Arc::clone(&backend);
    let on_state_change = app.on_state_change.clone();
    let on_resume = app.on_resume.clone();
    let on_pause = app.on_pause.clone();
    let on_save_state = app.on_save_state.clone();
    let on_restore_state = app.on_restore_state.clone();
    let previous_clone = Arc::clone(&previous);

    let unsubscribe_state = backend.subscribe(Box::new(move || {
        let state = state_backend.get_state();
        let prev = {
            let mut guard = previous_clone.lock().unwrap();
            let prev = *guard;
            *guard = state;
            prev
        };
        emit_signal(&on_state_change, &state);
        if state == AppLifecycleState::Active && prev != AppLifecycleState::Active {
            emit_signal(&on_resume, &());
            // Warm resume: restore saved state.
            let saved = {
                let mut guard = SAVED_STATE.lock().expect("lifecycle saved-state poisoned");
                guard.remove(&key)
            };
            if let Some(saved) = saved {
                emit_signal(&on_restore_state, &saved);
            }
        } else if state != AppLifecycleState::Active && prev == AppLifecycleState::Active {
            emit_signal(&on_pause, &());
            // Collect transient UI state for potential restore on next resume.
            let state_bag = AppStateBag::default();
            emit_signal(&on_save_state, &state_bag);
            let mut guard = SAVED_STATE.lock().expect("lifecycle saved-state poisoned");
            guard.insert(key, state_bag);
        }
    }));

    let on_memory_warning = app.on_memory_warning.clone();
    let unsubscribe_memory =
        backend.subscribe_memory_warning(Box::new(move |level: AppMemoryPressure| {
            emit_signal(&on_memory_warning, &level);
        }));

    let unsubscribe: Box<dyn Fn() + Send + Sync> = Box::new(move || {
        unsubscribe_state();
        if let Some(unsub) = unsubscribe_memory.as_ref() {
            unsub();
        }
    });

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("lifecycle subscriptions mutex poisoned");
    guard.push((key, unsubscribe));
}

/// Stops delivery to `app` and forgets its subscription. Safe to call when not
/// attached.
pub fn detach_app_lifecycle(app: &AppLifecycle) {
    let key = app as *const AppLifecycle as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("lifecycle subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsub) = guard.remove(pos);
        unsub();
    }
}

/// Releases `app` for garbage collection by detaching its backend subscription
/// and discarding any saved state. The signals remain plain memory afterward.
pub fn dispose_app_lifecycle(app: &AppLifecycle) {
    detach_app_lifecycle(app);
    let key = app as *const AppLifecycle as usize;
    let mut guard = SAVED_STATE.lock().expect("lifecycle saved-state poisoned");
    guard.remove(&key);
}

/// Returns the kind of launch — [`AppLaunchKind::Cold`] (fresh process) or
/// [`AppLaunchKind::Warm`] (resumed from background). Returns `Warm` as a safe
/// fallback when the backend does not report a launch kind.
pub fn get_app_launch_kind() -> AppLaunchKind {
    get_lifecycle_backend()
        .get_launch_kind()
        .unwrap_or(AppLaunchKind::Warm)
}

/// Returns the current application lifecycle state from the active backend.
pub fn get_app_lifecycle_state() -> AppLifecycleState {
    get_lifecycle_backend().get_state()
}

/// Returns true when the application is in the [`AppLifecycleState::Active`]
/// state (visible and focused).
pub fn is_app_active() -> bool {
    get_lifecycle_backend().get_state() == AppLifecycleState::Active
}

/// Returns true when the application is in the [`AppLifecycleState::Background`]
/// state (hidden/suspended).
pub fn is_app_background() -> bool {
    get_lifecycle_backend().get_state() == AppLifecycleState::Background
}

/// Returns true when the application is in the [`AppLifecycleState::Inactive`]
/// state (visible but not focused — e.g. app switcher, control-center overlay).
pub fn is_app_inactive() -> bool {
    get_lifecycle_backend().get_state() == AppLifecycleState::Inactive
}

/// Emits `app.on_back_button` and returns whether the back action may proceed.
/// Returns false when a listener vetoed by calling
/// [`AppBackRequest::cancel`] on the payload, meaning the listener handled
/// navigation itself. Returns true when no listener consumed the event and the
/// host should perform the default back action (navigate up or exit). Mirrors
/// the `on_close_request`/`request_close_window` veto contract from
/// `flighthq-application`.
pub fn request_app_back(app: &AppLifecycle) -> bool {
    let request = AppBackRequest::default();
    emit_signal(&app.on_back_button, &request);
    !request.is_cancelled()
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn LifecycleBackend>>> = Mutex::new(None);

// Subscription list: (AppLifecycle address, unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

// Saved transient state per attached app (keyed by AppLifecycle address). The
// Rust analogue of the TS `_savedState` WeakMap.
static SAVED_STATE: Mutex<Option<HashMap<usize, AppStateBag>>> = Mutex::new(None);

trait SavedStateExt {
    fn remove(&mut self, key: &usize) -> Option<AppStateBag>;
    fn insert(&mut self, key: usize, bag: AppStateBag);
}

impl SavedStateExt for std::sync::MutexGuard<'_, Option<HashMap<usize, AppStateBag>>> {
    fn remove(&mut self, key: &usize) -> Option<AppStateBag> {
        self.as_mut().and_then(|m| m.remove(key))
    }

    fn insert(&mut self, key: usize, bag: AppStateBag) {
        self.get_or_insert_with(HashMap::new).insert(key, bag);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // A controllable fake backend mirroring the TS `fakeBackend`. State is set
    // directly; `fire()` notifies the state listener; `fire_memory()` notifies
    // the memory listener.
    type StateSlot = Arc<Mutex<Option<Arc<dyn Fn() + Send + Sync>>>>;
    type MemorySlot = Arc<Mutex<Option<Arc<dyn Fn(AppMemoryPressure) + Send + Sync>>>>;

    #[derive(Default)]
    struct FakeBackend {
        state: Mutex<AppLifecycleState>,
        launch_kind: Mutex<Option<AppLaunchKind>>,
        state_listener: StateSlot,
        memory_listener: MemorySlot,
    }

    impl FakeBackend {
        fn set_state(self: &Arc<Self>, state: AppLifecycleState) {
            *self.state.lock().unwrap() = state;
        }
        fn fire(self: &Arc<Self>) {
            let listener = self.state_listener.lock().unwrap().clone();
            if let Some(l) = listener {
                l();
            }
        }
        fn fire_memory(self: &Arc<Self>, level: AppMemoryPressure) {
            let listener = self.memory_listener.lock().unwrap().clone();
            if let Some(l) = listener {
                l(level);
            }
        }
    }

    impl LifecycleBackend for FakeBackend {
        fn get_state(&self) -> AppLifecycleState {
            *self.state.lock().unwrap()
        }
        fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            *self.state_listener.lock().unwrap() = Some(Arc::from(listener));
            // Unsubscribe clears the listener slot, mirroring the TS web backend
            // removing its event listener.
            let slot = Arc::clone(&self.state_listener);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
        fn get_launch_kind(&self) -> Option<AppLaunchKind> {
            *self.launch_kind.lock().unwrap()
        }
        fn subscribe_memory_warning(
            &self,
            listener: Box<dyn Fn(AppMemoryPressure) + Send + Sync>,
        ) -> Option<Box<dyn Fn() + Send + Sync>> {
            *self.memory_listener.lock().unwrap() = Some(Arc::from(listener));
            let slot = Arc::clone(&self.memory_listener);
            Some(Box::new(move || {
                *slot.lock().unwrap() = None;
            }))
        }
    }

    fn install_fake() -> Arc<FakeBackend> {
        let backend = Arc::new(FakeBackend::default());
        set_lifecycle_backend(Some(Arc::clone(&backend) as Arc<dyn LifecycleBackend>));
        backend
    }

    // Connects `f` to `sig` and returns the guard, which the caller must hold
    // for the slot to stay connected.
    fn connect<T, F>(sig: &flighthq_signals::Signal<T>, f: F) -> flighthq_signals::SlotGuard<T>
    where
        T: 'static,
        F: Fn(&T) + Send + Sync + 'static,
    {
        connect_signal(sig, Arc::new(f), Default::default())
    }

    // --- attach_app_lifecycle ---

    #[test]
    #[serial]
    fn attach_emits_pause_and_state_change_leaving_active_for_background() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let pauses = Arc::new(AtomicUsize::new(0));
        let changes = Arc::new(AtomicUsize::new(0));
        let p = Arc::clone(&pauses);
        let c = Arc::clone(&changes);
        let _gp = connect(&app.on_pause, move |_| {
            p.fetch_add(1, Ordering::SeqCst);
        });
        let _gc = connect(&app.on_state_change, move |_| {
            c.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert_eq!(pauses.load(Ordering::SeqCst), 1);
        assert_eq!(changes.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_emits_pause_leaving_active_for_inactive() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let pauses = Arc::new(AtomicUsize::new(0));
        let p = Arc::clone(&pauses);
        let _gp = connect(&app.on_pause, move |_| {
            p.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Inactive);
        backend.fire();
        assert_eq!(pauses.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_does_not_double_fire_pause_for_inactive_to_background() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Inactive);
        let app = create_app_lifecycle();
        let pauses = Arc::new(AtomicUsize::new(0));
        let p = Arc::clone(&pauses);
        let _gp = connect(&app.on_pause, move |_| {
            p.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        // inactive → background should not re-fire on_pause (already paused).
        assert_eq!(pauses.load(Ordering::SeqCst), 0);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_emits_resume_returning_to_active_from_background() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Background);
        let app = create_app_lifecycle();
        let resumes = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&resumes);
        let _g = connect(&app.on_resume, move |_| {
            r.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(resumes.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_emits_resume_returning_to_active_from_inactive() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Inactive);
        let app = create_app_lifecycle();
        let resumes = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&resumes);
        let _g = connect(&app.on_resume, move |_| {
            r.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(resumes.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_is_idempotent_reattaching_tears_down_prior_subscription() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let changes = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&changes);
        let _g = connect(&app.on_state_change, move |_| {
            c.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        // Only one subscription should be active.
        assert_eq!(changes.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_emits_save_state_leaving_active() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let saved = Arc::new(AtomicUsize::new(0));
        let s = Arc::clone(&saved);
        let _g = connect(&app.on_save_state, move |bag: &AppStateBag| {
            bag.set("key", Box::new("value".to_string()));
            s.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert_eq!(saved.load(Ordering::SeqCst), 1);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_emits_restore_state_with_saved_bag_returning_to_active() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let _gs = connect(&app.on_save_state, move |bag: &AppStateBag| {
            bag.set("x", Box::new(42i32));
        });
        let restored = Arc::new(Mutex::new(None::<i32>));
        let r = Arc::clone(&restored);
        let _gr = connect(&app.on_restore_state, move |state: &AppStateBag| {
            *r.lock().unwrap() = state.get::<i32>("x");
        });
        attach_app_lifecycle(&app);
        // Transition away to trigger save.
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        // Transition back to trigger restore.
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(*restored.lock().unwrap(), Some(42));
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn attach_subscribes_to_memory_warnings_when_backend_supports_it() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let levels = Arc::new(Mutex::new(Vec::<AppMemoryPressure>::new()));
        let l = Arc::clone(&levels);
        let _g = connect(&app.on_memory_warning, move |level: &AppMemoryPressure| {
            l.lock().unwrap().push(*level);
        });
        attach_app_lifecycle(&app);
        backend.fire_memory(AppMemoryPressure::Critical);
        assert_eq!(*levels.lock().unwrap(), vec![AppMemoryPressure::Critical]);
        detach_app_lifecycle(&app);
        set_lifecycle_backend(None);
    }

    // --- create_app_lifecycle ---

    #[test]
    fn create_app_lifecycle_returns_default_entity() {
        let _app = create_app_lifecycle();
    }

    // --- detach_app_lifecycle ---

    #[test]
    #[serial]
    fn detach_is_safe_when_not_attached() {
        let app = create_app_lifecycle();
        detach_app_lifecycle(&app);
    }

    // --- dispose_app_lifecycle ---

    #[test]
    #[serial]
    fn dispose_stops_delivery_after_dispose() {
        let backend = install_fake();
        let app = create_app_lifecycle();
        let changes = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&changes);
        let _g = connect(&app.on_state_change, move |_| {
            c.fetch_add(1, Ordering::SeqCst);
        });
        attach_app_lifecycle(&app);
        dispose_app_lifecycle(&app);
        backend.fire();
        assert_eq!(changes.load(Ordering::SeqCst), 0);
        set_lifecycle_backend(None);
    }

    // --- get_app_launch_kind ---

    #[test]
    #[serial]
    fn get_app_launch_kind_returns_warm_when_backend_does_not_implement() {
        let backend = install_fake();
        // Fake reports None for launch kind by default.
        let _ = &backend;
        assert_eq!(get_app_launch_kind(), AppLaunchKind::Warm);
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn get_app_launch_kind_delegates_to_backend_when_present() {
        let backend = install_fake();
        *backend.launch_kind.lock().unwrap() = Some(AppLaunchKind::Cold);
        assert_eq!(get_app_launch_kind(), AppLaunchKind::Cold);
        set_lifecycle_backend(None);
    }

    // --- get_app_lifecycle_state ---

    #[test]
    #[serial]
    fn get_app_lifecycle_state_returns_stub_active() {
        set_lifecycle_backend(None);
        assert_eq!(get_app_lifecycle_state(), AppLifecycleState::Active);
    }

    // --- get_lifecycle_backend ---

    #[test]
    #[serial]
    fn get_lifecycle_backend_returns_stub_when_unset() {
        set_lifecycle_backend(None);
        let _b = get_lifecycle_backend();
    }

    // --- is_app_active ---

    #[test]
    #[serial]
    fn is_app_active_true_when_active() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Active);
        assert!(is_app_active());
        set_lifecycle_backend(None);
    }

    #[test]
    #[serial]
    fn is_app_active_false_when_background_or_inactive() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Background);
        assert!(!is_app_active());
        backend.set_state(AppLifecycleState::Inactive);
        assert!(!is_app_active());
        set_lifecycle_backend(None);
    }

    // --- is_app_background ---

    #[test]
    #[serial]
    fn is_app_background_true_when_background() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Background);
        assert!(is_app_background());
        backend.set_state(AppLifecycleState::Active);
        assert!(!is_app_background());
        set_lifecycle_backend(None);
    }

    // --- is_app_inactive ---

    #[test]
    #[serial]
    fn is_app_inactive_true_when_inactive() {
        let backend = install_fake();
        backend.set_state(AppLifecycleState::Inactive);
        assert!(is_app_inactive());
        backend.set_state(AppLifecycleState::Active);
        assert!(!is_app_inactive());
        set_lifecycle_backend(None);
    }

    // --- request_app_back ---

    #[test]
    fn request_app_back_returns_true_when_no_listener_vetoes() {
        let app = create_app_lifecycle();
        assert!(request_app_back(&app));
    }

    #[test]
    fn request_app_back_returns_false_when_a_listener_cancels() {
        let app = create_app_lifecycle();
        let _g = connect(&app.on_back_button, |request: &AppBackRequest| {
            request.cancel();
        });
        assert!(!request_app_back(&app));
    }

    #[test]
    fn request_app_back_emits_on_back_button() {
        let app = create_app_lifecycle();
        let fired = Arc::new(AtomicUsize::new(0));
        let f = Arc::clone(&fired);
        let _g = connect(&app.on_back_button, move |_| {
            f.fetch_add(1, Ordering::SeqCst);
        });
        request_app_back(&app);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    // --- set_lifecycle_backend ---

    #[test]
    #[serial]
    fn set_lifecycle_backend_installs_backend() {
        struct AlwaysBackground;
        impl LifecycleBackend for AlwaysBackground {
            fn get_state(&self) -> AppLifecycleState {
                AppLifecycleState::Background
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
        }
        set_lifecycle_backend(Some(Arc::new(AlwaysBackground)));
        assert_eq!(get_app_lifecycle_state(), AppLifecycleState::Background);
        set_lifecycle_backend(None);
    }
}
