//! Lifecycle free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{AppLifecycle, AppLifecycleState, LifecycleBackend};

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

/// Begins delivering lifecycle changes to `app`'s signals by subscribing to
/// the active backend. On each change it reads the current state and emits
/// `on_state_change` plus `on_resume` when transitioning to
/// [`AppLifecycleState::Active`] and `on_pause` when leaving it. The stub never
/// drives `on_back_button`; native hosts emit it through their own backend.
/// Idempotent: a prior subscription is torn down first. Pair with
/// [`detach_app_lifecycle`] or [`dispose_app_lifecycle`].
pub fn attach_app_lifecycle(app: &AppLifecycle) {
    detach_app_lifecycle(app);
    let backend = get_lifecycle_backend();
    let previous = Arc::new(Mutex::new(backend.get_state()));

    let state_backend = Arc::clone(&backend);
    let on_state_change = app.on_state_change.clone();
    let on_resume = app.on_resume.clone();
    let on_pause = app.on_pause.clone();
    let previous_clone = Arc::clone(&previous);

    let unsubscribe = backend.subscribe(Box::new(move || {
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
        } else if state != AppLifecycleState::Active && prev == AppLifecycleState::Active {
            emit_signal(&on_pause, &());
        }
    }));

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("lifecycle subscriptions mutex poisoned");
    guard.push((app as *const AppLifecycle as usize, unsubscribe));
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

/// Releases `app` for garbage collection by detaching its backend
/// subscription. The signals remain plain GC-managed memory afterward.
pub fn dispose_app_lifecycle(app: &AppLifecycle) {
    detach_app_lifecycle(app);
}

/// Returns the current application lifecycle state from the active backend.
pub fn get_app_lifecycle_state() -> AppLifecycleState {
    get_lifecycle_backend().get_state()
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn LifecycleBackend>>> = Mutex::new(None);

// Subscription list: (AppLifecycle address, unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    // --- create_app_lifecycle ---

    #[test]
    fn create_app_lifecycle_returns_default_entity() {
        let _app = create_app_lifecycle();
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
