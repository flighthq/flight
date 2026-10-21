use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_entity::{Ref, Unknown};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_entity::Unknown;
    use std::sync::Mutex;

    fn reason(label: &str) -> Unknown {
        return Some(Arc::new(label.to_string()));
    }

    fn same_reason(a: &Unknown, b: &Unknown) -> bool {
        return match (a, b) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            (None, None) => true,
            _ => false,
        };
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
        assert!(same_reason(
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
        assert!(same_reason(&via_method, &via_free));
    }
}

/// One registered abort listener (TS `addEventListener('abort', callback)`). Callbacks are stored
/// by shared identity so unregistration is exact object identity, as in the Web API.
pub type AbortCallback = Arc<dyn Fn() + Send + Sync>;

/// The platform default abort reason (TS `DOMException` named `AbortError`), used when abort is
/// called without a reason. The message is the Principal-canonical portable text.
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
    callbacks: Vec<AbortListener>,
    reason: Option<Unknown>,
    waiters: Vec<Waker>,
}

/// One registered listener plus the DOM removed flag. Dispatch honors the flag at invocation time,
/// so an earlier listener that removes a later one suppresses that later invocation.
struct AbortListener {
    callback: AbortCallback,
    removed: Arc<AtomicBool>,
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

fn create_default_abort_reason() -> Unknown {
    return Some(Arc::new(AbortError {
        name: "AbortError".to_string(),
        message: "The operation was aborted.".to_string(),
    }));
}

/// Aborts the controller's signal with an optional reason (TS `AbortController.abort(reason)`).
/// `None` is the omitted argument and resolves to the default AbortError; `Some(None)` is an
/// explicit null reason; `Some(Some(value))` retains the provided value identity. The first abort
/// wins: later calls are no-ops and do not replace the reason or re-fire listeners. Listeners run
/// and waiters wake with no lock held, so callbacks may reenter the signal.
pub fn abort_controller(controller: &AbortController, reason: Option<Unknown>) {
    let resolved_reason: Unknown = match reason {
        Some(value) => value,
        None => create_default_abort_reason(),
    };
    let state = controller.signal.state.clone();
    let listeners: Vec<(AbortCallback, Arc<AtomicBool>)>;
    let waiters: Vec<Waker>;
    {
        let mut locked = state.write().unwrap();
        if locked.aborted {
            return;
        }
        locked.aborted = true;
        locked.reason = Some(resolved_reason);
        listeners = locked
            .callbacks
            .iter()
            .map(|listener| (listener.callback.clone(), listener.removed.clone()))
            .collect();
        waiters = locked.waiters.clone();
        locked.waiters = Vec::new();
    }
    for (callback, removed) in listeners {
        if !removed.load(Ordering::SeqCst) {
            callback();
        }
    }
    for waiter in waiters {
        waiter.wake();
    }
}

/// Registers one abort listener (TS `addEventListener('abort', callback)`). A listener added after
/// the signal is already aborted is retained but never invoked, matching the Web API's transition
/// semantics.
pub fn add_abort_listener(signal: &AbortSignal, callback: AbortCallback) {
    signal.state.write().unwrap().callbacks.push(AbortListener {
        callback,
        removed: Arc::new(AtomicBool::new(false)),
    });
}

/// Returns the abort reason (TS `AbortSignal.reason`). The outer `None` means not aborted; the
/// inner `Unknown` is the reason itself, where `None` is an explicit null and `Some` retains the
/// provided value identity.
pub fn get_abort_signal_reason(signal: &AbortSignal) -> Option<Unknown> {
    return signal.state.read().unwrap().reason.clone();
}

/// True once the signal has aborted (TS `AbortSignal.aborted`).
pub fn is_abort_signal_aborted(signal: &AbortSignal) -> bool {
    return signal.state.read().unwrap().aborted;
}

/// Removes one matching abort listener by shared callback identity (TS
/// `removeEventListener('abort', callback)`). Removing an unregistered callback is a no-op, and at
/// most one registration is removed. The removed flag is set before the entry is dropped so an
/// in-flight dispatch suppresses that listener; adding it again is a new registration.
pub fn remove_abort_listener(signal: &AbortSignal, callback: &AbortCallback) {
    let mut locked = signal.state.write().unwrap();
    if let Some(index) = locked
        .callbacks
        .iter()
        .position(|listener| Arc::ptr_eq(&listener.callback, callback))
    {
        let listener = locked.callbacks.remove(index);
        listener.removed.store(true, Ordering::SeqCst);
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
pub async fn wait_aborted(signal: &AbortSignal) -> Unknown {
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
    pub fn abort(&self, reason: Option<Unknown>) {
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

    pub fn reason(&self) -> Option<Unknown> {
        return get_abort_signal_reason(self);
    }

    pub fn remove_listener(&self, callback: &AbortCallback) {
        return remove_abort_listener(self, callback);
    }

    pub fn throw_if_aborted(&self) {
        return throw_if_aborted(self);
    }

    pub async fn wait_aborted(&self) -> Unknown {
        return wait_aborted(self).await;
    }
}
