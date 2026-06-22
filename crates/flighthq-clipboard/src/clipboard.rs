//! Clipboard free functions and backend management.

use flighthq_types::{ClipboardBackend, ClipboardBookmark};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active clipboard backend. Panics if no backend has been set and
/// no default stub is available. Callers should ensure [`set_clipboard_backend`]
/// is called during application startup.
pub fn get_clipboard_backend() -> Arc<dyn ClipboardBackend> {
    let guard = BACKEND.lock().expect("clipboard backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => panic!("no clipboard backend installed; call set_clipboard_backend before use"),
    }
}

/// Installs a clipboard backend. Pass `None` to clear the active backend.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_clipboard_backend(backend: Option<Arc<dyn ClipboardBackend>>) {
    let mut guard = BACKEND.lock().expect("clipboard backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Clears the system clipboard. Returns `false` when the host denies access.
pub async fn clear_clipboard() -> bool {
    get_clipboard_backend().clear().await
}

/// Returns `true` when the clipboard currently holds an image.
/// Returns `false` when access is denied.
pub async fn has_clipboard_image() -> bool {
    get_clipboard_backend().has_image().await
}

/// Returns `true` when the clipboard currently holds non-empty text.
/// Returns `false` when access is denied.
pub async fn has_clipboard_text() -> bool {
    get_clipboard_backend().has_text().await
}

/// Reads a bookmark (title + URL) from the clipboard, or `None` when none is
/// present or access is denied.
pub async fn read_clipboard_bookmark() -> Option<ClipboardBookmark> {
    get_clipboard_backend().read_bookmark().await
}

/// Reads HTML from the clipboard, or `""` when none is present or access is denied.
pub async fn read_clipboard_html() -> String {
    get_clipboard_backend().read_html().await
}

/// Reads an image from the clipboard as a data URL, or `""` when none is
/// present or access is denied.
pub async fn read_clipboard_image() -> String {
    get_clipboard_backend().read_image().await
}

/// Reads RTF (Rich Text Format) markup from the clipboard, or `""` when none
/// is present or access is denied.
pub async fn read_clipboard_rtf() -> String {
    get_clipboard_backend().read_rtf().await
}

/// Reads plain text from the clipboard, or `""` when empty or access is denied.
pub async fn read_clipboard_text() -> String {
    get_clipboard_backend().read_text().await
}

/// Writes a bookmark (title + URL) to the clipboard.
/// Returns `false` when the host denies access.
pub async fn write_clipboard_bookmark(title: &str, url: &str) -> bool {
    get_clipboard_backend().write_bookmark(title, url).await
}

/// Writes HTML to the clipboard. Returns `false` when the host denies access.
pub async fn write_clipboard_html(html: &str) -> bool {
    get_clipboard_backend().write_html(html).await
}

/// Writes an image (given as a data URL) to the clipboard.
/// Returns `false` when the host denies access.
pub async fn write_clipboard_image(data_url: &str) -> bool {
    get_clipboard_backend().write_image(data_url).await
}

/// Writes RTF (Rich Text Format) markup to the clipboard.
/// Returns `false` when the host denies access.
pub async fn write_clipboard_rtf(rtf: &str) -> bool {
    get_clipboard_backend().write_rtf(rtf).await
}

/// Writes plain text to the clipboard. Returns `false` when the host denies access.
pub async fn write_clipboard_text(text: &str) -> bool {
    get_clipboard_backend().write_text(text).await
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn ClipboardBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct StubBackend;

    impl ClipboardBackend for StubBackend {
        fn read_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            Box::pin(async { String::new() })
        }
        fn write_text(
            &self,
            _text: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn read_html(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            Box::pin(async { String::new() })
        }
        fn write_html(
            &self,
            _html: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn has_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn read_image(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            Box::pin(async { String::new() })
        }
        fn write_image(
            &self,
            _data_url: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn has_image(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn read_rtf(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            Box::pin(async { String::new() })
        }
        fn write_rtf(
            &self,
            _rtf: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn read_bookmark(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<ClipboardBookmark>> + Send>>
        {
            Box::pin(async { None })
        }
        fn write_bookmark(
            &self,
            _title: &str,
            _url: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn clear(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
    }

    #[test]
    #[serial]
    fn set_clipboard_backend_installs_backend() {
        set_clipboard_backend(Some(Arc::new(StubBackend)));
        // get_clipboard_backend should not panic after installation
        let _b = get_clipboard_backend();
        // Clear after test
        set_clipboard_backend(None);
    }
}
