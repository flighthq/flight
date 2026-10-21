use std::any::Any;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_entity::Ref;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::Mutex;

    fn reason(label: &str) -> AbortReason {
        return Arc::new(label.to_string());
    }

    #[test]
    fn abort_method_matches_abort_controller() {
        let method_controller = create_abort_controller();
        let free_controller = create_abort_controller();
        let shared = reason("stop");
        method_controller.abort(Some(shared.clone()));
        abort_controller(&free_controller, Some(shared));
        assert_eq!(
            method_controller.signal.is_aborted(),
            is_abort_signal_aborted(&free_controller.signal)
        );
    }

    #[test]
    fn add_listener_method_matches_add_abort_listener() {
        let method_controller = create_abort_controller();
        let free_controller = create_abort_controller();
        let method_calls = Arc::new(Mutex::new(0));
        let captured = method_calls.clone();
        let method_callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        let free_calls = Arc::new(Mutex::new(0));
        let captured = free_calls.clone();
        let free_callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        method_controller.signal.add_listener(method_callback);
        add_abort_listener(&free_controller.signal, free_callback);
        method_controller.abort(None);
        abort_controller(&free_controller, None);
        assert_eq!(*method_calls.lock().unwrap(), *free_calls.lock().unwrap());
    }

    #[test]
    fn is_aborted_method_matches_is_abort_signal_aborted() {
        let controller = create_abort_controller();
        assert_eq!(
            controller.signal.is_aborted(),
            is_abort_signal_aborted(&controller.signal)
        );
        controller.abort(None);
        assert_eq!(
            controller.signal.is_aborted(),
            is_abort_signal_aborted(&controller.signal)
        );
    }

    #[test]
    fn reason_method_matches_get_abort_signal_reason() {
        let controller = create_abort_controller();
        let shared = reason("stop");
        controller.abort(Some(shared));
        let via_method = controller.signal.reason();
        let via_free = get_abort_signal_reason(&controller.signal);
        assert!(Arc::ptr_eq(
            via_method.as_ref().unwrap(),
            via_free.as_ref().unwrap()
        ));
    }

    #[test]
    fn remove_listener_method_matches_remove_abort_listener() {
        let method_controller = create_abort_controller();
        let free_controller = create_abort_controller();
        let method_calls = Arc::new(Mutex::new(0));
        let captured = method_calls.clone();
        let method_callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        let free_calls = Arc::new(Mutex::new(0));
        let captured = free_calls.clone();
        let free_callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        method_controller
            .signal
            .add_listener(method_callback.clone());
        add_abort_listener(&free_controller.signal, free_callback.clone());
        method_controller.signal.remove_listener(&method_callback);
        remove_abort_listener(&free_controller.signal, &free_callback);
        method_controller.abort(None);
        abort_controller(&free_controller, None);
        assert_eq!(*method_calls.lock().unwrap(), *free_calls.lock().unwrap());
    }

    #[test]
    fn throw_if_aborted_method_matches_throw_if_aborted() {
        let method_controller = create_abort_controller();
        let free_controller = create_abort_controller();
        method_controller.abort(None);
        abort_controller(&free_controller, None);
        let method_error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            method_controller.signal.throw_if_aborted();
        }));
        let free_error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            throw_if_aborted(&free_controller.signal);
        }));
        assert!(method_error.is_err());
        assert!(free_error.is_err());
    }

    #[test]
    fn wait_aborted_method_matches_wait_aborted() {
        let method_controller = create_abort_controller();
        let free_controller = create_abort_controller();
        let shared = reason("stop");
        method_controller.abort(Some(shared.clone()));
        abort_controller(&free_controller, Some(shared));
        let via_method = block_on(method_controller.signal.wait_aborted());
        let via_free = block_on(wait_aborted(&free_controller.signal));
        assert!(Arc::ptr_eq(&via_method, &via_free));
    }
}

/// One registered abort listener (TS `addEventListener('abort', callback)`). Callbacks are stored
/// by shared identity so unregistration is exact object identity, as in the Web API.
pub type AbortCallback = Arc<dyn Fn() + Send + Sync>;

/// An arbitrary abort reason payload (TS `AbortSignal.reason`, `unknown`). Shared by identity so
/// every observer reads the exact same reason object.
// flight-lint: allow(contract-vocabulary) D20: an arbitrary identity-preserving reason payload; Arc<T> shared-record rows are a Principal lint follow-up, not a relaxation of unknown types
pub type AbortReason = Arc<dyn Any + Send + Sync>;

/// The platform default abort reason (TS `DOMException` named `AbortError`), used when abort is
/// called without a reason. Its message is the web-platform editorial text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbortError {
    pub name: String,
    pub message: String,
}

/// A cloneable abort signal (TS `AbortSignal`). Clones share one state: aborting through the
/// controller is visible to every clone, and every clone observes the same reason identity.
#[derive(Clone)]
pub struct AbortSignal {
    state: Ref<AbortSignalState>,
}

/// The controller that owns one signal (TS `AbortController`).
pub struct AbortController {
    pub signal: AbortSignal,
}

struct AbortSignalState {
    aborted: bool,
    callbacks: Vec<AbortCallback>,
    reason: Option<AbortReason>,
    waiters: Vec<Waker>,
}

// flight-lint: allow(conform-extra) D20: Rust construction seam for the private shared signal state; TS uses `new AbortController()`
pub fn create_abort_controller() -> AbortController {
    return AbortController {
        signal: AbortSignal {
            state: Arc::new(RwLock::new(AbortSignalState {
                aborted: false,
                callbacks: Vec::new(),
                reason: None,
                waiters: Vec::new(),
            })),
        },
    };
}

fn create_default_abort_reason() -> AbortReason {
    return Arc::new(AbortError {
        name: "AbortError".to_string(),
        message: "The operation was aborted".to_string(),
    });
}

/// Aborts the controller's signal with an optional reason (TS `AbortController.abort(reason)`).
/// The first abort wins: later calls are no-ops and do not replace the reason or re-fire listeners.
/// Listeners run and waiters wake with no lock held, so callbacks may reenter the signal.
pub fn abort_controller(controller: &AbortController, reason: Option<AbortReason>) {
    let state = controller.signal.state.clone();
    let callbacks: Vec<AbortCallback>;
    let waiters: Vec<Waker>;
    {
        let mut locked = state.write().unwrap();
        if locked.aborted {
            return;
        }
        locked.aborted = true;
        locked.reason = Some(reason.unwrap_or_else(create_default_abort_reason));
        callbacks = locked.callbacks.clone();
        waiters = locked.waiters.clone();
        locked.waiters = Vec::new();
    }
    for callback in callbacks {
        callback();
    }
    for waiter in waiters {
        waiter.wake();
    }
}

/// Registers one abort listener (TS `addEventListener('abort', callback)`). A listener added after
/// the signal is already aborted is retained but never invoked, matching the Web API's transition
/// semantics.
pub fn add_abort_listener(signal: &AbortSignal, callback: AbortCallback) {
    signal.state.write().unwrap().callbacks.push(callback);
}

/// Returns the abort reason, or `None` before an abort (TS `AbortSignal.reason`). The handle is
/// shared, so repeated reads yield the same reason identity.
pub fn get_abort_signal_reason(signal: &AbortSignal) -> Option<AbortReason> {
    return signal.state.read().unwrap().reason.clone();
}

/// True once the signal has aborted (TS `AbortSignal.aborted`).
pub fn is_abort_signal_aborted(signal: &AbortSignal) -> bool {
    return signal.state.read().unwrap().aborted;
}

/// Removes one matching abort listener by shared callback identity (TS
/// `removeEventListener('abort', callback)`). Removing an unregistered callback is a no-op, and at
/// most one registration is removed.
pub fn remove_abort_listener(signal: &AbortSignal, callback: &AbortCallback) {
    let mut locked = signal.state.write().unwrap();
    if let Some(index) = locked
        .callbacks
        .iter()
        .position(|candidate| Arc::ptr_eq(candidate, callback))
    {
        locked.callbacks.remove(index);
    }
}

/// Throws the abort reason when the signal is aborted (TS `AbortSignal.throwIfAborted`). The
/// reason is the typed panic payload; it is not wrapped or replaced.
pub fn throw_if_aborted(signal: &AbortSignal) {
    let reason = signal.state.read().unwrap().reason.clone();
    if let Some(reason) = reason {
        std::panic::panic_any(reason);
    }
}

/// Settles with the abort reason, immediately when already aborted or when a later abort wakes the
/// task (TS `abortSignal` await form). Executor-neutral: it only registers a waker.
pub async fn wait_aborted(signal: &AbortSignal) -> AbortReason {
    let state = signal.state.clone();
    let reason = std::future::poll_fn(|context: &mut Context<'_>| {
        let mut locked = state.write().unwrap();
        if let Some(reason) = locked.reason.clone() {
            return Poll::Ready(reason);
        }
        let waker = context.waker();
        locked.waiters.retain(|existing| !existing.will_wake(waker));
        locked.waiters.push(waker.clone());
        return Poll::Pending;
    })
    .await;
    return reason;
}

// ============================================================================
// D18 sugar: methods on the shared types delegate to the free functions
// ============================================================================

impl AbortController {
    pub fn abort(&self, reason: Option<AbortReason>) {
        return abort_controller(self, reason);
    }
}

impl AbortSignal {
    pub fn add_listener(&self, callback: AbortCallback) {
        return add_abort_listener(self, callback);
    }

    pub fn is_aborted(&self) -> bool {
        return is_abort_signal_aborted(self);
    }

    pub fn reason(&self) -> Option<AbortReason> {
        return get_abort_signal_reason(self);
    }

    pub fn remove_listener(&self, callback: &AbortCallback) {
        return remove_abort_listener(self, callback);
    }

    pub fn throw_if_aborted(&self) {
        return throw_if_aborted(self);
    }

    pub async fn wait_aborted(&self) -> AbortReason {
        return wait_aborted(self).await;
    }
}
