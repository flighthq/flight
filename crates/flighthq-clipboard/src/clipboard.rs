//! Clipboard free functions and backend management.

use flighthq_signals::emit_signal;
use flighthq_types::{ClipboardBackend, ClipboardBookmark, ClipboardWatch, ClipboardWriteItem};
use std::collections::HashMap;
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
// Clipboard-watch entity and lifecycle
// ---------------------------------------------------------------------------

/// Attaches `watch` to the active backend's change subscription. Emits
/// `watch.on_change` on each clipboard change. Idempotent: a prior subscription
/// is torn down first. Pair with [`detach_clipboard_watch`] /
/// [`dispose_clipboard_watch`].
pub fn attach_clipboard_watch(watch: &ClipboardWatch) {
    detach_clipboard_watch(watch);
    let on_change = watch.on_change.clone();
    let unsubscribe = get_clipboard_backend().subscribe_clipboard_change(Box::new(move || {
        emit_signal(&on_change, &());
    }));
    let key = watch as *const ClipboardWatch as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("clipboard subscriptions mutex poisoned");
    guard.push((key, unsubscribe));
}

/// Allocates a [`ClipboardWatch`] event entity with an inert signal. Call
/// [`attach_clipboard_watch`] to start delivery; call
/// [`dispose_clipboard_watch`] when done.
pub fn create_clipboard_watch() -> ClipboardWatch {
    ClipboardWatch::default()
}

/// Stops delivery to `watch` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_clipboard_watch(watch: &ClipboardWatch) {
    let key = watch as *const ClipboardWatch as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("clipboard subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsub) = guard.remove(pos);
        unsub();
    }
}

/// Detaches `watch`'s backend subscription and releases it for garbage
/// collection. The signal remains plain GC-managed memory afterward.
pub fn dispose_clipboard_watch(watch: &ClipboardWatch) {
    detach_clipboard_watch(watch);
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Clears the system clipboard. Returns `false` when the host denies access.
pub async fn clear_clipboard() -> bool {
    get_clipboard_backend().clear().await
}

/// Returns a monotonically increasing change count from the active backend,
/// or `-1` if unsupported (web).
pub fn get_clipboard_change_count() -> i64 {
    get_clipboard_backend().get_change_count()
}

/// Returns the list of MIME/format strings currently on the clipboard.
/// `[]` sentinel on access denied.
pub async fn get_clipboard_formats() -> Vec<String> {
    get_clipboard_backend().get_formats().await
}

/// Returns `true` when the clipboard currently holds a bookmark.
/// Returns `false` when access is denied.
pub async fn has_clipboard_bookmark() -> bool {
    get_clipboard_backend().has_format("text/x-moz-url").await
}

/// Returns `true` when the given MIME/format string is currently present on the
/// clipboard.
pub async fn has_clipboard_format(format: &str) -> bool {
    get_clipboard_backend().has_format(format).await
}

/// Returns `true` when the clipboard currently holds HTML content.
/// Returns `false` when access is denied.
pub async fn has_clipboard_html() -> bool {
    get_clipboard_backend().has_format("text/html").await
}

/// Returns `true` when the clipboard currently holds RTF content.
/// Returns `false` when access is denied.
pub async fn has_clipboard_rtf() -> bool {
    get_clipboard_backend().has_format("text/rtf").await
}

/// Reads multiple formats in one round-trip; missing formats are omitted from
/// the result.
pub async fn read_clipboard(formats: &[String]) -> HashMap<String, String> {
    get_clipboard_backend().read_items(formats).await
}

/// Reads the file paths currently on the clipboard. Returns `[]` when none are
/// present or on web.
pub async fn read_clipboard_files() -> Vec<String> {
    get_clipboard_backend().read_files().await
}

/// Reads an arbitrary MIME/format flavor as a string; returns `""` when absent
/// or access is denied.
pub async fn read_clipboard_format(format: &str) -> String {
    get_clipboard_backend().read_format(format).await
}

/// Writes multiple formats atomically so a paste target picks its best
/// representation.
pub async fn write_clipboard(items: &[ClipboardWriteItem]) -> bool {
    get_clipboard_backend().write_items(items).await
}

/// Writes file paths to the clipboard. Returns `false` when the host denies
/// access or on web.
pub async fn write_clipboard_files(paths: &[String]) -> bool {
    get_clipboard_backend().write_files(paths).await
}

/// Writes an arbitrary MIME/format flavor. Returns `false` when the host denies
/// access.
pub async fn write_clipboard_format(format: &str, data: &str) -> bool {
    get_clipboard_backend().write_format(format, data).await
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

// One active subscription: the ClipboardWatch address it belongs to, and the unsubscribe fn.
type ClipboardSubscription = (usize, Box<dyn Fn() + Send + Sync>);

// Subscription list, keyed by ClipboardWatch address.
static SUBSCRIPTIONS: Mutex<Vec<ClipboardSubscription>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use pollster::block_on;
    use serial_test::serial;

    // Stateful in-memory backend mirroring the TS `fakeBackend`. State lives behind an
    // Arc<Mutex<>> so the &self async methods can mutate it through their returned futures.
    #[derive(Default)]
    struct FakeState {
        text: String,
        html: String,
        rtf: String,
        image: String,
        bookmark: Option<ClipboardBookmark>,
        files: Vec<String>,
        formats: HashMap<String, String>,
        change_count: i64,
        listeners: Vec<Arc<dyn Fn() + Send + Sync>>,
    }

    #[derive(Clone, Default)]
    struct FakeBackend {
        state: Arc<Mutex<FakeState>>,
    }

    impl FakeBackend {
        fn new() -> Self {
            Self::default()
        }

        // Synchronous mirror of the TS `readFormat`, used by the future bodies.
        fn read_format_sync(state: &FakeState, format: &str) -> String {
            match format {
                "text/plain" => state.text.clone(),
                "text/html" => state.html.clone(),
                "text/rtf" => state.rtf.clone(),
                _ => state.formats.get(format).cloned().unwrap_or_default(),
            }
        }

        fn write_format_sync(state: &mut FakeState, format: &str, data: &str) {
            match format {
                "text/plain" => state.text = data.to_string(),
                "text/html" => state.html = data.to_string(),
                "text/rtf" => state.rtf = data.to_string(),
                _ => {
                    state.formats.insert(format.to_string(), data.to_string());
                }
            }
            state.change_count += 1;
        }

        fn get_formats_sync(state: &FakeState) -> Vec<String> {
            let mut out: Vec<String> = Vec::new();
            if !state.text.is_empty() {
                out.push("text/plain".to_string());
            }
            if !state.html.is_empty() {
                out.push("text/html".to_string());
            }
            if !state.rtf.is_empty() {
                out.push("text/rtf".to_string());
            }
            if !state.image.is_empty() {
                out.push("image/png".to_string());
            }
            if state.bookmark.is_some() {
                out.push("text/x-moz-url".to_string());
            }
            for k in state.formats.keys() {
                out.push(k.clone());
            }
            out
        }
    }

    impl ClipboardBackend for FakeBackend {
        fn read_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().text.clone() })
        }
        fn write_text(
            &self,
            text: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let text = text.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.text = text;
                s.change_count += 1;
                true
            })
        }
        fn read_html(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().html.clone() })
        }
        fn write_html(
            &self,
            html: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let html = html.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.html = html;
                s.change_count += 1;
                true
            })
        }
        fn has_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { !state.lock().unwrap().text.is_empty() })
        }
        fn read_image(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().image.clone() })
        }
        fn write_image(
            &self,
            data_url: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let data_url = data_url.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.image = data_url;
                s.change_count += 1;
                true
            })
        }
        fn has_image(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { !state.lock().unwrap().image.is_empty() })
        }
        fn read_rtf(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().rtf.clone() })
        }
        fn write_rtf(
            &self,
            rtf: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let rtf = rtf.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.rtf = rtf;
                s.change_count += 1;
                true
            })
        }
        fn read_bookmark(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<ClipboardBookmark>> + Send>>
        {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().bookmark.clone() })
        }
        fn write_bookmark(
            &self,
            title: &str,
            url: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let title = title.to_string();
            let url = url.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.bookmark = Some(ClipboardBookmark { title, url });
                s.change_count += 1;
                true
            })
        }
        fn clear(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.text = String::new();
                s.html = String::new();
                s.rtf = String::new();
                s.image = String::new();
                s.bookmark = None;
                s.files = Vec::new();
                s.formats = HashMap::new();
                s.change_count += 1;
                true
            })
        }
        fn read_format(
            &self,
            format: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>> {
            let state = Arc::clone(&self.state);
            let format = format.to_string();
            Box::pin(async move {
                let s = state.lock().unwrap();
                FakeBackend::read_format_sync(&s, &format)
            })
        }
        fn write_format(
            &self,
            format: &str,
            data: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let format = format.to_string();
            let data = data.to_string();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                FakeBackend::write_format_sync(&mut s, &format, &data);
                true
            })
        }
        fn has_format(
            &self,
            format: &str,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let format = format.to_string();
            Box::pin(async move {
                let s = state.lock().unwrap();
                !FakeBackend::read_format_sync(&s, &format).is_empty()
            })
        }
        fn get_formats(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move {
                let s = state.lock().unwrap();
                FakeBackend::get_formats_sync(&s)
            })
        }
        fn write_items(
            &self,
            items: &[ClipboardWriteItem],
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let items = items.to_vec();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                for item in &items {
                    FakeBackend::write_format_sync(&mut s, &item.format, &item.data);
                }
                true
            })
        }
        fn read_items(
            &self,
            formats: &[String],
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = HashMap<String, String>> + Send>>
        {
            let state = Arc::clone(&self.state);
            let formats = formats.to_vec();
            Box::pin(async move {
                let s = state.lock().unwrap();
                let mut result = HashMap::new();
                for format in &formats {
                    let data = FakeBackend::read_format_sync(&s, format);
                    if !data.is_empty() {
                        result.insert(format.clone(), data);
                    }
                }
                result
            })
        }
        fn read_files(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>> {
            let state = Arc::clone(&self.state);
            Box::pin(async move { state.lock().unwrap().files.clone() })
        }
        fn write_files(
            &self,
            paths: &[String],
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            let state = Arc::clone(&self.state);
            let paths = paths.to_vec();
            Box::pin(async move {
                let mut s = state.lock().unwrap();
                s.files = paths;
                s.change_count += 1;
                true
            })
        }
        fn get_change_count(&self) -> i64 {
            self.state.lock().unwrap().change_count
        }
        fn subscribe_clipboard_change(
            &self,
            listener: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            let listener: Arc<dyn Fn() + Send + Sync> = Arc::from(listener);
            self.state
                .lock()
                .unwrap()
                .listeners
                .push(Arc::clone(&listener));
            let state = Arc::clone(&self.state);
            Box::new(move || {
                let mut s = state.lock().unwrap();
                if let Some(idx) = s.listeners.iter().position(|l| Arc::ptr_eq(l, &listener)) {
                    s.listeners.remove(idx);
                }
            })
        }
    }

    fn listener_count(backend: &FakeBackend) -> usize {
        backend.state.lock().unwrap().listeners.len()
    }

    fn notify_listeners(backend: &FakeBackend) {
        let listeners: Vec<Arc<dyn Fn() + Send + Sync>> =
            backend.state.lock().unwrap().listeners.clone();
        for l in listeners {
            l();
        }
    }

    fn install_fake() -> FakeBackend {
        let backend = FakeBackend::new();
        set_clipboard_backend(Some(Arc::new(backend.clone())));
        backend
    }

    // --- attach_clipboard_watch ---

    #[test]
    #[serial]
    fn attach_clipboard_watch_emits_on_change_when_backend_notifies() {
        let backend = install_fake();
        let watch = create_clipboard_watch();
        let count = Arc::new(Mutex::new(0u32));
        let count_clone = Arc::clone(&count);
        let _guard = flighthq_signals::connect_signal(
            &watch.on_change,
            Arc::new(move |_: &()| {
                *count_clone.lock().unwrap() += 1;
            }),
            flighthq_signals::SignalConnectOptions::default(),
        );
        attach_clipboard_watch(&watch);
        assert!(listener_count(&backend) > 0);
        notify_listeners(&backend);
        assert!(*count.lock().unwrap() > 0);
        dispose_clipboard_watch(&watch);
        set_clipboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_clipboard_watch_is_idempotent() {
        let backend = install_fake();
        let watch = create_clipboard_watch();
        attach_clipboard_watch(&watch);
        attach_clipboard_watch(&watch);
        assert_eq!(listener_count(&backend), 1);
        dispose_clipboard_watch(&watch);
        set_clipboard_backend(None);
    }

    // --- create_clipboard_watch ---

    #[test]
    fn create_clipboard_watch_returns_entity_with_on_change_signal() {
        let watch = create_clipboard_watch();
        // Emitting on the inert signal is a no-op and must not panic.
        emit_signal(&watch.on_change, &());
    }

    // --- detach_clipboard_watch ---

    #[test]
    #[serial]
    fn detach_clipboard_watch_stops_delivery() {
        let backend = install_fake();
        let watch = create_clipboard_watch();
        let count = Arc::new(Mutex::new(0u32));
        let count_clone = Arc::clone(&count);
        let _guard = flighthq_signals::connect_signal(
            &watch.on_change,
            Arc::new(move |_: &()| {
                *count_clone.lock().unwrap() += 1;
            }),
            flighthq_signals::SignalConnectOptions::default(),
        );
        attach_clipboard_watch(&watch);
        detach_clipboard_watch(&watch);
        assert_eq!(listener_count(&backend), 0);
        assert_eq!(*count.lock().unwrap(), 0);
        set_clipboard_backend(None);
    }

    #[test]
    fn detach_clipboard_watch_is_safe_when_not_attached() {
        let watch = create_clipboard_watch();
        detach_clipboard_watch(&watch);
    }

    // --- dispose_clipboard_watch ---

    #[test]
    #[serial]
    fn dispose_clipboard_watch_detaches() {
        let backend = install_fake();
        let watch = create_clipboard_watch();
        attach_clipboard_watch(&watch);
        dispose_clipboard_watch(&watch);
        assert_eq!(listener_count(&backend), 0);
        set_clipboard_backend(None);
    }

    // --- get_clipboard_change_count ---

    #[test]
    #[serial]
    fn get_clipboard_change_count_reflects_backend() {
        install_fake();
        let before = get_clipboard_change_count();
        block_on(write_clipboard_text("x"));
        assert_eq!(get_clipboard_change_count(), before + 1);
        set_clipboard_backend(None);
    }

    // --- get_clipboard_formats ---

    #[test]
    #[serial]
    fn get_clipboard_formats_returns_active_formats() {
        install_fake();
        assert_eq!(block_on(get_clipboard_formats()), Vec::<String>::new());
        block_on(write_clipboard_text("hi"));
        let formats = block_on(get_clipboard_formats());
        assert!(formats.contains(&"text/plain".to_string()));
        set_clipboard_backend(None);
    }

    // --- has_clipboard_bookmark ---

    #[test]
    #[serial]
    fn has_clipboard_bookmark_returns_false_when_absent() {
        install_fake();
        assert!(!block_on(has_clipboard_bookmark()));
        set_clipboard_backend(None);
    }

    #[test]
    #[serial]
    fn has_clipboard_bookmark_returns_true_when_present() {
        let backend = FakeBackend::new();
        backend.state.lock().unwrap().formats.insert(
            "text/x-moz-url".to_string(),
            "https://example.com\nFlight".to_string(),
        );
        set_clipboard_backend(Some(Arc::new(backend)));
        assert!(block_on(has_clipboard_bookmark()));
        set_clipboard_backend(None);
    }

    // --- has_clipboard_format ---

    #[test]
    #[serial]
    fn has_clipboard_format_reflects_presence() {
        install_fake();
        assert!(!block_on(has_clipboard_format("text/plain")));
        block_on(write_clipboard_text("x"));
        assert!(block_on(has_clipboard_format("text/plain")));
        set_clipboard_backend(None);
    }

    // --- has_clipboard_html ---

    #[test]
    #[serial]
    fn has_clipboard_html_reflects_backend_state() {
        install_fake();
        assert!(!block_on(has_clipboard_html()));
        block_on(write_clipboard_html("<b>x</b>"));
        assert!(block_on(has_clipboard_html()));
        set_clipboard_backend(None);
    }

    // --- has_clipboard_rtf ---

    #[test]
    #[serial]
    fn has_clipboard_rtf_reflects_backend_state() {
        install_fake();
        assert!(!block_on(has_clipboard_rtf()));
        block_on(write_clipboard_rtf("{\\rtf1 hi}"));
        assert!(block_on(has_clipboard_rtf()));
        set_clipboard_backend(None);
    }

    // --- read_clipboard ---

    #[test]
    #[serial]
    fn read_clipboard_reads_multiple_formats() {
        install_fake();
        block_on(write_clipboard_text("hello"));
        block_on(write_clipboard_html("<b>hello</b>"));
        let result = block_on(read_clipboard(&[
            "text/plain".to_string(),
            "text/html".to_string(),
        ]));
        assert_eq!(result.get("text/plain").map(String::as_str), Some("hello"));
        assert_eq!(
            result.get("text/html").map(String::as_str),
            Some("<b>hello</b>")
        );
        set_clipboard_backend(None);
    }

    #[test]
    #[serial]
    fn read_clipboard_omits_absent_formats() {
        install_fake();
        block_on(write_clipboard_text("hi"));
        let result = block_on(read_clipboard(&[
            "text/plain".to_string(),
            "text/rtf".to_string(),
        ]));
        assert_eq!(result.get("text/plain").map(String::as_str), Some("hi"));
        assert!(!result.contains_key("text/rtf"));
        set_clipboard_backend(None);
    }

    // --- read_clipboard_files ---

    #[test]
    #[serial]
    fn read_clipboard_files_round_trips() {
        install_fake();
        block_on(write_clipboard_files(&[
            "/a/b.txt".to_string(),
            "/c/d.txt".to_string(),
        ]));
        assert_eq!(
            block_on(read_clipboard_files()),
            vec!["/a/b.txt".to_string(), "/c/d.txt".to_string()]
        );
        set_clipboard_backend(None);
    }

    // --- read_clipboard_format ---

    #[test]
    #[serial]
    fn read_clipboard_format_round_trips_arbitrary_format() {
        install_fake();
        block_on(write_clipboard_format("application/x-custom", "mydata"));
        assert_eq!(
            block_on(read_clipboard_format("application/x-custom")),
            "mydata"
        );
        set_clipboard_backend(None);
    }

    // --- set_clipboard_backend ---

    #[test]
    #[serial]
    fn set_clipboard_backend_installs_backend() {
        set_clipboard_backend(Some(Arc::new(FakeBackend::new())));
        let _b = get_clipboard_backend();
        set_clipboard_backend(None);
    }

    // --- write_clipboard ---

    #[test]
    #[serial]
    fn write_clipboard_writes_multiple_formats_atomically() {
        let backend = install_fake();
        assert!(block_on(write_clipboard(&[
            ClipboardWriteItem {
                format: "text/plain".to_string(),
                data: "hello".to_string(),
            },
            ClipboardWriteItem {
                format: "text/html".to_string(),
                data: "<b>hello</b>".to_string(),
            },
        ])));
        let s = backend.state.lock().unwrap();
        assert_eq!(s.text, "hello");
        assert_eq!(s.html, "<b>hello</b>");
        drop(s);
        set_clipboard_backend(None);
    }

    // --- write_clipboard_files ---

    #[test]
    #[serial]
    fn write_clipboard_files_writes_via_backend() {
        let backend = install_fake();
        assert!(block_on(write_clipboard_files(&["/a/b.txt".to_string()])));
        assert_eq!(
            backend.state.lock().unwrap().files,
            vec!["/a/b.txt".to_string()]
        );
        set_clipboard_backend(None);
    }

    // --- write_clipboard_format ---

    #[test]
    #[serial]
    fn write_clipboard_format_writes_via_backend() {
        let backend = install_fake();
        assert!(block_on(write_clipboard_format(
            "application/x-custom",
            "data"
        )));
        assert_eq!(
            backend
                .state
                .lock()
                .unwrap()
                .formats
                .get("application/x-custom")
                .map(String::as_str),
            Some("data")
        );
        set_clipboard_backend(None);
    }
}
