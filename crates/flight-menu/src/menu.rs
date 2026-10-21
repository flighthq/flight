use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::Arc;

use flight_entity::{NonEntityCreateResult, Ref, allocate_entity};
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::Mutex;

    fn app_host(
        accepted: bool,
        seen: Arc<Mutex<Vec<Vec<MenuItemTemplate>>>>,
    ) -> Ref<HostAppMenuCapability> {
        return Arc::new(std::sync::RwLock::new(HostAppMenuCapability {
            destroy: None,
            set_app_menu: Arc::new(move |items: &[MenuItemTemplate]| {
                seen.lock().unwrap().push(items.to_vec());
                return accepted;
            }),
        }));
    }

    fn popup_host(result: Option<String>) -> HostMenuPopupCapability {
        return HostMenuPopupCapability {
            popup: Arc::new(move |_items: Vec<MenuItemTemplate>, _x: f32, _y: f32| {
                let value = result.clone();
                let future: MenuPopupFuture = Box::pin(async move { Ok(value) });
                return future;
            }),
        };
    }

    #[test]
    fn set_app_menu_method_matches_set_app_menu() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let method_host = app_host(true, method_seen.clone());
        let free_host = app_host(true, free_seen.clone());
        let items = [MenuItemTemplate {
            id: Some("quit".to_string()),
            ..MenuItemTemplate::default()
        }];
        let via_method = HostAppMenuCapabilityMethods::set_app_menu(&method_host, &items);
        let via_free = set_app_menu(&free_host, &items);
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }

    #[test]
    fn show_context_menu_method_matches_show_context_menu() {
        let method_host = popup_host(Some("chosen".to_string()));
        let free_host = popup_host(Some("chosen".to_string()));
        let items: [MenuItemTemplate; 0] = [];
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
/// non-entity descriptor helper: plain data with no runtime slot and no entity factory.
pub fn create_menu_item_template(
    template: Option<&MenuItemTemplate>,
) -> NonEntityCreateResult<MenuItemTemplate> {
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
        item.id = template.id.clone();
        item.label = template.label.clone();
        if template.type_.is_some() {
            item.type_ = template.type_;
        }
        item.role = template.role.clone();
        item.accelerator = template.accelerator.clone();
        if template.enabled.is_some() {
            item.enabled = template.enabled;
        }
        item.checked = template.checked;
        item.visible = template.visible;
        item.sublabel = template.sublabel.clone();
        item.tool_tip = template.tool_tip.clone();
        item.submenu = template.submenu.clone();
    }
    if let Some(submenu) = item.submenu.as_ref() {
        let mut children: Vec<MenuItemTemplate> = Vec::new();
        for child in submenu {
            children.push(create_menu_item_template(Some(child)));
        }
        item.submenu = Some(children);
    }
    return item;
}

/// Identity constructor for the plain menu descriptor tree (TS `cloneMenuTemplate`).
pub fn clone_menu_template(template: &MenuItemTemplate) -> MenuItemTemplate {
    let mut clone = MenuItemTemplate {
        id: template.id.clone(),
        label: template.label.clone(),
        type_: template.type_,
        role: template.role.clone(),
        accelerator: template.accelerator.clone(),
        enabled: template.enabled,
        checked: template.checked,
        visible: template.visible,
        sublabel: template.sublabel.clone(),
        tool_tip: template.tool_tip.clone(),
        submenu: None,
    };
    if let Some(submenu) = template.submenu.as_ref() {
        let mut children: Vec<MenuItemTemplate> = Vec::new();
        for child in submenu {
            children.push(clone_menu_template(child));
        }
        clone.submenu = Some(children);
    }
    return clone;
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
    let mut pending: Vec<Ref<HostAppMenuCapability>> = Vec::new();
    for provider in host_app_menu {
        let already = released
            .released
            .iter()
            .any(|existing| Arc::ptr_eq(existing, provider))
            || pending
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
        released.released.push(provider);
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
    items: &[MenuItemTemplate],
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
    items: &[MenuItemTemplate],
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

fn validate_menu_item(item: &MenuItemTemplate) -> Option<String> {
    if item.type_ == Some(MenuItemType::Separator) {
        if let Some(label) = item.label.as_ref()
            && !label.is_empty()
        {
            return Some(format!(
                "separator item has a label: \"{}\" (separators should not have labels)",
                label
            ));
        }
        if let Some(accelerator) = item.accelerator.as_ref() {
            return Some(format!(
                "separator item has an accelerator: \"{}\"",
                accelerator
            ));
        }
        if item.submenu.is_some() {
            return Some(String::from("separator item has a submenu"));
        }
        return None;
    }
    let type_string = item
        .type_
        .map(get_menu_item_type_string)
        .unwrap_or("normal");
    if let Some(submenu) = item.submenu.as_ref()
        && item.type_ != Some(MenuItemType::Submenu)
        && !submenu.is_empty()
    {
        return Some(format!(
            "item type \"{}\" has a submenu (only type \"submenu\" should carry children)",
            type_string
        ));
    }
    if item.checked.is_some()
        && item.type_ != Some(MenuItemType::Checkbox)
        && item.type_ != Some(MenuItemType::Radio)
    {
        return Some(format!(
            "item type \"{}\" has \"checked\" (only \"checkbox\" and \"radio\" items are checkable)",
            type_string
        ));
    }
    if let Some(submenu) = item.submenu.as_ref() {
        if let Some(group_error) = validate_menu_radio_groups(submenu) {
            return Some(group_error);
        }
        for child in submenu {
            if let Some(error) = validate_menu_item(child) {
                return Some(error);
            }
        }
    }
    return None;
}

/// Validates a menu item tree for consistency (TS `validateMenuItemTemplate`). `None` is the
/// success sentinel; `Some(message)` describes the first violation. Cyclic submenu references are
/// not representable in the Rust value tree, so the source's programmer-error throw is absent.
pub fn validate_menu_item_template(template: &MenuItemTemplate) -> Option<String> {
    return validate_menu_item(template);
}

fn validate_menu_radio_groups(items: &[MenuItemTemplate]) -> Option<String> {
    let mut checked_in_run: usize = 0;
    for item in items {
        if item.type_ != Some(MenuItemType::Radio) {
            checked_in_run = 0;
            continue;
        }
        if item.checked == Some(true) {
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
        items: &[MenuItemTemplate],
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
    fn set_app_menu(&self, items: &[MenuItemTemplate]) -> bool;
}

impl HostAppMenuCapabilityMethods for Ref<HostAppMenuCapability> {
    fn set_app_menu(&self, items: &[MenuItemTemplate]) -> bool {
        return set_app_menu(self, items);
    }
}
