use std::sync::{Arc, Mutex};

use flight_menu::contract::*;
use flight_signals::{connect_signal, emit_signal};

type ListenerSlot = Option<Arc<dyn Fn(&str) + Send + Sync>>;

fn listener_host() -> (MenuSubscribe, Arc<Mutex<Vec<ListenerSlot>>>) {
    let listeners: Arc<Mutex<Vec<ListenerSlot>>> = Arc::new(Mutex::new(Vec::new()));
    let host_listeners = listeners.clone();
    let subscribe: MenuSubscribe = Arc::new(move |listener: Arc<dyn Fn(&str) + Send + Sync>| {
        let mut locked = host_listeners.lock().unwrap();
        locked.push(Some(listener));
        let index = locked.len() - 1;
        drop(locked);
        let unsubscribe_listeners = host_listeners.clone();
        let unsubscribe: MenuUnsubscribe = Arc::new(move || {
            unsubscribe_listeners.lock().unwrap()[index] = None;
        });
        return unsubscribe;
    });
    return (subscribe, listeners);
}

fn highlight_host() -> (HostMenuHighlightCapability, Arc<Mutex<Vec<ListenerSlot>>>) {
    let (subscribe, listeners) = listener_host();
    return (
        HostMenuHighlightCapability {
            provider: Arc::new(()),
            subscribe,
        },
        listeners,
    );
}

fn select_host() -> (HostMenuSelectCapability, Arc<Mutex<Vec<ListenerSlot>>>) {
    let (subscribe, listeners) = listener_host();
    return (
        HostMenuSelectCapability {
            provider: Arc::new(()),
            subscribe,
        },
        listeners,
    );
}

fn emit_listeners(listeners: &Arc<Mutex<Vec<ListenerSlot>>>, id: &str) {
    let callbacks: Vec<Arc<dyn Fn(&str) + Send + Sync>> = listeners
        .lock()
        .unwrap()
        .iter()
        .flatten()
        .cloned()
        .collect();
    for callback in callbacks {
        callback(id);
    }
}

fn listener_count(listeners: &Arc<Mutex<Vec<ListenerSlot>>>) -> usize {
    return listeners.lock().unwrap().iter().flatten().count();
}

fn highlight_seen(highlight: &MenuHighlight) -> Arc<Mutex<Vec<String>>> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let captured = seen.clone();
    connect_signal(
        &highlight.on_menu_item_highlight,
        Arc::new(move |id: &String| captured.lock().unwrap().push(id.clone())),
        None,
    );
    return seen;
}

fn select_seen(select: &MenuSelect) -> Arc<Mutex<Vec<String>>> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let captured = seen.clone();
    connect_signal(
        &select.on_menu_item_select,
        Arc::new(move |id: &String| captured.lock().unwrap().push(id.clone())),
        None,
    );
    return seen;
}

mod attach_menu_highlight {
    use super::*;

    #[test]
    fn delivers_highlight_ids_into_the_entity_signal() {
        let (host, listeners) = highlight_host();
        let mut highlight = create_menu_highlight();
        let seen = highlight_seen(&highlight);
        attach_menu_highlight(&host, &mut highlight);
        emit_listeners(&listeners, "open");
        assert_eq!(*seen.lock().unwrap(), vec!["open".to_string()]);
    }

    #[test]
    fn reattaching_replaces_its_own_subscription() {
        let (host, listeners) = highlight_host();
        let mut highlight = create_menu_highlight();
        let seen = highlight_seen(&highlight);
        attach_menu_highlight(&host, &mut highlight);
        attach_menu_highlight(&host, &mut highlight);
        assert_eq!(listener_count(&listeners), 1);
        emit_listeners(&listeners, "open");
        assert_eq!(*seen.lock().unwrap(), vec!["open".to_string()]);
    }
}

mod attach_menu_select {
    use super::*;

    #[test]
    fn delivers_selections_into_the_entity_signal() {
        let (host, listeners) = select_host();
        let mut select = create_menu_select();
        let seen = select_seen(&select);
        attach_menu_select(&host, &mut select);
        emit_listeners(&listeners, "save");
        assert_eq!(*seen.lock().unwrap(), vec!["save".to_string()]);
    }

    #[test]
    fn reattaching_replaces_its_own_subscription_rather_than_stacking() {
        let (host, listeners) = select_host();
        let mut select = create_menu_select();
        let seen = select_seen(&select);
        attach_menu_select(&host, &mut select);
        attach_menu_select(&host, &mut select);
        assert_eq!(listener_count(&listeners), 1);
        emit_listeners(&listeners, "save");
        assert_eq!(*seen.lock().unwrap(), vec!["save".to_string()]);
    }
}

mod create_menu_highlight {
    use super::*;

    #[test]
    fn allocates_an_inert_entity_that_delivers_nothing_until_attached() {
        let (_host, listeners) = highlight_host();
        let highlight = create_menu_highlight();
        let seen = highlight_seen(&highlight);
        emit_listeners(&listeners, "never");
        assert!(seen.lock().unwrap().is_empty());
    }
}

mod create_menu_select {
    use super::*;

    #[test]
    fn allocates_an_inert_entity_that_delivers_nothing_until_attached() {
        let (_host, listeners) = select_host();
        let select = create_menu_select();
        let seen = select_seen(&select);
        emit_listeners(&listeners, "never");
        assert!(seen.lock().unwrap().is_empty());
    }
}

mod detach_menu_highlight {
    use super::*;

    #[test]
    fn is_safe_on_an_entity_that_was_never_attached() {
        let mut highlight = create_menu_highlight();
        detach_menu_highlight(&mut highlight);
    }

    #[test]
    fn stops_delivery_and_releases_the_provider_subscription() {
        let (host, listeners) = highlight_host();
        let mut highlight = create_menu_highlight();
        let seen = highlight_seen(&highlight);
        attach_menu_highlight(&host, &mut highlight);
        emit_listeners(&listeners, "first");
        detach_menu_highlight(&mut highlight);
        emit_listeners(&listeners, "second");
        assert_eq!(*seen.lock().unwrap(), vec!["first".to_string()]);
        assert_eq!(listener_count(&listeners), 0);
    }
}

mod detach_menu_select {
    use super::*;

    #[test]
    fn stops_delivery_and_releases_the_provider_subscription() {
        let (host, listeners) = select_host();
        let mut select = create_menu_select();
        let seen = select_seen(&select);
        attach_menu_select(&host, &mut select);
        emit_listeners(&listeners, "first");
        detach_menu_select(&mut select);
        emit_listeners(&listeners, "second");
        assert_eq!(*seen.lock().unwrap(), vec!["first".to_string()]);
        assert_eq!(listener_count(&listeners), 0);
    }

    #[test]
    fn ends_only_its_own_subscription() {
        let (host, listeners) = select_host();
        let mut kept = create_menu_select();
        let mut dropped = create_menu_select();
        let kept_seen = select_seen(&kept);
        attach_menu_select(&host, &mut kept);
        attach_menu_select(&host, &mut dropped);
        detach_menu_select(&mut dropped);
        emit_listeners(&listeners, "still-here");
        assert_eq!(*kept_seen.lock().unwrap(), vec!["still-here".to_string()]);
    }
}

mod dispose_menu_highlight {
    use super::*;

    #[test]
    fn detaches_and_clears_listeners() {
        let (host, listeners) = highlight_host();
        let mut highlight = create_menu_highlight();
        let seen = highlight_seen(&highlight);
        attach_menu_highlight(&host, &mut highlight);
        dispose_menu_highlight(&mut highlight);
        emit_listeners(&listeners, "after-dispose");
        assert!(seen.lock().unwrap().is_empty());
        assert_eq!(listener_count(&listeners), 0);
    }
}

mod dispose_menu_select {
    use super::*;

    #[test]
    fn detaches_and_clears_listeners() {
        let (host, listeners) = select_host();
        let mut select = create_menu_select();
        let seen = select_seen(&select);
        attach_menu_select(&host, &mut select);
        dispose_menu_select(&mut select);
        emit_listeners(&listeners, "after-dispose");
        assert!(seen.lock().unwrap().is_empty());
        assert_eq!(listener_count(&listeners), 0);
    }
}

mod initialize_menu_highlight {
    use super::*;

    #[test]
    fn replaces_the_signal_of_an_existing_entity() {
        let mut highlight = create_menu_highlight();
        let old_seen = highlight_seen(&highlight);
        initialize_menu_highlight(&mut highlight);
        emit_signal(&highlight.on_menu_item_highlight, &"new".to_string());
        assert!(old_seen.lock().unwrap().is_empty());
        let new_seen = highlight_seen(&highlight);
        emit_signal(&highlight.on_menu_item_highlight, &"new".to_string());
        assert_eq!(*new_seen.lock().unwrap(), vec!["new".to_string()]);
    }
}

mod initialize_menu_select {
    use super::*;

    #[test]
    fn replaces_the_signal_of_an_existing_entity() {
        let mut select = create_menu_select();
        let old_seen = select_seen(&select);
        initialize_menu_select(&mut select);
        emit_signal(&select.on_menu_item_select, &"new".to_string());
        assert!(old_seen.lock().unwrap().is_empty());
        let new_seen = select_seen(&select);
        emit_signal(&select.on_menu_item_select, &"new".to_string());
        assert_eq!(*new_seen.lock().unwrap(), vec!["new".to_string()]);
    }
}
