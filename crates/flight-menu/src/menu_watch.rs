use flight_entity::{
    allocate_entity, attach_entity_binding, detach_entity_binding, get_entity_binding_as,
};
use flight_signals::{clear_signal, create_signal, emit_signal};
use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::Mutex;

    fn highlight_host(listeners: Arc<Mutex<usize>>) -> HostMenuHighlightCapability {
        return subscribe_host(listeners);
    }

    fn subscribe_host(listeners: Arc<Mutex<usize>>) -> HostMenuHighlightCapability {
        return HostMenuHighlightCapability {
            subscribe: Arc::new(move |_listener: Arc<dyn Fn(&str) + Send + Sync>| {
                *listeners.lock().unwrap() += 1;
                let captured = listeners.clone();
                let unsubscribe: MenuUnsubscribe = Arc::new(move || {
                    *captured.lock().unwrap() -= 1;
                });
                return unsubscribe;
            }),
        };
    }

    #[test]
    fn attach_highlight_method_matches_attach_menu_highlight() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_highlight();
        let mut free_watch = create_menu_highlight();
        highlight_host(method_listeners.clone()).attach_highlight(&mut method_watch);
        attach_menu_highlight(&highlight_host(free_listeners.clone()), &mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn attach_select_method_matches_attach_menu_select() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_select();
        let mut free_watch = create_menu_select();
        let method_host = HostMenuSelectCapability {
            subscribe: select_subscribe(method_listeners.clone()),
        };
        let free_host = HostMenuSelectCapability {
            subscribe: select_subscribe(free_listeners.clone()),
        };
        method_host.attach_select(&mut method_watch);
        attach_menu_select(&free_host, &mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    fn select_subscribe(listeners: Arc<Mutex<usize>>) -> MenuSubscribe {
        return Arc::new(move |_listener: Arc<dyn Fn(&str) + Send + Sync>| {
            *listeners.lock().unwrap() += 1;
            let captured = listeners.clone();
            let unsubscribe: MenuUnsubscribe = Arc::new(move || {
                *captured.lock().unwrap() -= 1;
            });
            return unsubscribe;
        });
    }

    #[test]
    fn highlight_new_matches_create_menu_highlight() {
        let method_watch = MenuHighlight::new();
        let free_watch = create_menu_highlight();
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = method_watch;
        let mut free_watch = free_watch;
        highlight_host(method_listeners.clone()).attach_highlight(&mut method_watch);
        attach_menu_highlight(&highlight_host(free_listeners.clone()), &mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn highlight_detach_method_matches_detach_menu_highlight() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_highlight();
        let mut free_watch = create_menu_highlight();
        attach_menu_highlight(&highlight_host(method_listeners.clone()), &mut method_watch);
        attach_menu_highlight(&highlight_host(free_listeners.clone()), &mut free_watch);
        method_watch.detach();
        detach_menu_highlight(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn highlight_dispose_method_matches_dispose_menu_highlight() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_highlight();
        let mut free_watch = create_menu_highlight();
        attach_menu_highlight(&highlight_host(method_listeners.clone()), &mut method_watch);
        attach_menu_highlight(&highlight_host(free_listeners.clone()), &mut free_watch);
        method_watch.dispose();
        dispose_menu_highlight(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn select_new_matches_create_menu_select() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = MenuSelect::new();
        let mut free_watch = create_menu_select();
        let method_host = HostMenuSelectCapability {
            subscribe: select_subscribe(method_listeners.clone()),
        };
        let free_host = HostMenuSelectCapability {
            subscribe: select_subscribe(free_listeners.clone()),
        };
        method_host.attach_select(&mut method_watch);
        attach_menu_select(&free_host, &mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn select_detach_method_matches_detach_menu_select() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_select();
        let mut free_watch = create_menu_select();
        let method_host = HostMenuSelectCapability {
            subscribe: select_subscribe(method_listeners.clone()),
        };
        let free_host = HostMenuSelectCapability {
            subscribe: select_subscribe(free_listeners.clone()),
        };
        method_host.attach_select(&mut method_watch);
        attach_menu_select(&free_host, &mut free_watch);
        method_watch.detach();
        detach_menu_select(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }

    #[test]
    fn select_dispose_method_matches_dispose_menu_select() {
        let method_listeners = Arc::new(Mutex::new(0));
        let free_listeners = Arc::new(Mutex::new(0));
        let mut method_watch = create_menu_select();
        let mut free_watch = create_menu_select();
        let method_host = HostMenuSelectCapability {
            subscribe: select_subscribe(method_listeners.clone()),
        };
        let free_host = HostMenuSelectCapability {
            subscribe: select_subscribe(free_listeners.clone()),
        };
        method_host.attach_select(&mut method_watch);
        attach_menu_select(&free_host, &mut free_watch);
        method_watch.dispose();
        dispose_menu_select(&mut free_watch);
        assert_eq!(
            *method_listeners.lock().unwrap(),
            *free_listeners.lock().unwrap()
        );
    }
}

/// Allocates a highlight event entity with an inert signal (TS `createMenuHighlight`).
pub fn create_menu_highlight() -> MenuHighlight {
    let mut out: MenuHighlight = allocate_entity();
    initialize_menu_highlight(&mut out);
    return out;
}

/// Allocates a select event entity with an inert signal (TS `createMenuSelect`).
pub fn create_menu_select() -> MenuSelect {
    let mut out: MenuSelect = allocate_entity();
    initialize_menu_select(&mut out);
    return out;
}

/// Gives a highlight entity under construction its inert signal (TS `initializeMenuHighlight`).
pub fn initialize_menu_highlight(out: &mut MenuHighlight) {
    out.on_menu_item_highlight = create_signal();
}

/// Gives a select entity under construction its inert signal (TS `initializeMenuSelect`).
pub fn initialize_menu_select(out: &mut MenuSelect) {
    out.on_menu_item_select = create_signal();
}

/// Starts delivering highlight notifications from the supplied provider (TS
/// `attachMenuHighlight`). Re-attaching detaches first, so one entity never holds two live
/// subscriptions; the release callback is origin-pinned in the entity's runtime slot.
pub fn attach_menu_highlight(
    host_menu_highlight: &HostMenuHighlightCapability,
    highlight: &mut MenuHighlight,
) {
    detach_menu_highlight(highlight);
    let signal = highlight.on_menu_item_highlight.clone();
    let unsubscribe = (host_menu_highlight.subscribe)(Arc::new(move |id: &str| {
        let value = id.to_string();
        emit_signal(&signal, &value);
    }));
    attach_entity_binding(highlight, Box::new(MenuSubscription { unsubscribe }));
}

/// Starts delivering application menu-bar selections from the supplied provider (TS
/// `attachMenuSelect`). Same origin-pinned unsubscribe contract as attachMenuHighlight.
pub fn attach_menu_select(host_menu_select: &HostMenuSelectCapability, select: &mut MenuSelect) {
    detach_menu_select(select);
    let signal = select.on_menu_item_select.clone();
    let unsubscribe = (host_menu_select.subscribe)(Arc::new(move |id: &str| {
        let value = id.to_string();
        emit_signal(&signal, &value);
    }));
    attach_entity_binding(select, Box::new(MenuSubscription { unsubscribe }));
}

/// Runs this entity's own highlight unsubscribe, if it has one (TS `detachMenuHighlight`). Safe when
/// never attached; does not touch the provider.
pub fn detach_menu_highlight(highlight: &mut MenuHighlight) {
    let subscription = get_entity_binding_as::<MenuSubscription, MenuHighlight>(highlight).cloned();
    let Some(subscription) = subscription else {
        return;
    };
    detach_entity_binding(highlight);
    (subscription.unsubscribe)();
}

/// Runs this entity's own selection unsubscribe, if it has one (TS `detachMenuSelect`).
pub fn detach_menu_select(select: &mut MenuSelect) {
    let subscription = get_entity_binding_as::<MenuSubscription, MenuSelect>(select).cloned();
    let Some(subscription) = subscription else {
        return;
    };
    detach_entity_binding(select);
    (subscription.unsubscribe)();
}

/// Detaches and clears a highlight entity's listeners (TS `disposeMenuHighlight`).
pub fn dispose_menu_highlight(highlight: &mut MenuHighlight) {
    detach_menu_highlight(highlight);
    clear_signal(&highlight.on_menu_item_highlight);
}

/// Detaches and clears a select entity's listeners (TS `disposeMenuSelect`).
pub fn dispose_menu_select(select: &mut MenuSelect) {
    detach_menu_select(select);
    clear_signal(&select.on_menu_item_select);
}

// ============================================================================
// D18 sugar: methods delegate to the free functions
// ============================================================================

impl HostMenuHighlightCapability {
    pub fn attach_highlight(&self, highlight: &mut MenuHighlight) {
        return attach_menu_highlight(self, highlight);
    }
}

impl HostMenuSelectCapability {
    pub fn attach_select(&self, select: &mut MenuSelect) {
        return attach_menu_select(self, select);
    }
}

impl MenuHighlight {
    pub fn new() -> Self {
        return create_menu_highlight();
    }

    pub fn detach(&mut self) {
        return detach_menu_highlight(self);
    }

    pub fn dispose(&mut self) {
        return dispose_menu_highlight(self);
    }
}

impl MenuSelect {
    pub fn new() -> Self {
        return create_menu_select();
    }

    pub fn detach(&mut self) {
        return detach_menu_select(self);
    }

    pub fn dispose(&mut self) {
        return dispose_menu_select(self);
    }
}
