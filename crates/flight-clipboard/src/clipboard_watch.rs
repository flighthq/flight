use flight_entity::{
    allocate_entity, attach_entity_binding, detach_entity_binding, get_entity_binding_as,
    throw_type_error,
};
use flight_signals::{create_signal, emit_signal};
use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::Mutex;

    fn change_host(listeners: Arc<Mutex<usize>>) -> HostClipboardChangeCapability {
        return HostClipboardChangeCapability {
            subscribe: Some(Arc::new(move |_callback: Arc<dyn Fn() + Send + Sync>| {
                *listeners.lock().unwrap() += 1;
                let captured = listeners.clone();
                let unsubscribe: ClipboardUnsubscribe = Arc::new(move || {
                    *captured.lock().unwrap() -= 1;
                });
                return unsubscribe;
            })),
        };
    }

    #[test]
    fn new_matches_create_clipboard_watch() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut via_method = ClipboardWatch::new();
        let mut via_free = create_clipboard_watch();
        attach_clipboard_watch(&change_host(method_listeners.clone()), &mut via_method);
        attach_clipboard_watch(&change_host(free_listeners.clone()), &mut via_free);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn detach_method_matches_detach_clipboard_watch() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_clipboard_watch();
        let mut free_watch = create_clipboard_watch();
        attach_clipboard_watch(&change_host(method_listeners.clone()), &mut method_watch);
        attach_clipboard_watch(&change_host(free_listeners.clone()), &mut free_watch);
        method_watch.detach();
        detach_clipboard_watch(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn attach_watch_method_matches_attach_clipboard_watch() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_clipboard_watch();
        let mut free_watch = create_clipboard_watch();
        let method_host = change_host(method_listeners.clone());
        let free_host = change_host(free_listeners.clone());
        method_host.attach_watch(&mut method_watch);
        attach_clipboard_watch(&free_host, &mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn dispose_method_matches_dispose_clipboard_watch() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_clipboard_watch();
        let mut free_watch = create_clipboard_watch();
        attach_clipboard_watch(&change_host(method_listeners.clone()), &mut method_watch);
        attach_clipboard_watch(&change_host(free_listeners.clone()), &mut free_watch);
        method_watch.dispose();
        dispose_clipboard_watch(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }
}

/// Allocates a watch with an inert signal (TS `createClipboardWatch`). Attach it to start delivery
/// and detach or dispose it when done.
pub fn create_clipboard_watch() -> ClipboardWatch {
    let mut out: ClipboardWatch = allocate_entity();
    initialize_clipboard_watch(&mut out);
    return out;
}

/// Gives a watch under construction an inert change signal (TS `initializeClipboardWatch`).
pub fn initialize_clipboard_watch(out: &mut ClipboardWatch) {
    out.on_change = create_signal();
}

/// Attaches the watch to the explicitly supplied host change subscription (TS
/// `attachClipboardWatch`). Attaching the same watch again first releases its prior subscription,
/// even when the new host is different.
pub fn attach_clipboard_watch(
    host_clipboard_change: &HostClipboardChangeCapability,
    watch: &mut ClipboardWatch,
) {
    detach_clipboard_watch(watch);
    let Some(subscribe) = host_clipboard_change.subscribe.as_ref() else {
        throw_type_error(
            "HostClipboardChangeCapability.subscribe is required to attach a clipboard watch",
        );
    };
    let signal = watch.on_change.clone();
    let unsubscribe = subscribe(Arc::new(move || emit_signal(&signal, &())));
    attach_entity_binding(watch, Box::new(ClipboardWatchSubscription { unsubscribe }));
}

/// Stops delivery to the watch and forgets its subscription (TS `detachClipboardWatch`). Safe to
/// call when the watch is not attached.
pub fn detach_clipboard_watch(watch: &mut ClipboardWatch) {
    let subscription =
        get_entity_binding_as::<ClipboardWatchSubscription, ClipboardWatch>(watch).cloned();
    let Some(subscription) = subscription else {
        return;
    };
    detach_entity_binding(watch);
    (subscription.unsubscribe)();
}

/// Detaches the watch's provider subscription and releases it (TS `disposeClipboardWatch`). The
/// signal remains plain shared memory afterward.
pub fn dispose_clipboard_watch(watch: &mut ClipboardWatch) {
    detach_clipboard_watch(watch);
}

// ============================================================================
// D18 sugar: methods on the watch delegate to the free functions
// ============================================================================

impl HostClipboardChangeCapability {
    pub fn attach_watch(&self, watch: &mut ClipboardWatch) {
        return attach_clipboard_watch(self, watch);
    }
}

impl ClipboardWatch {
    pub fn new() -> Self {
        return create_clipboard_watch();
    }

    pub fn detach(&mut self) {
        return detach_clipboard_watch(self);
    }

    pub fn dispose(&mut self) {
        return dispose_clipboard_watch(self);
    }
}
