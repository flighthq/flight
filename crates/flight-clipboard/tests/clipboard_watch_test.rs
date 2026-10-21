use std::sync::{Arc, Mutex};

use flight_clipboard::contract::*;
use flight_entity::has_entity_runtime;
use flight_signals::{connect_signal, emit_signal};

type ListenerSlot = Option<ClipboardUnsubscribe>;

fn change_host() -> (HostClipboardChangeSubscriber, Arc<Mutex<Vec<ListenerSlot>>>) {
    let listeners: Arc<Mutex<Vec<ListenerSlot>>> = Arc::new(Mutex::new(Vec::new()));
    let host_listeners = listeners.clone();
    let host = HostClipboardChangeSubscriber {
        subscribe: Arc::new(move |callback: Arc<dyn Fn() + Send + Sync>| {
            let mut locked = host_listeners.lock().unwrap();
            locked.push(Some(callback));
            let index = locked.len() - 1;
            drop(locked);
            let unsubscribe_listeners = host_listeners.clone();
            let unsubscribe: ClipboardUnsubscribe = Arc::new(move || {
                unsubscribe_listeners.lock().unwrap()[index] = None;
            });
            return unsubscribe;
        }),
    };
    return (host, listeners);
}

fn emit_listeners(listeners: &Arc<Mutex<Vec<ListenerSlot>>>) {
    let callbacks: Vec<ClipboardUnsubscribe> = listeners
        .lock()
        .unwrap()
        .iter()
        .flatten()
        .cloned()
        .collect();
    for callback in callbacks {
        callback();
    }
}

fn listener_count(listeners: &Arc<Mutex<Vec<ListenerSlot>>>) -> usize {
    return listeners.lock().unwrap().iter().flatten().count();
}

fn count_changes(watch: &ClipboardWatch) -> Arc<Mutex<usize>> {
    let changes = Arc::new(Mutex::new(0));
    let captured = changes.clone();
    connect_signal(
        &watch.on_change,
        Arc::new(move |_args: &()| *captured.lock().unwrap() += 1),
        None,
    );
    return changes;
}

mod attach_clipboard_watch {
    use super::*;

    #[test]
    fn attaches_to_the_supplied_host_and_delivers_changes() {
        let (host, listeners) = change_host();
        let mut watch = create_clipboard_watch();
        let changes = count_changes(&watch);
        attach_clipboard_watch(&host, &mut watch);
        assert_eq!(listener_count(&listeners), 1);
        emit_listeners(&listeners);
        assert_eq!(*changes.lock().unwrap(), 1);
    }

    #[test]
    fn reattaching_releases_the_prior_subscription_even_for_a_different_host() {
        let (first_host, first_listeners) = change_host();
        let (second_host, second_listeners) = change_host();
        let mut watch = create_clipboard_watch();
        let changes = count_changes(&watch);
        attach_clipboard_watch(&first_host, &mut watch);
        emit_listeners(&first_listeners);
        assert_eq!(*changes.lock().unwrap(), 1);
        attach_clipboard_watch(&second_host, &mut watch);
        assert_eq!(listener_count(&first_listeners), 0);
        assert_eq!(listener_count(&second_listeners), 1);
        emit_listeners(&first_listeners);
        emit_listeners(&second_listeners);
        assert_eq!(*changes.lock().unwrap(), 2);
        detach_clipboard_watch(&mut watch);
        assert_eq!(listener_count(&second_listeners), 0);
    }

    #[test]
    fn attaches_through_the_required_subscription_shape() {
        let (subscriber, listeners) = change_host();
        let capability = HostClipboardChangeCapability {
            subscribe: Some(subscriber.subscribe.clone()),
        };
        let required = HostClipboardChangeSubscriber {
            subscribe: capability
                .subscribe
                .expect("the aggregate exposes a subscription"),
        };
        let mut watch = create_clipboard_watch();
        attach_clipboard_watch(&required, &mut watch);
        assert_eq!(listener_count(&listeners), 1);
    }
}

mod create_clipboard_watch {
    use super::*;

    #[test]
    fn allocates_an_inert_watch_with_a_working_signal() {
        let watch = create_clipboard_watch();
        assert!(!has_entity_runtime(&watch));
        let changes = count_changes(&watch);
        emit_signal(&watch.on_change, &());
        assert_eq!(*changes.lock().unwrap(), 1);
    }
}

mod detach_clipboard_watch {
    use super::*;

    #[test]
    fn detaches_idempotently() {
        let (host, listeners) = change_host();
        let mut watch = create_clipboard_watch();
        attach_clipboard_watch(&host, &mut watch);
        assert_eq!(listener_count(&listeners), 1);
        detach_clipboard_watch(&mut watch);
        assert_eq!(listener_count(&listeners), 0);
        detach_clipboard_watch(&mut watch);
        assert_eq!(listener_count(&listeners), 0);
    }

    #[test]
    fn detaching_an_unattached_watch_is_a_no_op() {
        let mut watch = create_clipboard_watch();
        detach_clipboard_watch(&mut watch);
        assert!(!has_entity_runtime(&watch));
    }
}

mod dispose_clipboard_watch {
    use super::*;

    #[test]
    fn releases_the_active_subscription_and_allows_later_attach() {
        let (host, listeners) = change_host();
        let mut watch = create_clipboard_watch();
        attach_clipboard_watch(&host, &mut watch);
        dispose_clipboard_watch(&mut watch);
        assert_eq!(listener_count(&listeners), 0);
        attach_clipboard_watch(&host, &mut watch);
        assert_eq!(listener_count(&listeners), 1);
    }
}

mod initialize_clipboard_watch {
    use super::*;

    #[test]
    fn gives_an_existing_watch_a_fresh_inert_signal() {
        let mut watch = create_clipboard_watch();
        let changes = count_changes(&watch);
        initialize_clipboard_watch(&mut watch);
        emit_signal(&watch.on_change, &());
        assert_eq!(*changes.lock().unwrap(), 0);
        let fresh = count_changes(&watch);
        emit_signal(&watch.on_change, &());
        assert_eq!(*fresh.lock().unwrap(), 1);
    }
}
