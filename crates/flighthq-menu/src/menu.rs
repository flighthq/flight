//! Menu free functions and backend management.

use flighthq_types::{MenuBackend, MenuItemTemplate, MenuItemType};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Web sentinel backend
// ---------------------------------------------------------------------------

/// Default web backend. Web has no native menu bar or OS context menu, so
/// `set_application_menu` returns `false` and `show_context_menu` resolves
/// `None`. A native host (Electron's `Menu`, Tauri) is required.
pub struct WebMenuBackend;

impl MenuBackend for WebMenuBackend {
    fn set_application_menu(&self, _items: &[MenuItemTemplate]) -> bool {
        // Web has no native menu bar.
        false
    }

    fn popup_context_menu(
        &self,
        _items: &[MenuItemTemplate],
        _x: f32,
        _y: f32,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>> {
        // Web has no OS context menu.
        Box::pin(async { None })
    }

    fn subscribe_select(
        &self,
        _listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // Web app-menu has no select source; a native host is required.
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active menu backend. Falls back to the web sentinel default when
/// no backend has been installed.
pub fn get_menu_backend() -> Arc<dyn MenuBackend> {
    let mut guard = BACKEND.lock().expect("menu backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(WebMenuBackend) as Arc<dyn MenuBackend>);
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Installs a native host menu backend. Pass `None` to revert to the web
/// sentinel default.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_menu_backend(backend: Option<Arc<dyn MenuBackend>>) {
    let mut guard = BACKEND.lock().expect("menu backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Builds a [`MenuItemTemplate`] with canonical defaults applied. Prefer this
/// over a plain struct literal so unspecified fields take their default values
/// (`item_type: Normal`, `enabled: true`).
pub fn create_menu_item_template(template: MenuItemTemplate) -> MenuItemTemplate {
    MenuItemTemplate {
        item_type: MenuItemType::Normal,
        enabled: true,
        ..template
    }
}

/// Subscribes to application menu item selections, delivering the selected item
/// id. Returns an unsubscribe function.
///
/// On web this never fires (no native menu bar); a native host is required.
pub fn on_menu_select(listener: Box<dyn Fn(String) + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
    get_menu_backend().subscribe_select(listener)
}

/// Sets the application menu bar from the provided item templates.
///
/// Returns `false` when the host lacks a native menu bar (e.g. web).
pub fn set_application_menu(items: &[MenuItemTemplate]) -> bool {
    get_menu_backend().set_application_menu(items)
}

/// Pops up a context menu at `(x, y)` and resolves the clicked item id, or
/// `None` when dismissed or unsupported (e.g. web).
pub async fn show_context_menu(items: &[MenuItemTemplate], x: f32, y: f32) -> Option<String> {
    get_menu_backend().popup_context_menu(items, x, y).await
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn MenuBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct StubMenuBackend {
        selected_id: Option<String>,
    }

    impl MenuBackend for StubMenuBackend {
        fn set_application_menu(&self, _items: &[MenuItemTemplate]) -> bool {
            true
        }
        fn popup_context_menu(
            &self,
            _items: &[MenuItemTemplate],
            _x: f32,
            _y: f32,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>> {
            let id = self.selected_id.clone();
            Box::pin(async move { id })
        }
        fn subscribe_select(
            &self,
            _listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    // create_menu_item_template
    #[test]
    fn create_menu_item_template_applies_defaults() {
        let item = create_menu_item_template(MenuItemTemplate {
            id: Some("file".to_string()),
            label: Some("File".to_string()),
            ..Default::default()
        });
        assert_eq!(item.item_type, MenuItemType::Normal);
        assert!(item.enabled);
        assert_eq!(item.id.as_deref(), Some("file"));
    }

    // get_menu_backend
    #[test]
    #[serial]
    fn get_menu_backend_returns_web_default() {
        set_menu_backend(None);
        let _backend = get_menu_backend();
    }

    // on_menu_select
    #[test]
    #[serial]
    fn on_menu_select_returns_unsubscribe() {
        set_menu_backend(None);
        let unsubscribe = on_menu_select(Box::new(|_id| {}));
        unsubscribe();
    }

    // set_application_menu
    #[test]
    #[serial]
    fn set_application_menu_returns_false_on_web() {
        set_menu_backend(None);
        assert!(!set_application_menu(&[]));
    }

    // set_menu_backend
    #[test]
    #[serial]
    fn set_menu_backend_installs_custom() {
        set_menu_backend(Some(Arc::new(StubMenuBackend { selected_id: None })));
        assert!(set_application_menu(&[]));
        set_menu_backend(None);
    }
}
