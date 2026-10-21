use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_entity::{NonEntityCreateResult, Ref, allocate_entity, throw_error};
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::Mutex;

    fn app_host(
        accepted: bool,
        seen: Arc<Mutex<Vec<Vec<Ref<MenuItemTemplate>>>>>,
    ) -> Ref<HostAppMenuCapability> {
        return Arc::new(RwLock::new(HostAppMenuCapability {
            destroy: None,
            set_app_menu: Arc::new(move |items: &[Ref<MenuItemTemplate>]| {
                seen.lock().unwrap().push(items.to_vec());
                return accepted;
            }),
        }));
    }

    fn popup_host(result: Option<String>) -> HostMenuPopupCapability {
        return HostMenuPopupCapability {
            popup: Arc::new(
                move |_items: Vec<Ref<MenuItemTemplate>>, _x: f32, _y: f32| {
                    let value = result.clone();
                    let future: MenuPopupFuture = Box::pin(async move { Ok(value) });
                    return future;
                },
            ),
        };
    }

    #[test]
    fn set_app_menu_method_matches_set_app_menu() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let method_host = app_host(true, method_seen.clone());
        let free_host = app_host(true, free_seen.clone());
        let items = [create_menu_item_template(None)];
        let via_method = HostAppMenuCapabilityMethods::set_app_menu(&method_host, &items);
        let via_free = set_app_menu(&free_host, &items);
        assert_eq!(via_method, via_free);
        let recorded_method = method_seen.lock().unwrap();
        let recorded_free = free_seen.lock().unwrap();
        assert_eq!(recorded_method.len(), recorded_free.len());
        assert!(Arc::ptr_eq(&recorded_method[0][0], &recorded_free[0][0]));
    }

    #[test]
    fn show_context_menu_method_matches_show_context_menu() {
        let method_host = popup_host(Some("chosen".to_string()));
        let free_host = popup_host(Some("chosen".to_string()));
        let items: [Ref<MenuItemTemplate>; 0] = [];
        assert_eq!(
            block_on(method_host.show_context_menu(&items, 1.0, 2.0, None)),
            block_on(show_context_menu(&free_host, &items, 1.0, 2.0, None))
        );
    }

    #[test]
    fn enable_signals_method_matches_enable_menu_signals() {
        let mut method_state = MenuSignalsState { signals: None };
        let mut free_state = MenuSignalsState { signals: None };
        let method_count = Arc::new(Mutex::new(0));
        let free_count = Arc::new(Mutex::new(0));
        {
            let method_signals = method_state.enable_signals();
            let method_open = method_signals.read().unwrap().on_context_menu_open.clone();
            let captured = method_count.clone();
            flight_signals::connect_signal(
                &method_open,
                Arc::new(move |_args: &()| *captured.lock().unwrap() += 1),
                None,
            );
            let free_signals = enable_menu_signals(&mut free_state);
            let free_open = free_signals.read().unwrap().on_context_menu_open.clone();
            let captured = free_count.clone();
            flight_signals::connect_signal(
                &free_open,
                Arc::new(move |_args: &()| *captured.lock().unwrap() += 1),
                None,
            );
            flight_signals::emit_signal(&method_open, &());
            flight_signals::emit_signal(&free_open, &());
        }
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
    }

    #[test]
    fn signals_method_matches_get_menu_signals() {
        let mut state = MenuSignalsState { signals: None };
        assert!(state.signals().is_none());
        enable_menu_signals(&mut state);
        assert!(state.signals().is_some());
    }
}

/// Builds a menu item template, filling the source defaults (`type` `normal`, `enabled` TRUE) and
/// normalizing submenu children recursively (TS `createMenuItemTemplate`). This is a deliberate
/// non-entity descriptor helper: shared plain data with no runtime slot and no entity factory. It
/// returns fresh descriptor objects, exactly as the source spread constructs new items.
pub fn create_menu_item_template(
    template: Option<&Ref<MenuItemTemplate>>,
) -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut item = MenuItemTemplate {
        id: None,
        label: None,
        type_: Some(MenuItemType::Normal),
        role: None,
        accelerator: None,
        enabled: Some(true),
        checked: None,
        visible: None,
        sublabel: None,
        tool_tip: None,
        submenu: None,
    };
    if let Some(template) = template {
        let borrowed = template.read().unwrap();
        item.id = borrowed.id.clone();
        item.label = borrowed.label.clone();
        if borrowed.type_.is_some() {
            item.type_ = borrowed.type_;
        }
        item.role = borrowed.role.clone();
        item.accelerator = borrowed.accelerator.clone();
        if borrowed.enabled.is_some() {
            item.enabled = borrowed.enabled;
        }
        item.checked = borrowed.checked;
        item.visible = borrowed.visible;
        item.sublabel = borrowed.sublabel.clone();
        item.tool_tip = borrowed.tool_tip.clone();
        item.submenu = borrowed.submenu.clone();
    }
    let supplied_children = item.submenu.clone();
    if let Some(supplied_children) = supplied_children {
        let mut children: Vec<Ref<MenuItemTemplate>> = Vec::new();
        for child in supplied_children {
            children.push(create_menu_item_template(Some(&child)));
        }
        item.submenu = Some(children);
    }
    return Arc::new(RwLock::new(item));
}

/// Deep-clones a menu descriptor graph (TS `cloneMenuTemplate`). The clone has the same shape and
/// values in distinct descriptor objects, including recursively distinct children.
pub fn clone_menu_template(template: &Ref<MenuItemTemplate>) -> Ref<MenuItemTemplate> {
    let borrowed = template.read().unwrap();
    let mut clone = MenuItemTemplate {
        id: borrowed.id.clone(),
        label: borrowed.label.clone(),
        type_: borrowed.type_,
        role: borrowed.role.clone(),
        accelerator: borrowed.accelerator.clone(),
        enabled: borrowed.enabled,
        checked: borrowed.checked,
        visible: borrowed.visible,
        sublabel: borrowed.sublabel.clone(),
        tool_tip: borrowed.tool_tip.clone(),
        submenu: None,
    };
    let supplied_children = borrowed.submenu.clone();
    drop(borrowed);
    if let Some(supplied_children) = supplied_children {
        let mut children: Vec<Ref<MenuItemTemplate>> = Vec::new();
        for child in supplied_children {
            children.push(clone_menu_template(&child));
        }
        clone.submenu = Some(children);
    }
    return Arc::new(RwLock::new(clone));
}

/// Destroys every distinct application provider exactly once (TS `destroyAppMenu`). Alias-safe:
/// two hosts may share one provider object, so provider identity is the shared `Ref` identity.
/// Every obligation is attempted even after one throws, and the first error is re-thrown once the
/// siblings ran. A provider whose destroy threw is retained so a later call retries only the
/// failures; successful ones are recorded in the caller-owned `released` state and never destroyed
/// twice.
// flight-lint: allow(conform-params) D5: explicit caller-owned released-provider record replaces the source module-level WeakSet; TS destroyAppMenu(...hostAppMenu)
pub fn destroy_app_menu(
    released: &mut AppMenuDestroyedProviders,
    host_app_menu: &[Ref<HostAppMenuCapability>],
) {
    released.released.retain(|weak| weak.strong_count() > 0);
    let mut pending: Vec<Ref<HostAppMenuCapability>> = Vec::new();
    for provider in host_app_menu {
        let already = released.released.iter().any(|weak| {
            return match weak.upgrade() {
                Some(existing) => Arc::ptr_eq(&existing, provider),
                None => false,
            };
        }) || pending
            .iter()
            .any(|existing| Arc::ptr_eq(existing, provider));
        if !already {
            pending.push(provider.clone());
        }
    }
    let mut failure: Option<Box<dyn Any + Send>> = None;
    for provider in pending {
        let destroy = provider.read().unwrap().destroy.clone();
        if let Some(destroy) = destroy {
            let result = catch_unwind(AssertUnwindSafe(|| destroy()));
            if let Err(payload) = result {
                if failure.is_none() {
                    failure = Some(payload);
                }
                continue;
            }
        }
        released.released.push(Arc::downgrade(&provider));
    }
    if let Some(payload) = failure {
        resume_unwind(payload);
    }
}

/// Returns the enabled context-menu dispatcher group, allocating it on first use (TS
/// `enableMenuSignals`). The group lives in caller-owned state, not a module-level singleton.
// flight-lint: allow(conform-params) D5: explicit caller-owned MenuSignalsState replaces the source module-level singleton group
pub fn enable_menu_signals(state: &mut MenuSignalsState) -> Ref<MenuSignals> {
    if state.signals.is_none() {
        let mut out: MenuSignals = allocate_entity();
        out.on_context_menu_close = create_signal();
        out.on_context_menu_open = create_signal();
        state.signals = Some(Arc::new(std::sync::RwLock::new(out)));
    }
    return state
        .signals
        .as_ref()
        .expect("enabled menu signals are present")
        .clone();
}

/// Returns the enabled group, or `None` before `enable_menu_signals` ran (TS `getMenuSignals`).
// flight-lint: allow(conform-params) D5: explicit caller-owned MenuSignalsState replaces the source module-level singleton group
pub fn get_menu_signals(state: &MenuSignalsState) -> Option<Ref<MenuSignals>> {
    return state.signals.clone();
}

/// Installs the application menu bar through the supplied provider (TS `setAppMenu`). `false` is the
/// provider's did-not-take-effect sentinel, forwarded unchanged.
pub fn set_app_menu(
    host_app_menu: &Ref<HostAppMenuCapability>,
    items: &[Ref<MenuItemTemplate>],
) -> bool {
    let set = host_app_menu.read().unwrap().set_app_menu.clone();
    return set(items);
}

/// Pops up a context menu through the supplied provider (TS `showContextMenu`) and resolves the
/// chosen item id, or `None` when dismissed. Emits the caller-owned dispatcher open signal before
/// the call and the close signal after a fulfilled call, matching the source `then` (a rejection
/// propagates without a close).
// flight-lint: allow(conform-params) D5: the enabled dispatcher group is caller-owned state in Rust; TS reads a module-level group
pub async fn show_context_menu(
    host_menu_popup: &HostMenuPopupCapability,
    items: &[Ref<MenuItemTemplate>],
    x: f32,
    y: f32,
    signals: Option<Ref<MenuSignals>>,
) -> MenuPopupResult {
    if let Some(signals) = signals.as_ref() {
        let open = signals.read().unwrap().on_context_menu_open.clone();
        emit_signal(&open, &());
    }
    let popup = host_menu_popup.popup.clone();
    let result = popup(items.to_vec(), x, y).await;
    if result.is_ok() {
        if let Some(signals) = signals.as_ref() {
            let close = signals.read().unwrap().on_context_menu_close.clone();
            emit_signal(&close, &());
        }
    }
    return result;
}

fn validate_menu_item(
    item: &Ref<MenuItemTemplate>,
    path: &mut Vec<Ref<MenuItemTemplate>>,
) -> Option<String> {
    if path.iter().any(|seen| Arc::ptr_eq(seen, item)) {
        throw_error("validateMenuItemTemplate: cyclic submenu reference detected");
    }
    let borrowed = item.read().unwrap();
    if borrowed.type_ == Some(MenuItemType::Separator) {
        if let Some(label) = borrowed.label.as_ref()
            && !label.is_empty()
        {
            return Some(format!(
                "separator item has a label: \"{}\" (separators should not have labels)",
                label
            ));
        }
        if let Some(accelerator) = borrowed.accelerator.as_ref() {
            return Some(format!(
                "separator item has an accelerator: \"{}\"",
                accelerator
            ));
        }
        if borrowed.submenu.is_some() {
            return Some(String::from("separator item has a submenu"));
        }
        return None;
    }
    let type_string = borrowed
        .type_
        .map(get_menu_item_type_string)
        .unwrap_or("normal");
    if let Some(submenu) = borrowed.submenu.as_ref()
        && borrowed.type_ != Some(MenuItemType::Submenu)
        && !submenu.is_empty()
    {
        return Some(format!(
            "item type \"{}\" has a submenu (only type \"submenu\" should carry children)",
            type_string
        ));
    }
    if borrowed.checked.is_some()
        && borrowed.type_ != Some(MenuItemType::Checkbox)
        && borrowed.type_ != Some(MenuItemType::Radio)
    {
        return Some(format!(
            "item type \"{}\" has \"checked\" (only \"checkbox\" and \"radio\" items are checkable)",
            type_string
        ));
    }
    let supplied_children = borrowed.submenu.clone();
    drop(borrowed);
    if let Some(supplied_children) = supplied_children {
        if let Some(group_error) = validate_menu_radio_groups(&supplied_children) {
            return Some(group_error);
        }
        path.push(item.clone());
        for child in supplied_children {
            if let Some(error) = validate_menu_item(&child, path) {
                return Some(error);
            }
        }
        path.pop();
    }
    return None;
}

/// Validates a menu item graph for consistency (TS `validateMenuItemTemplate`). `None` is the
/// success sentinel; `Some(message)` describes the first violation. Cyclic submenu references are
/// programmer error and throw the source's exact error.
pub fn validate_menu_item_template(template: &Ref<MenuItemTemplate>) -> Option<String> {
    let mut path: Vec<Ref<MenuItemTemplate>> = Vec::new();
    return validate_menu_item(template, &mut path);
}

fn validate_menu_radio_groups(items: &[Ref<MenuItemTemplate>]) -> Option<String> {
    let mut checked_in_run: usize = 0;
    for item in items {
        let borrowed = item.read().unwrap();
        if borrowed.type_ != Some(MenuItemType::Radio) {
            checked_in_run = 0;
            continue;
        }
        if borrowed.checked == Some(true) {
            checked_in_run += 1;
        }
        if checked_in_run > 1 {
            return Some(format!(
                "radio group has {} checked items (a radio group may have at most one)",
                checked_in_run
            ));
        }
    }
    return None;
}

// ============================================================================
// D18 sugar: methods delegate to the free functions
// ============================================================================

impl HostMenuPopupCapability {
    pub async fn show_context_menu(
        &self,
        items: &[Ref<MenuItemTemplate>],
        x: f32,
        y: f32,
        signals: Option<Ref<MenuSignals>>,
    ) -> MenuPopupResult {
        return show_context_menu(self, items, x, y, signals).await;
    }
}

impl MenuSignalsState {
    pub fn enable_signals(&mut self) -> Ref<MenuSignals> {
        return enable_menu_signals(self);
    }

    pub fn signals(&self) -> Option<Ref<MenuSignals>> {
        return get_menu_signals(self);
    }
}

/// Sugar for the shared application-menu provider handle. Provider identity is the `Ref` identity,
/// so the methods live on that handle rather than on the value type.
pub trait HostAppMenuCapabilityMethods {
    fn set_app_menu(&self, items: &[Ref<MenuItemTemplate>]) -> bool;
}

impl HostAppMenuCapabilityMethods for Ref<HostAppMenuCapability> {
    fn set_app_menu(&self, items: &[Ref<MenuItemTemplate>]) -> bool {
        return set_app_menu(self, items);
    }
}
