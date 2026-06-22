//! Dialog free functions and backend management.

use flighthq_types::{
    DialogBackend, MessageDialogOptions, MessageDialogResult, OpenFileDialogOptions,
    SaveFileDialogOptions,
};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active dialog backend. Panics if no backend has been set.
/// Callers should ensure [`set_dialog_backend`] is called during startup.
pub fn get_dialog_backend() -> Arc<dyn DialogBackend> {
    let guard = BACKEND.lock().expect("dialog backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => panic!("no dialog backend installed; call set_dialog_backend before use"),
    }
}

/// Installs a dialog backend. Pass `None` to clear the active backend.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_dialog_backend(backend: Option<Arc<dyn DialogBackend>>) {
    let mut guard = BACKEND.lock().expect("dialog backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Shows a yes/no confirmation dialog. Returns `false` on cancel or when the
/// host lacks the surface.
pub async fn show_confirm_dialog(options: &MessageDialogOptions) -> bool {
    get_dialog_backend().confirm(options).await
}

/// Shows an informational message dialog. Returns the pressed button index and
/// final checkbox state. On a host that only supports a dismiss action, returns
/// `button_index: 0` and the requested `checkbox_checked` value.
pub async fn show_message_dialog(options: &MessageDialogOptions) -> MessageDialogResult {
    get_dialog_backend().message(options).await
}

/// Shows an open-file picker. Returns selected paths (`[]` on cancel). On
/// hosts that cannot expose real paths, file names are returned instead.
pub async fn show_open_file_dialog(options: &OpenFileDialogOptions) -> Vec<String> {
    get_dialog_backend().open_file(options).await
}

/// Shows a text prompt. Returns the entered string, or `None` on cancel or
/// when the host lacks the surface.
pub async fn show_prompt_dialog(message: &str, default_value: &str) -> Option<String> {
    get_dialog_backend().prompt(message, default_value).await
}

/// Shows a save-file picker. Returns the chosen path, or `None` on cancel.
/// Hosts that cannot expose a writable path always return `None`.
pub async fn show_save_file_dialog(options: &SaveFileDialogOptions) -> Option<String> {
    get_dialog_backend().save_file(options).await
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn DialogBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct StubBackend;

    impl DialogBackend for StubBackend {
        fn open_file(
            &self,
            _options: &OpenFileDialogOptions,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>> {
            Box::pin(async { vec![] })
        }
        fn save_file(
            &self,
            _options: &SaveFileDialogOptions,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>> {
            Box::pin(async { None })
        }
        fn message(
            &self,
            options: &MessageDialogOptions,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = MessageDialogResult> + Send>>
        {
            let checkbox_checked = options.checkbox_checked;
            Box::pin(async move {
                MessageDialogResult {
                    button_index: 0,
                    checkbox_checked,
                }
            })
        }
        fn confirm(
            &self,
            _options: &MessageDialogOptions,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn prompt(
            &self,
            _message: &str,
            _default_value: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>> {
            Box::pin(async { None })
        }
    }

    #[test]
    #[serial]
    fn set_dialog_backend_installs_backend() {
        set_dialog_backend(Some(Arc::new(StubBackend)));
        // get_dialog_backend should not panic after installation
        let _b = get_dialog_backend();
        // Clear after test
        set_dialog_backend(None);
    }
}
