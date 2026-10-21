use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_signals::Signal;

/// The bookmark pasteboard MIME flavor (TS `ClipboardFormatBookmark`).
pub const CLIPBOARD_FORMAT_BOOKMARK: &str = "text/x-moz-url";

/// The HTML MIME flavor (TS `ClipboardFormatHtml`).
pub const CLIPBOARD_FORMAT_HTML: &str = "text/html";

/// The image MIME flavor used at this boundary (TS `ClipboardFormatImage`).
pub const CLIPBOARD_FORMAT_IMAGE: &str = "image/png";

/// The RTF MIME flavor (TS `ClipboardFormatRtf`).
pub const CLIPBOARD_FORMAT_RTF: &str = "text/rtf";

/// The plain-text MIME flavor (TS `ClipboardFormatText`).
pub const CLIPBOARD_FORMAT_TEXT: &str = "text/plain";

/// The URI-list MIME flavor (TS `ClipboardFormatUriList`).
pub const CLIPBOARD_FORMAT_URI_LIST: &str = "text/uri-list";

/// A title/URL pair captured from the clipboard's bookmark format (TS `ClipboardBookmark`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipboardBookmark {
    pub title: String,
    pub url: String,
}

/// One format/data pair for an atomic multi-format write (TS `ClipboardWriteItem`). `format` is a
/// MIME/flavor string and `data` is its string payload (a data URL for image formats).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipboardWriteItem {
    pub format: String,
    pub data: String,
}

/// One release callback of a watch subscription (TS `() => void`).
pub type ClipboardUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// Boxed Send future for a boolean clipboard answer (D15).
pub type ClipboardBoolFuture = Pin<Box<dyn Future<Output = bool> + Send>>;

/// Boxed Send future for an optional bookmark read (D15).
pub type ClipboardBookmarkFuture = Pin<Box<dyn Future<Output = Option<ClipboardBookmark>> + Send>>;

/// Boxed Send future for a multi-format read (D15). Missing formats are omitted by the provider.
pub type ClipboardItemsFuture = Pin<Box<dyn Future<Output = HashMap<String, String>> + Send>>;

/// Boxed Send future for one string payload (D15).
pub type ClipboardStringFuture = Pin<Box<dyn Future<Output = String> + Send>>;

/// Boxed Send future for the clipboard's format list (D15).
pub type ClipboardStringsFuture = Pin<Box<dyn Future<Output = Vec<String>> + Send>>;

/// A clipboard change watch event entity (TS `ClipboardWatch`, an Entity). The signal stays inert
/// until a watch is attached; attach wires the supplied host's change subscription to `on_change`.
#[derive(Default)]
pub struct ClipboardWatch {
    runtime: EntityRuntimeSlot,
    pub on_change: Signal<()>,
}

/// The active subscription owned by a watch's entity runtime slot (D5/D15). Storing it on the
/// entity replaces the source's module-level map with explicit per-watch state.
#[derive(Clone)]
pub(crate) struct ClipboardWatchSubscription {
    pub(crate) unsubscribe: ClipboardUnsubscribe,
}

/// Bookmark transport (TS `HostClipboardBookmarkCapability`). A distinct capability because only
/// native hosts with a bookmark pasteboard format can provide it.
#[derive(Clone)]
pub struct HostClipboardBookmarkCapability {
    pub read_bookmark: Arc<dyn Fn() -> ClipboardBookmarkFuture + Send + Sync>,
    pub write_bookmark: Arc<dyn Fn(String, String) -> ClipboardBoolFuture + Send + Sync>,
}

/// Clipboard change delivery (TS `HostClipboardChangeCapability`). The subscription method is
/// optional so a consumer can require the complete subscribe-and-release obligation as one edge.
#[derive(Clone)]
pub struct HostClipboardChangeCapability {
    pub subscribe:
        Option<Arc<dyn Fn(Arc<dyn Fn() + Send + Sync>) -> ClipboardUnsubscribe + Send + Sync>>,
}

/// Rich and arbitrary flavored transport (TS `HostClipboardFormatsCapability`). HTML and RTF share
/// this slot with generic format operations because provider coverage varies as one unit.
#[derive(Clone)]
pub struct HostClipboardFormatsCapability {
    pub get_formats: Arc<dyn Fn() -> ClipboardStringsFuture + Send + Sync>,
    pub has_format: Arc<dyn Fn(String) -> ClipboardBoolFuture + Send + Sync>,
    pub read_format: Arc<dyn Fn(String) -> ClipboardStringFuture + Send + Sync>,
    pub read_html: Arc<dyn Fn() -> ClipboardStringFuture + Send + Sync>,
    pub read_items: Arc<dyn Fn(Vec<String>) -> ClipboardItemsFuture + Send + Sync>,
    pub read_rtf: Arc<dyn Fn() -> ClipboardStringFuture + Send + Sync>,
    pub write_format: Arc<dyn Fn(String, String) -> ClipboardBoolFuture + Send + Sync>,
    pub write_html: Arc<dyn Fn(String) -> ClipboardBoolFuture + Send + Sync>,
    pub write_items: Arc<dyn Fn(Vec<ClipboardWriteItem>) -> ClipboardBoolFuture + Send + Sync>,
    pub write_rtf: Arc<dyn Fn(String) -> ClipboardBoolFuture + Send + Sync>,
}

/// Image transport (TS `HostClipboardImageCapability`). Images cross this boundary as data URLs.
#[derive(Clone)]
pub struct HostClipboardImageCapability {
    pub has_image: Arc<dyn Fn() -> ClipboardBoolFuture + Send + Sync>,
    pub read_image: Arc<dyn Fn() -> ClipboardStringFuture + Send + Sync>,
    pub write_image: Arc<dyn Fn(String) -> ClipboardBoolFuture + Send + Sync>,
}

/// Plain-text transport and clearing (TS `HostClipboardTextCapability`). Both vary together across
/// every shipped provider.
#[derive(Clone)]
pub struct HostClipboardTextCapability {
    pub clear: Arc<dyn Fn() -> ClipboardBoolFuture + Send + Sync>,
    pub has_text: Arc<dyn Fn() -> ClipboardBoolFuture + Send + Sync>,
    pub read_text: Arc<dyn Fn() -> ClipboardStringFuture + Send + Sync>,
    pub write_text: Arc<dyn Fn(String) -> ClipboardBoolFuture + Send + Sync>,
}

/// The clipboard capability group (TS `HostClipboardCapabilities`). An omitted slot is capability
/// absence, never a provider whose methods return unsupported sentinels.
#[derive(Clone, Default)]
pub struct HostClipboardCapabilities {
    pub bookmark: Option<HostClipboardBookmarkCapability>,
    pub change: Option<HostClipboardChangeCapability>,
    pub formats: Option<HostClipboardFormatsCapability>,
    pub image: Option<HostClipboardImageCapability>,
    pub text: Option<HostClipboardTextCapability>,
}

flight_entity::impl_entity!(ClipboardWatch);
