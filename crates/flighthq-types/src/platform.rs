// ---------------------------------------------------------------------------
// PlatformInfo / PlatformBackend
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlatformName {
    Web,
    Windows,
    Macos,
    Linux,
    Ios,
    Android,
    #[default]
    Unknown,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlatformKind {
    Desktop,
    Mobile,
    Web,
    #[default]
    Unknown,
}

/// The browser rendering engine — `blink` / `gecko` / `webkit` / `unknown`.
/// `unknown` on native hosts where no browser engine is present.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlatformEngine {
    Blink,
    Gecko,
    Webkit,
    #[default]
    Unknown,
}

/// The host shell / runtime environment — `web` / `electron` / `tauri` /
/// `capacitor` / `native` / `unknown`. Distinguishes a plain web page from a
/// host shell.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlatformRuntime {
    Web,
    Electron,
    Tauri,
    Capacitor,
    Native,
    #[default]
    Unknown,
}

/// Host CPU byte order — `little` / `big` / `unknown`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlatformEndianness {
    Little,
    Big,
    #[default]
    Unknown,
}

#[derive(Clone, Debug)]
pub struct PlatformInfo {
    pub name: PlatformName,
    pub kind: PlatformKind,
    pub version: String,
    pub arch: String,
    pub locale: String,
    pub is_touch: bool,
    /// The browser rendering engine. `PlatformEngine::Unknown` on native hosts.
    pub engine: PlatformEngine,
    /// Raw engine/browser version string. `""` when unknown.
    pub engine_version: String,
    /// The host shell / runtime environment. `PlatformRuntime::Unknown` when undetectable.
    pub runtime: PlatformRuntime,
    /// Host CPU byte order. `PlatformEndianness::Unknown` when undetectable.
    pub endianness: PlatformEndianness,
    /// Native pointer width in bits (32 / 64). `-1` when unknown.
    pub pointer_width: i32,
    /// OS build/kernel string (native-only). `""` on web.
    pub os_build: String,
    /// Linux distribution name (native-only). `""` on web.
    pub distro: String,
    /// Linux distribution version (native-only). `""` on web.
    pub distro_version: String,
}

// Manual Default because `pointer_width`'s zeroed sentinel is `-1`, not `0` —
// mirroring the TS `createPlatformInfo` literal (pointerWidth: -1).
impl Default for PlatformInfo {
    fn default() -> Self {
        PlatformInfo {
            name: PlatformName::default(),
            kind: PlatformKind::default(),
            version: String::new(),
            arch: String::new(),
            locale: String::new(),
            is_touch: false,
            engine: PlatformEngine::default(),
            engine_version: String::new(),
            runtime: PlatformRuntime::default(),
            endianness: PlatformEndianness::default(),
            pointer_width: -1,
            os_build: String::new(),
            distro: String::new(),
            distro_version: String::new(),
        }
    }
}

pub trait PlatformBackend: Send + Sync {
    fn get_info<'a>(&self, out: &'a mut PlatformInfo) -> &'a mut PlatformInfo;
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

/// Device form factor — a string kind (not an enum) so native hosts can extend it
/// with vendor values. Standard values: see the `DEVICE_FORM_FACTOR_*` constants.
pub type DeviceFormFactor = String;

pub const DEVICE_FORM_FACTOR_PHONE: &str = "Phone";
pub const DEVICE_FORM_FACTOR_TABLET: &str = "Tablet";
pub const DEVICE_FORM_FACTOR_DESKTOP: &str = "Desktop";
pub const DEVICE_FORM_FACTOR_TV: &str = "TV";
pub const DEVICE_FORM_FACTOR_WATCH: &str = "Watch";
pub const DEVICE_FORM_FACTOR_CAR: &str = "Car";
pub const DEVICE_FORM_FACTOR_UNKNOWN: &str = "Unknown";

/// Static identity snapshot for the running device. All fields resolve to sentinels
/// (`""`, `-1`, `false`, `[]`) when the host cannot provide them. Not a live read; use
/// `refresh_device_info` to invalidate a backend's cached snapshot.
#[derive(Clone, Debug, Default)]
pub struct DeviceInfo {
    /// CPU architecture string, e.g. `'arm64'`, `'x64'`. `""` when unknown.
    pub arch: String,
    /// Available (free) memory, in bytes. `-1` when unknown.
    pub available_memory: i64,
    /// Internal hardware board/platform identifier, e.g. `'msm8998'`. `""` when unknown.
    pub board_name: String,
    /// Wide-color gamut of the device's display. `""` when unknown.
    pub color_gamut: String,
    /// Logical CPU core count. `-1` when unknown.
    pub cpu_cores: i64,
    /// Relative font scale factor from accessibility settings. `-1` when unknown.
    pub font_scale: f64,
    /// Device form factor. `DEVICE_FORM_FACTOR_UNKNOWN` when unknown.
    pub form_factor: DeviceFormFactor,
    /// GPU renderer string. `""` when unknown or blocked by privacy budget.
    pub gpu_renderer: String,
    /// GPU vendor string. `""` when unknown or blocked by privacy budget.
    pub gpu_vendor: String,
    /// Whether this display supports HDR.
    pub is_hdr: bool,
    /// Whether the device is jailbroken (iOS). Always `false` on web.
    pub is_jailbroken: bool,
    /// Whether this is considered a low-end device.
    pub is_low_end_device: bool,
    /// Whether the device is rooted (Android). Always `false` on web.
    pub is_rooted: bool,
    /// Whether the device is running in a virtual machine or emulator.
    pub is_virtual: bool,
    /// OEM manufacturer, e.g. `'Apple'`. `""` when unknown.
    pub manufacturer: String,
    /// Marketing / commercial product name. `""` when unknown.
    pub marketing_name: String,
    /// Human-readable device model name (OEM internal). `""` when unknown.
    pub model: String,
    /// OS build/kernel/API-level string. `""` when unknown.
    pub os_build: String,
    /// OS name, e.g. `'Android'`, `'iOS'`, `'Windows'`. `""` when unknown.
    pub os_name: String,
    /// OS version string. `""` when unknown.
    pub os_version: String,
    /// Raw platform/user-agent string from the host. `""` on native where irrelevant.
    pub platform_string: String,
    /// Human-readable product name used internally by the OEM. `""` when unknown.
    pub product_name: String,
    /// Supported CPU ABI list. `[]` when unknown.
    pub supported_abis: Vec<String>,
    /// Total physical memory, in bytes. `-1` when unknown.
    pub total_memory: i64,
    /// System WebView version string. `""` when unknown.
    pub web_view_version: String,
}

/// Static capability flags for hardware input on the running device.
#[derive(Clone, Debug, Default)]
pub struct DeviceCapabilities {
    /// Whether the device has a hardware keyboard. `false` when unknown.
    pub has_keyboard: bool,
    /// Whether a hardware mouse/trackpad pointer device is available.
    pub has_mouse: bool,
    /// Whether the device supports stylus/pen input. `false` when unknown.
    pub has_stylus: bool,
}

/// Static display metrics for the device's built-in screen. Device-class data, not
/// live multi-display enumeration. All numeric fields are `-1` when unknown.
#[derive(Clone, Debug)]
pub struct DeviceDisplayMetrics {
    /// Color bit depth per channel. `-1` when unknown.
    pub color_depth: i64,
    /// Pixels per inch (DPI). `-1` when unknown.
    pub density_dpi: i64,
    /// Logical screen height in CSS pixels. `-1` when unknown.
    pub logical_height: i64,
    /// Logical screen width in CSS pixels. `-1` when unknown.
    pub logical_width: i64,
    /// Physical screen height in physical pixels. `-1` when unknown.
    pub physical_height: i64,
    /// Physical screen width in physical pixels. `-1` when unknown.
    pub physical_width: i64,
    /// Device pixel ratio (logical px → physical px). `-1` when unknown.
    pub pixel_ratio: f64,
}

#[derive(Clone, Debug, Default)]
pub struct SafeAreaInsets {
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
    pub top: f32,
}

pub trait DeviceBackend: Send + Sync {
    fn get_capabilities<'a>(&self, out: &'a mut DeviceCapabilities) -> &'a mut DeviceCapabilities;
    fn get_display_metrics<'a>(
        &self,
        out: &'a mut DeviceDisplayMetrics,
    ) -> &'a mut DeviceDisplayMetrics;
    fn get_id(&self) -> String;
    fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo;
    fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets;
    /// Invalidates any cached snapshot. Default: no-op (stateless backends).
    fn refresh(&self) {}
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ClipboardBookmark {
    pub title: String,
    pub url: String,
}

// A single (format, data) pair for an atomic multi-format clipboard write. Mirrors the TS
// `ClipboardWriteItem`; `data` is a string payload (e.g. text, HTML markup, or a data URL).
#[derive(Clone, Debug)]
pub struct ClipboardWriteItem {
    pub format: String,
    pub data: String,
}

// Clipboard change-watch event entity. Holds an inert `on_change` signal; call
// attach_clipboard_watch to begin delivery. Mirrors the TS `ClipboardWatch`.
#[derive(Debug, Default)]
pub struct ClipboardWatch {
    pub on_change: flighthq_signals::Signal<()>,
}

pub trait ClipboardBackend: Send + Sync {
    fn read_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>;
    fn write_text(
        &self,
        text: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn read_html(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>;
    fn write_html(
        &self,
        html: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn has_text(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn read_image(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>;
    fn write_image(
        &self,
        data_url: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn has_image(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn read_rtf(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>;
    fn write_rtf(
        &self,
        rtf: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn read_bookmark(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<ClipboardBookmark>> + Send>>;
    fn write_bookmark(
        &self,
        title: &str,
        url: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn clear(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // Reads an arbitrary MIME/format flavor as a string; `""` when absent or access is denied.
    fn read_format(
        &self,
        format: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>;
    // Writes an arbitrary MIME/format flavor. `false` when the host denies access.
    fn write_format(
        &self,
        format: &str,
        data: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // True when the given MIME/format string is currently present on the clipboard.
    fn has_format(
        &self,
        format: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // Returns the MIME/format strings currently on the clipboard. `[]` on access denied.
    fn get_formats(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>>;
    // Writes multiple formats atomically. `false` when the host denies access.
    fn write_items(
        &self,
        items: &[ClipboardWriteItem],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // Reads multiple formats in one round-trip; missing formats are omitted from the result.
    fn read_items(
        &self,
        formats: &[String],
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = std::collections::HashMap<String, String>> + Send>,
    >;
    // Reads the file paths currently on the clipboard. `[]` when none are present or on web.
    fn read_files(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>>;
    // Writes file paths to the clipboard. `false` when the host denies access or on web.
    fn write_files(
        &self,
        paths: &[String],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // A monotonically increasing change count, or `-1` when unsupported (web).
    fn get_change_count(&self) -> i64;
    // Subscribes to clipboard-change notifications; returns an unsubscribe fn.
    fn subscribe_clipboard_change(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

// File-extension group for open/save dialogs, e.g. { name: "Images", extensions: ["png", "jpg"] }.
#[derive(Clone, Debug, Default)]
pub struct FileDialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
    /// Optional MIME types accepted by this filter group (used by the File System Access API path).
    pub mime_types: Vec<String>,
}

/// Whether a picked dialog handle refers to a file or a directory.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum FileDialogHandleKind {
    #[default]
    File,
    Directory,
}

/// A picked file or directory. On web, `path` is `None` because the browser cannot expose real
/// host paths; native hosts populate it. The live web `FileSystem*Handle` (when produced by the
/// File System Access API) is stashed in `@flighthq/dialog`'s registry, keyed by this handle.
#[derive(Clone, Debug, Default)]
pub struct FileDialogHandle {
    pub kind: FileDialogHandleKind,
    pub name: String,
    pub path: Option<String>,
}

/// Suggested starting location for a file/directory picker. Maps onto the File System Access API
/// `startIn` token where supported; native hosts honor the full set. Unsupported web values are
/// silently dropped by the web backend.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum FileDialogStartIn {
    #[default]
    Desktop,
    Documents,
    Downloads,
    Music,
    Pictures,
    Videos,
    Home,
    Temp,
    AppData,
    Cache,
}

#[derive(Clone, Debug, Default)]
pub struct OpenFileDialogOptions {
    pub title: Option<String>,
    pub multiple: bool,
    pub directory: bool,
    pub filters: Vec<FileDialogFilter>,
    pub default_path: Option<String>,
    pub start_in: Option<FileDialogStartIn>,
}

#[derive(Clone, Debug, Default)]
pub struct OpenDirectoryDialogOptions {
    pub title: Option<String>,
    pub multiple: bool,
    pub start_in: Option<FileDialogStartIn>,
}

#[derive(Clone, Debug, Default)]
pub struct SaveFileDialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    /// Suggested file name; takes precedence over a name derived from `default_path`.
    pub default_name: Option<String>,
    pub filters: Vec<FileDialogFilter>,
    pub start_in: Option<FileDialogStartIn>,
}

#[derive(Clone, Debug, Default)]
pub struct PromptDialogOptions {
    pub title: Option<String>,
    pub message: String,
    pub default_value: Option<String>,
    pub placeholder: Option<String>,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum MessageDialogKind {
    #[default]
    Info,
    Warning,
    Error,
    Question,
}

#[derive(Clone, Debug, Default)]
pub struct MessageDialogOptions {
    pub title: Option<String>,
    pub message: String,
    pub detail: Option<String>,
    pub buttons: Vec<String>,
    pub kind: MessageDialogKind,
    pub checkbox_label: Option<String>,
    pub checkbox_checked: bool,
    pub default_id: Option<u32>,
    pub cancel_id: Option<u32>,
}

/// Outcome of a message dialog: which button the user pressed, whether the dialog was cancelled
/// (Escape / cancel button / dismissal), and the final checkbox state.
#[derive(Clone, Debug, Default)]
pub struct MessageDialogResult {
    pub button_index: u32,
    pub cancelled: bool,
    pub checkbox_checked: bool,
}

pub trait DialogBackend: Send + Sync {
    fn open_file(
        &self,
        options: &OpenFileDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<FileDialogHandle>> + Send>>;
    fn open_directory(
        &self,
        options: &OpenDirectoryDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<FileDialogHandle>> + Send>>;
    fn save_file(
        &self,
        options: &SaveFileDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<FileDialogHandle>> + Send>>;
    fn message(
        &self,
        options: &MessageDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = MessageDialogResult> + Send>>;
    fn confirm(
        &self,
        options: &MessageDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn prompt(
        &self,
        options: &PromptDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>>;
}

// ---------------------------------------------------------------------------
// FileSystem
// ---------------------------------------------------------------------------

/// Well-known host directory variants for the file system `get_path` seam.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FileSystemPathKind {
    /// The user's home directory.
    Home,
    /// The user's Documents folder.
    Documents,
    /// The user's Desktop folder.
    Desktop,
    /// The user's Downloads folder.
    Downloads,
    /// The OS temporary directory.
    Temp,
    /// The application's data/settings directory.
    AppData,
    /// The application's cache directory.
    Cache,
}

/// A single entry returned by a file system directory listing.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FileEntry {
    /// The entry's file name (no directory prefix).
    pub name: String,
    /// The full path to the entry.
    pub path: String,
    /// `true` when the entry is a directory rather than a regular file.
    pub is_directory: bool,
}

/// The kind of a file system change event.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FileWatchEventType {
    /// A new file or directory was created at the watched path.
    Created,
    /// An existing file or directory was modified.
    Modified,
    /// A file or directory was deleted.
    Deleted,
}

/// A change event delivered by a file system watch subscription.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileWatchEvent {
    /// The kind of change that occurred.
    pub kind: FileWatchEventType,
    /// The path that changed.
    pub path: String,
}

/// Metadata for a path returned by the file system `stat_file` seam.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FileStat {
    /// File size in bytes (0 for directories).
    pub size: u64,
    /// `true` when the path is a directory.
    pub is_directory: bool,
    /// Last-modified timestamp in milliseconds since Unix epoch.
    pub modified_time: u64,
    /// Creation timestamp in milliseconds since Unix epoch (0 when unavailable).
    pub created_time: u64,
    /// `true` when the path is a symbolic link.
    pub is_symlink: bool,
}

/// File system seam. Free functions delegate to the active backend.
///
/// Reads resolve to `None`/`[]`, writes to `false`, when the host lacks access
/// or the entry is missing — absent files are an expected outcome, not an error.
pub trait FileSystemBackend: Send + Sync {
    /// Reads a file as a UTF-8 string, or `None` when missing or access is denied.
    fn read_text_file(&self, path: &str) -> Option<String>;
    /// Writes text to a file, creating parent directories. Returns `false` when denied.
    fn write_text_file(&self, path: &str, data: &str) -> bool;
    /// Reads a file as raw bytes, or `None` when missing or access is denied.
    fn read_binary_file(&self, path: &str) -> Option<Vec<u8>>;
    /// Writes bytes to a file, creating parent directories. Returns `false` when denied.
    fn write_binary_file(&self, path: &str, data: &[u8]) -> bool;
    /// Returns `true` when a file or directory exists at `path`.
    fn file_exists(&self, path: &str) -> bool;
    /// Removes a file or directory at `path`. Returns `false` when missing or denied.
    fn remove_file(&self, path: &str) -> bool;
    /// Creates a directory (and parents) at `path`. Returns `false` when denied.
    fn make_directory(&self, path: &str) -> bool;
    /// Lists directory entries. Returns `[]` when missing or access is denied.
    fn read_directory(&self, path: &str) -> Vec<FileEntry>;
    /// Reads metadata for `path`, or `None` when missing or access is denied.
    fn stat_file(&self, path: &str) -> Option<FileStat>;
    /// Renames or moves from `from` to `to`. Returns `false` when source is missing or denied.
    fn rename(&self, from: &str, to: &str) -> bool;
    /// Copies a file from `from` to `to`. Returns `false` when source is missing or denied.
    fn copy(&self, from: &str, to: &str) -> bool;
    /// Appends text to a file, creating it when missing. Returns `false` when denied.
    fn append_text_file(&self, path: &str, data: &str) -> bool;
    /// Watches `path` for create/modify/delete changes. Returns an unsubscribe closure.
    fn watch(
        &self,
        path: &str,
        listener: Box<dyn Fn(&FileWatchEvent) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    /// Resolves a well-known host directory to an absolute path, or `""` when unavailable.
    fn get_path(&self, kind: FileSystemPathKind) -> String;

    // --- Incremental extensions (default sentinels; native/web backends override). ---

    /// Reads a byte slice of a file at `offset` with `length` bytes. Returns an empty
    /// `Vec` for out-of-range access, `None` for missing or access denied.
    fn read_binary_file_range(&self, _path: &str, _offset: u64, _length: u64) -> Option<Vec<u8>> {
        None
    }
    /// `true` when a directory exists at `path`. Returns `false` when missing or denied.
    fn directory_exists(&self, _path: &str) -> bool {
        false
    }
    /// Removes a directory at `path`. When `recursive` is `false`, fails on non-empty
    /// directories. Returns `false` when missing or access is denied.
    fn remove_directory(&self, _path: &str, _recursive: bool) -> bool {
        false
    }
    /// Depth-first walk returning all descendants with full relative paths. `[]` for
    /// missing or access denied.
    fn read_directory_recursive(
        &self,
        _path: &str,
        _options: &crate::FileWalkOptions,
    ) -> Vec<FileEntry> {
        Vec::new()
    }
    /// Creates a symbolic link at `link_path` pointing to `target`. Returns `false`
    /// when unsupported (web/OPFS always returns `false`).
    fn create_file_symlink(&self, _target: &str, _link_path: &str) -> bool {
        false
    }
    /// Reads the target of a symbolic link at `path`. Returns `None` when not a symlink,
    /// missing, or symlinks are unsupported (web/OPFS always returns `None`).
    fn read_file_symlink(&self, _path: &str) -> Option<String> {
        None
    }
    /// Resolves a path to its canonical (symlink-free) absolute path, or `None` when the
    /// path is missing, denied, or symlinks are unsupported (web always returns `None`).
    fn get_file_real_path(&self, _path: &str) -> Option<String> {
        None
    }
    /// Returns permission attributes for `path`, or `None` when permissions are
    /// unavailable (web/OPFS always returns `None`).
    fn get_file_permissions(&self, _path: &str) -> Option<crate::FilePermissions> {
        None
    }
    /// Sets file permissions for `path`. Returns `false` when unsupported (web/OPFS
    /// always returns `false`).
    fn set_file_permissions(&self, _path: &str, _permissions: &crate::FilePermissions) -> bool {
        false
    }
    /// `true` when the file/directory at `path` can be accessed in the given mode.
    /// Web returns `false` for `Executable`.
    fn can_access_file(&self, _path: &str, _mode: FileAccessMode) -> bool {
        false
    }
    /// Returns disk or quota usage for the active file system, or `None` when unavailable.
    fn get_file_system_usage(&self) -> Option<crate::FileSystemUsage> {
        None
    }
    /// Atomic write: writes data to a temp sibling and moves it into place. On web
    /// (OPFS) the rename is copy+remove (not OS-atomic) — best-effort. Returns `false`
    /// when the write or rename fails.
    fn write_file_atomic(&self, _path: &str, _data: &[u8]) -> bool {
        false
    }
}

/// Access mode probed by [`FileSystemBackend::can_access_file`].
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum FileAccessMode {
    /// Read access.
    Readable,
    /// Write access.
    Writable,
    /// Execute access. Web always reports `false`.
    Executable,
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct NotificationAction {
    pub id: String,
    pub title: String,
    /// Optional icon URL shown on the action button (native/SW backends only).
    pub icon: Option<String>,
}

#[derive(Clone, Default)]
pub struct NotificationRequest {
    pub title: String,
    /// Stable caller-supplied id. `None` lets the backend generate one and return it.
    pub id: Option<String>,
    pub body: Option<String>,
    pub icon: Option<String>,
    /// Small monochrome badge shown in some platforms' status bars.
    pub badge: Option<String>,
    pub tag: Option<String>,
    pub silent: bool,
    pub actions: Vec<NotificationAction>,
    /// Text direction for the notification body (`auto` / `ltr` / `rtl`).
    pub dir: Option<String>,
    /// Large image displayed in the notification body.
    pub image: Option<String>,
    /// BCP 47 language tag for the notification text.
    pub lang: Option<String>,
    /// When `true`, re-showing a notification with the same tag re-alerts the user.
    pub renotify: bool,
    /// When `true`, the notification stays visible until the user interacts with it.
    pub require_interaction: bool,
    /// Delivery/creation timestamp in epoch milliseconds.
    pub timestamp: Option<f64>,
    /// Vibration pattern in milliseconds (on/off durations).
    pub vibrate: Vec<f64>,
    /// Opaque caller payload echoed back through the notification lifecycle. Mirrors
    /// the TS `data?: unknown`.
    pub data: Option<std::sync::Arc<dyn std::any::Any + Send + Sync>>,
}

impl std::fmt::Debug for NotificationRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NotificationRequest")
            .field("title", &self.title)
            .field("id", &self.id)
            .field("body", &self.body)
            .field("icon", &self.icon)
            .field("badge", &self.badge)
            .field("tag", &self.tag)
            .field("silent", &self.silent)
            .field("actions", &self.actions)
            .field("dir", &self.dir)
            .field("image", &self.image)
            .field("lang", &self.lang)
            .field("renotify", &self.renotify)
            .field("require_interaction", &self.require_interaction)
            .field("timestamp", &self.timestamp)
            .field("vibrate", &self.vibrate)
            .field("data", &self.data.as_ref().map(|_| "<opaque>"))
            .finish()
    }
}

/// A notification channel/category. Load-bearing on Android-class native hosts
/// (channels control importance, sound, and grouping); a no-op concept on the web.
#[derive(Clone, Debug, Default)]
pub struct NotificationChannel {
    pub id: String,
    pub name: String,
}

/// Tri-state notification permission, mirroring the web Notification API.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum NotificationPermission {
    /// Not yet asked.
    #[default]
    Default,
    Granted,
    Denied,
}

/// Plain-data record of what a notification backend supports. Lets callers
/// feature-detect without probing behavior. Mirrors the TS `NotificationCapabilities`.
#[derive(Clone, Debug, Default)]
pub struct NotificationCapabilities {
    /// Action buttons (requires the SW backend on web, or a native host).
    pub actions: bool,
    /// Notification channels/categories.
    pub channels: bool,
    /// Cold-start launch-from-notification reporting.
    pub cold_start: bool,
    /// Large body image.
    pub image: bool,
    /// Listing currently-active notifications.
    pub list_active: bool,
    /// Local scheduling for future delivery.
    pub scheduling: bool,
    /// Inline text-reply actions.
    pub text_reply: bool,
}

/// A delivery schedule for a local notification: an absolute fire time plus an
/// optional repeat cadence. Mirrors the TS `NotificationSchedule`.
#[derive(Clone, Debug, Default)]
pub struct NotificationSchedule {
    /// Absolute fire time in epoch milliseconds.
    pub at: f64,
    /// Repeat cadence; `None` for a one-shot schedule (`minute`/`hour`/`day`/
    /// `week`/`month`/`year`).
    pub repeat: Option<String>,
}

/// A locally-scheduled (not yet delivered) notification: the generated id, the
/// original request, and the schedule it fires on. Mirrors the TS `ScheduledNotification`.
#[derive(Clone, Debug)]
pub struct ScheduledNotification {
    pub id: String,
    pub request: NotificationRequest,
    pub schedule: NotificationSchedule,
}

// NOTE (deferred — see status/types.md): the TS `NotificationBackend` grew to a
// 16-method seam (id-returning `notify`, tri-state `request_permission`,
// `get_capabilities`, scheduling, active/pending listing, dismiss/reply/show
// subscriptions). Expanding this trait cascades into `flighthq-notification`'s
// backend implementations (a separate conformance owner). The new plain-data types
// above (`NotificationChannel` / `NotificationPermission` / `NotificationCapabilities`
// / `NotificationSchedule` / `ScheduledNotification`) and the new
// `NotificationRequest` fields are ported now; the trait-method expansion is parked
// so the workspace stays green. The trait below keeps its prior shape.
pub trait NotificationBackend: Send + Sync {
    fn notify(
        &self,
        request: &NotificationRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    /// Updates an already-displayed notification by id, merging the partial `update` into it.
    /// Resolves to `true` if the notification was updated, `false` otherwise.
    fn update_notification(
        &self,
        id: &str,
        update: &NotificationRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn request_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn is_supported(&self) -> bool;
    fn subscribe_click(
        &self,
        listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_action(
        &self,
        listener: Box<dyn Fn(String, String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// The Shortcut seam types (ShortcutBackend, ShortcutModifier, ParsedAccelerator,
// AcceleratorParseError, ShortcutEvent, ShortcutSignals) live in `shortcut.rs`.

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum MenuItemType {
    #[default]
    Normal,
    Separator,
    Submenu,
    Checkbox,
    Radio,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum MenuItemRole {
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Quit,
    Minimize,
    Close,
    Reload,
    ToggleFullscreen,
    About,
}

#[derive(Clone, Debug, Default)]
pub struct MenuItemTemplate {
    pub id: Option<String>,
    pub label: Option<String>,
    pub item_type: MenuItemType,
    pub role: Option<MenuItemRole>,
    pub accelerator: Option<String>,
    pub enabled: bool,
    pub checked: bool,
    pub submenu: Vec<MenuItemTemplate>,
}

pub trait MenuBackend: Send + Sync {
    fn set_application_menu(&self, items: &[MenuItemTemplate]) -> bool;
    fn popup_context_menu(
        &self,
        items: &[MenuItemTemplate],
        x: f32,
        y: f32,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>>;
    fn subscribe_select(
        &self,
        listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// App / AppBackend
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct App {
    pub on_activate: flighthq_signals::Signal<()>,
    pub on_all_windows_closed: flighthq_signals::Signal<()>,
    pub on_open_file: flighthq_signals::Signal<String>,
    pub on_quit_request: flighthq_signals::Signal<()>,
    pub on_ready: flighthq_signals::Signal<()>,
    pub on_second_instance: flighthq_signals::Signal<Vec<String>>,
}

pub trait AppBackend: Send + Sync {
    fn get_name(&self) -> String;
    fn get_version(&self) -> String;
    fn get_locale(&self) -> String;
    fn quit(&self);
    fn relaunch(&self);
    fn focus(&self);
    fn request_single_instance_lock(&self) -> bool;
    fn release_single_instance_lock(&self);
    fn has_single_instance_lock(&self) -> bool;
    fn set_dock_badge(&self, text: &str);
    fn set_badge_count(&self, count: u32) -> bool;
    fn set_dock_menu(&self, items: &[MenuItemTemplate]);
    fn bounce_dock(&self) -> i32;
    fn cancel_dock_bounce(&self, id: i32);
    // Adds a path to the system's recent-documents list (Jump List / macOS recents).
    fn add_recent_document(&self, path: &str);
    // Clears the system's recent-documents list.
    fn clear_recent_documents(&self);
    // Draws attention at the OS level (taskbar flash / dock bounce); returns a request id, or -1.
    fn request_attention(&self, critical: bool) -> i32;
    // Cancels an attention request previously started by `request_attention`.
    fn cancel_attention(&self, id: i32);
    // The app-identity-relative directory path for the given kind; "" when unavailable.
    fn get_app_directory_path(&self, kind: crate::app::AppPathKind) -> String;
    // The application bundle/exe directory path, or "".
    fn get_app_path(&self) -> String;
    // The application executable path, or "".
    fn get_executable_path(&self) -> String;
    // The process command line, or [].
    fn get_command_line(&self) -> Vec<String>;
    // The ranked preferred system languages, in preference order; [] when unavailable.
    fn get_preferred_system_languages(&self) -> Vec<String>;
    // The OS-level system locale (for example "en_US"); "" when unavailable.
    fn get_system_locale(&self) -> String;
    // The login-item (launch-at-startup) settings; default with open_at_login false on web.
    fn get_login_item(&self) -> crate::app::AppLoginItem;
    // Updates login-item settings; returns false when unsupported.
    fn set_login_item(&self, settings: &crate::app::AppLoginItemLike) -> bool;
    // Sets the application name; returns false when unsupported.
    fn set_name(&self, name: &str) -> bool;
    // Sets the Windows AppUserModelID; returns false when unsupported.
    fn set_user_model_id(&self, id: &str) -> bool;
    // Sets the macOS activation policy; no-op on non-macOS and web.
    fn set_activation_policy(&self, policy: crate::app::AppActivationPolicy);
    // Hides the application (macOS); returns true when supported.
    fn hide_app(&self) -> bool;
    // Shows the application after hide (macOS); returns true when supported.
    fn show_app(&self) -> bool;
    // True when the application is hidden (macOS); false on web.
    fn is_app_hidden(&self) -> bool;
    fn subscribe_activate(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_all_windows_closed(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_open_file(
        &self,
        listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    // The listener receives a host cancel callback; invoking it vetoes the quit at the host level.
    #[allow(clippy::type_complexity)]
    fn subscribe_quit_request(
        &self,
        listener: Box<dyn Fn(Box<dyn Fn() + Send + Sync>) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_ready(&self, listener: Box<dyn Fn() + Send + Sync>)
    -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_second_instance(
        &self,
        listener: Box<dyn Fn(Vec<String>) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct ProtocolHandler {
    pub on_open_url: flighthq_signals::Signal<String>,
}

/// A deep-link URL parsed into its components. `query` is a flat map of
/// percent-decoded key/value pairs (last value wins for duplicate keys).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ParsedProtocolUrl {
    pub scheme: String,
    pub host: String,
    pub path: String,
    pub query: std::collections::BTreeMap<String, String>,
}

pub trait ProtocolBackend: Send + Sync {
    fn register(&self, scheme: &str) -> bool;
    fn unregister(&self, scheme: &str) -> bool;
    fn is_registered(&self, scheme: &str) -> bool;
    /// Returns every custom URI scheme currently registered by this app, or an
    /// empty vector when the host cannot enumerate them.
    fn get_registered_schemes(&self) -> Vec<String>;
    fn set_as_default(&self, scheme: &str) -> bool;
    /// True when `scheme` is the OS default handler for deep links; `false`
    /// where the host cannot report it.
    fn is_default(&self, scheme: &str) -> bool;
    /// Removes this app as the OS default handler for `scheme`. Returns `false`
    /// when the host denies or does not support it.
    fn remove_as_default(&self, scheme: &str) -> bool;
    /// Returns the URL the app was launched with via a deep link (cold start),
    /// or `None` when the app was not launched via a link.
    fn get_launch_url(&self) -> Option<String>;
    /// Drains URLs that arrived before the first attach (buffered between
    /// process start and the first subscription); returns them in arrival order.
    fn drain_pending_urls(&self) -> Vec<String>;
    fn subscribe(&self, listener: Box<dyn Fn(String) + Send + Sync>)
    -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Ipc
// ---------------------------------------------------------------------------

/// An opaque, type-erased value carried across the IPC seam. The host channel
/// moves these between processes without inspecting them; each side downcasts.
pub type IpcValue = Box<dyn std::any::Any + Send + Sync>;

/// The pending reply of an [`IpcBackend::invoke`] round-trip — `None` when the
/// channel produced no value.
pub type IpcInvokeFuture =
    std::pin::Pin<Box<dyn std::future::Future<Output = Option<IpcValue>> + Send>>;

/// Receives the argument list pushed on an [`IpcBackend::subscribe`] channel.
pub type IpcMessageListener = Box<dyn Fn(Vec<IpcValue>) + Send + Sync>;

/// Responds to an `invoke` on a handled channel, returning the reply value (or
/// `None` for no value). Used by [`IpcBackend::handle`].
pub type IpcInvokeHandler = Box<dyn Fn(&[IpcValue]) -> Option<IpcValue> + Send + Sync>;

pub trait IpcBackend: Send + Sync {
    fn send(&self, channel: &str, args: &[IpcValue]);
    fn invoke(&self, channel: &str, args: &[IpcValue]) -> IpcInvokeFuture;
    fn subscribe(&self, channel: &str, listener: IpcMessageListener)
    -> Box<dyn Fn() + Send + Sync>;

    /// Registers a responder for `invoke` calls on `channel`. Returns `None`
    /// when the backend does not support handling (mirrors TS's optional
    /// `handle` method); the caller then yields an inert unsubscribe.
    fn handle(
        &self,
        _channel: &str,
        _handler: IpcInvokeHandler,
    ) -> Option<Box<dyn Fn() + Send + Sync>> {
        None
    }

    /// Sends a fire-and-forget message to a specific target window/process.
    /// No-ops by default (mirrors TS's optional `sendTo`).
    fn send_to(&self, _target: &crate::IpcTarget, _channel: &str, _args: &[IpcValue]) {}

    /// Reports what this backend can do. The default reports every capability
    /// as `false` — the "no main process" web/native default.
    fn get_capabilities(&self) -> crate::IpcBackendCapabilities {
        crate::IpcBackendCapabilities::default()
    }
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct PowerStatus {
    /// Battery charge in the 0..1 range, or `-1` when not reported.
    pub battery_level: f32,
    /// Seconds until full charge, or `-1` when unknown / not charging.
    pub charging_time: f32,
    /// Seconds until empty, or `-1` when unknown / charging.
    pub discharging_time: f32,
    /// True when the battery charge is low.
    pub is_battery_low: bool,
    pub is_charging: bool,
    /// True when the OS low-power / battery-saver mode is active.
    pub is_low_power: bool,
    /// True when the device is on battery (has a battery and is not on AC).
    pub is_on_battery: bool,
    /// Coarse thermal pressure; `Unknown` when not reported.
    pub thermal_state: crate::power::PowerThermalState,
}

pub trait PowerBackend: Send + Sync {
    fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus;
    /// Writes battery health into `out` and returns it, or returns `None` when
    /// the backend does not report health.
    fn get_battery_health<'a>(
        &self,
        out: &'a mut crate::power::PowerBatteryHealth,
    ) -> Option<&'a mut crate::power::PowerBatteryHealth>;
    /// Returns the current idle state at the given threshold in seconds.
    fn get_system_idle_state(&self, threshold_seconds: f32) -> crate::power::PowerIdleState;
    /// Returns elapsed seconds since the last user input, or `-1` when unsupported.
    fn get_system_idle_time(&self) -> f32;
    /// Returns true when a keep-awake lock is currently held.
    fn is_keep_awake_active(&self) -> bool;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
    /// Subscribes to screen-lock events; returns an unsubscribe fn.
    fn subscribe_lock_screen(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    /// Subscribes to OS low-power-mode changes; returns an unsubscribe fn.
    fn subscribe_low_power_mode_change(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_suspend(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_resume(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    /// Subscribes to thermal-state changes; returns an unsubscribe fn.
    fn subscribe_thermal_state_change(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    /// Subscribes to screen-unlock events; returns an unsubscribe fn.
    fn subscribe_unlock_screen(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    /// Requests or releases a keep-awake lock for `mode`; returns whether honored.
    fn set_keep_awake(&self, enabled: bool, mode: crate::power::PowerKeepAwakeMode) -> bool;
}

#[derive(Debug, Default)]
pub struct Power {
    pub on_change: flighthq_signals::Signal<PowerStatus>,
    pub on_charging: flighthq_signals::Signal<()>,
    pub on_discharging: flighthq_signals::Signal<()>,
    pub on_idle_state_change: flighthq_signals::Signal<()>,
    pub on_lock_screen: flighthq_signals::Signal<()>,
    pub on_low_power_mode_change: flighthq_signals::Signal<()>,
    pub on_resume: flighthq_signals::Signal<()>,
    pub on_suspend: flighthq_signals::Signal<()>,
    pub on_thermal_state_change: flighthq_signals::Signal<()>,
    pub on_unlock_screen: flighthq_signals::Signal<()>,
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum AppLifecycleState {
    #[default]
    Active,
    Inactive,
    Background,
}

pub trait LifecycleBackend: Send + Sync {
    fn get_state(&self) -> AppLifecycleState;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;

    /// Returns the kind of launch (`Cold`/`Warm`). Optional: backends that do
    /// not implement it return `None`, and `get_app_launch_kind` falls back to
    /// `Warm`. (TS models this as an optional `getLaunchKind?` method.)
    fn get_launch_kind(&self) -> Option<crate::AppLaunchKind> {
        None
    }

    /// Subscribes to host memory-pressure warnings, returning an unsubscribe
    /// function, or `None` when the backend does not report memory pressure.
    /// (TS models this as an optional `subscribeMemoryWarning?` method.)
    fn subscribe_memory_warning(
        &self,
        _listener: Box<dyn Fn(crate::AppMemoryPressure) + Send + Sync>,
    ) -> Option<Box<dyn Fn() + Send + Sync>> {
        None
    }
}

#[derive(Debug, Default)]
pub struct AppLifecycle {
    pub on_back_button: flighthq_signals::Signal<crate::AppBackRequest>,
    pub on_memory_warning: flighthq_signals::Signal<crate::AppMemoryPressure>,
    pub on_pause: flighthq_signals::Signal<()>,
    pub on_restore_state: flighthq_signals::Signal<crate::AppStateBag>,
    pub on_resume: flighthq_signals::Signal<()>,
    pub on_save_state: flighthq_signals::Signal<crate::AppStateBag>,
    pub on_state_change: flighthq_signals::Signal<AppLifecycleState>,
}

// SoftKeyboard types live in the `soft_keyboard` module (one concept per file).

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

/// Reported confidence of a sensor reading. `Unknown` when the host does not
/// supply an accuracy level. Mirrors the TS `SensorAccuracy`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SensorAccuracy {
    High,
    Low,
    Medium,
    #[default]
    Unknown,
}

/// Permission state for a gated sensor (iOS motion/orientation gating).
/// `Unsupported` when the device has no such sensor. Mirrors `SensorsPermissionState`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SensorsPermissionState {
    Denied,
    Granted,
    #[default]
    Prompt,
    Unsupported,
}

/// Options for a sensor subscription. `frequency` is the requested delivery rate
/// in hertz where the host honors it; `None` falls back to the host default.
#[derive(Copy, Clone, Debug, Default)]
pub struct SensorSubscribeOptions {
    pub frequency: Option<f32>,
}

/// Fields shared by every sensor reading: confidence, the sampling interval in
/// milliseconds (-1 when unknown), and a host timestamp in milliseconds (-1 when
/// unknown). Mirrors the TS `SensorReading` base interface, flattened into each
/// concrete reading below (Rust has no interface inheritance).
#[derive(Copy, Clone, Debug, Default)]
pub struct SensorReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
}

/// Ambient illuminance in lux.
#[derive(Copy, Clone, Debug, Default)]
pub struct AmbientLightReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub illuminance: f32,
}

/// A three-axis vector reading in m/s² (accelerometer, linear acceleration,
/// gravity) or microtesla (magnetometer).
#[derive(Copy, Clone, Debug, Default)]
pub struct MotionReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Device orientation as Euler angles (alpha/beta/gamma in degrees).
#[derive(Copy, Clone, Debug, Default)]
pub struct OrientationReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
    /// True when the reading is relative to Earth's frame (absolute orientation).
    pub absolute: bool,
    /// Compass heading in degrees, or -1 when the host cannot supply one.
    pub heading: f32,
}

/// Barometric pressure in hectopascals, with a derived altitude in meters (-1
/// when underivable).
#[derive(Copy, Clone, Debug, Default)]
pub struct PressureReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub altitude: f32,
    pub pressure: f32,
}

/// Proximity reading. `near` is the boolean near/far state; `distance` and `max`
/// are in centimeters and -1 when only near/far is known.
#[derive(Copy, Clone, Debug, Default)]
pub struct ProximityReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub distance: f32,
    pub max: f32,
    pub near: bool,
}

/// Orientation as a unit quaternion (w/x/y/z).
#[derive(Copy, Clone, Debug, Default)]
pub struct QuaternionReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub w: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Angular velocity in deg/s around the device z/x/y axes (alpha/beta/gamma).
#[derive(Copy, Clone, Debug, Default)]
pub struct RotationRateReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f64,
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
}

/// The gated sensor a permission query targets. Mirrors the TS optional
/// `'magnetometer' | 'motion' | 'orientation'` argument.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SensorPermissionTarget {
    Magnetometer,
    #[default]
    Motion,
    Orientation,
}

// NOTE (deferred — see status/types.md): the TS `SensorsBackend` grew to a
// per-sensor seam (gated `get_permission_state`, ten `is_*_supported` probes, nine
// `subscribe_*` streams each taking `SensorSubscribeOptions`, and a `motion`
// listener whose second argument is now a `RotationRateReading`), and `Sensors`
// grew to eleven signals. Expanding the trait and struct cascades into
// `flighthq-sensors`'s backends, wiring, and tests (a separate conformance owner) —
// and the readings now carrying base `SensorReading` fields breaks its literal
// constructors. The new plain-data readings/enums above (`SensorReading`,
// `AmbientLightReading`, `PressureReading`, `ProximityReading`, `QuaternionReading`,
// `RotationRateReading`, `SensorAccuracy`, `SensorsPermissionState`,
// `SensorSubscribeOptions`, `SensorPermissionTarget`) are ported now; the trait and
// the `Sensors` signal-set expansion are parked so the workspace stays green. The
// trait and struct below keep their prior shape.
pub trait SensorsBackend: Send + Sync {
    fn subscribe_motion(
        &self,
        listener: Box<dyn Fn(MotionReading, MotionReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_orientation(
        &self,
        listener: Box<dyn Fn(OrientationReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_magnetometer(
        &self,
        listener: Box<dyn Fn(MotionReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn request_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
}

#[derive(Debug, Default)]
pub struct Sensors {
    pub on_accelerometer: flighthq_signals::Signal<MotionReading>,
    pub on_gyroscope: flighthq_signals::Signal<MotionReading>,
    pub on_magnetometer: flighthq_signals::Signal<MotionReading>,
    pub on_orientation: flighthq_signals::Signal<OrientationReading>,
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/// Key/value persistence seam. Free functions delegate to the active backend.
///
/// Storage is a synchronous capability. Writes return `false` when the host denies
/// access (private mode, quota exceeded); reads return `None`. These are expected-failure
/// surfaces, not programmer errors — do not panic.
pub trait StorageBackend: Send + Sync {
    /// Reads a stored value, or `None` when the key is absent or access is denied.
    fn get_item(&self, key: &str) -> Option<String>;
    /// Writes a value. Returns `false` when access is denied.
    fn set_item(&mut self, key: &str, value: &str) -> bool;
    /// Removes a key. Returns `false` when access is denied.
    fn remove_item(&mut self, key: &str) -> bool;
    /// Removes every key. Returns `false` when access is denied.
    fn clear(&mut self) -> bool;
    /// Returns every stored key, or `[]` when access is denied.
    fn keys(&self) -> Vec<String>;

    /// Optional fast path for the total UTF-16 byte cost of the store.
    ///
    /// Returns `None` when the backend does not provide a direct measurement, in which case the
    /// storage free functions fall back to enumerating entries. Mirrors the optional TS
    /// `StorageBackend.byteSize`.
    fn byte_size(&self) -> Option<f64> {
        None
    }

    /// Optional subscription to backend-originated changes (e.g. cross-tab DOM storage events).
    ///
    /// Returns an unsubscribe handle, or `None` when the backend emits no such events — which is the
    /// default for native backends. Mirrors the optional TS `StorageBackend.subscribeChanges`.
    fn subscribe_changes(
        &self,
        _listener: Box<dyn Fn(&crate::storage::StorageChange) + Send + Sync>,
    ) -> Option<Box<dyn FnOnce() + Send>> {
        None
    }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/// OS shell integration seam. Free functions delegate to the active backend.
///
/// Operations the host cannot perform (revealing an item in the file manager on an
/// unsupported platform, moving a path to the trash without OS support) return `false`
/// rather than panicking — they are expected-failure surfaces.
pub trait ShellBackend: Send + Sync {
    /// Opens `url` in the user's default browser or external URL handler.
    ///
    /// `options.activate` requests a macOS foreground raise; ignored where unsupported.
    fn open_external(
        &self,
        url: &str,
        options: Option<&crate::shell::ShellOpenExternalOptions>,
    ) -> bool;
    /// Opens the local path `path` with its default OS application.
    fn open_path(&self, path: &str, options: Option<&crate::shell::ShellOpenPathOptions>) -> bool;
    /// Opens the local path `path` and returns the OS error message, or `""` on success.
    fn open_path_result(
        &self,
        path: &str,
        options: Option<&crate::shell::ShellOpenPathOptions>,
    ) -> String;
    /// Reveals `path` in the OS file manager (e.g. Finder, Explorer, Nautilus).
    fn show_item_in_folder(&self, path: &str) -> bool;
    /// Moves `path` to the OS trash / recycle bin.
    fn move_to_trash(&self, path: &str) -> bool;
    /// Moves a batch of local paths to the OS trash. Returns a per-path result array.
    fn move_items_to_trash(&self, paths: &[String]) -> Vec<bool>;
    /// Reads a Windows `.lnk` shell shortcut. `None` on non-Windows / missing file.
    fn read_shortcut_link(&self, shortcut_path: &str) -> Option<crate::shell::ShellShortcutLink>;
    /// Creates / replaces / updates a Windows `.lnk` shell shortcut. `false` off Windows.
    fn write_shortcut_link(
        &self,
        shortcut_path: &str,
        link: &crate::shell::ShellShortcutLink,
        operation: crate::shell::ShellShortcutWriteOperation,
    ) -> bool;
    /// Emits a system beep. No-op when the host does not support it.
    fn beep(&self);
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct ShareContent {
    pub title: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub files: Vec<crate::share::ShareFile>,
}

pub trait ShareBackend: Send + Sync {
    /// True when this backend's platform supports sharing at all
    /// (capability-level probe, independent of any content).
    fn is_available(&self) -> bool;
    fn share(
        &self,
        content: &ShareContent,
        options: Option<&crate::share::ShareOptions>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    /// Opens the share sheet and resolves a full [`crate::share::ShareResult`].
    fn share_with_result(
        &self,
        content: &ShareContent,
        options: Option<&crate::share::ShareOptions>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = crate::share::ShareResult> + Send>>;
    fn can_share(&self, content: &ShareContent) -> bool;
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum HapticImpactStyle {
    Light,
    #[default]
    Medium,
    Heavy,
    Rigid,
    Soft,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum HapticNotificationType {
    #[default]
    Success,
    Warning,
    Error,
}

/// Capability flags filled by a `HapticsBackend` via `capabilities`. Ports the
/// TS `HapticsCapabilities` interface (the `out` shape callers pre-allocate).
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub struct HapticsCapabilities {
    pub amplitude_control: bool,
    pub custom_events: bool,
    pub intensity: bool,
    pub patterns: bool,
    pub supported: bool,
}

pub trait HapticsBackend: Send + Sync {
    fn vibrate(&self, duration_ms: u32) -> bool;
    /// Triggers a physical impact with optional continuous intensity (0..1).
    /// `None` intensity means "use the style default".
    fn impact(&self, style: HapticImpactStyle, intensity: Option<f64>) -> bool;
    fn notification(&self, notification_type: HapticNotificationType) -> bool;
    fn selection(&self) -> bool;
    /// Cancels any in-progress device vibration.
    fn cancel(&self) -> bool;
    /// Fills `out` with the backend's capabilities. Mutates and returns nothing;
    /// the caller owns `out` (mirrors the TS `capabilities(out)` out-param).
    fn capabilities(&self, out: &mut HapticsCapabilities);
    /// Reports whether haptics are available on the current device.
    fn is_supported(&self) -> bool;
    /// Vibrates with a pattern array `[onMs, offMs, onMs, ...]`. Returns `false`
    /// on an empty pattern or when haptics are unavailable.
    fn vibrate_pattern(&self, pattern: &[u32]) -> bool;
    /// Warm-up hint to reduce first-trigger latency. No-op by default; native
    /// backends may pre-allocate feedback generators. Mirrors the TS optional
    /// `prepare?` (absent on web).
    fn prepare(&self) {}
    /// Amplitude-aware waveform. `Some(result)` when the backend handled it;
    /// `None` signals "no native waveform support" so callers fall back to
    /// `vibrate_pattern` — the Rust form of the TS optional `vibrateWaveform?`.
    fn vibrate_waveform(
        &self,
        _timings: &[u32],
        _amplitudes: &[u32],
        _repeat: i64,
    ) -> Option<bool> {
        None
    }
}

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct GeoPosition {
    pub latitude: f64,
    pub longitude: f64,
    pub accuracy: f64,
    pub altitude: f64,
    pub altitude_accuracy: f64,
    pub floor_level: f64,
    pub heading: f64,
    pub speed: f64,
    pub timestamp: f64,
}

#[derive(Clone, Debug, Default)]
pub struct GeolocationRequestOptions {
    pub enable_high_accuracy: bool,
    pub timeout_ms: Option<u32>,
    pub maximum_age_ms: Option<u32>,
}

// The current permission state for the geolocation capability, queried without triggering a prompt.
// `Prompt` means the user has not yet been asked.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GeolocationPermissionState {
    Granted,
    Denied,
    #[default]
    Prompt,
}

// Why a geolocation read or watch failed. An expected-failure surface, not a programmer error.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GeolocationErrorReason {
    Denied,
    Timeout,
    #[default]
    Unavailable,
}

// A position read carrying both the position and the failure reason. On success `position` is
// `Some` and `reason` is `None`; on failure `position` is `None` and `reason` carries why.
#[derive(Clone, Debug, Default)]
pub struct GeoPositionResult {
    pub position: Option<GeoPosition>,
    pub reason: Option<GeolocationErrorReason>,
}

pub trait GeolocationBackend: Send + Sync {
    fn get_current_position(
        &self,
        options: &GeolocationRequestOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<GeoPosition>> + Send>>;
    fn get_current_position_result(
        &self,
        options: &GeolocationRequestOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = GeoPositionResult> + Send>>;
    // `on_error` receives ongoing failure reasons (e.g. permission revoked mid-watch) when present.
    fn watch_position(
        &self,
        listener: Box<dyn Fn(GeoPosition) + Send + Sync>,
        options: &GeolocationRequestOptions,
        on_error: Option<Box<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
    ) -> u32;
    fn clear_watch(&self, id: u32);
    fn get_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = GeolocationPermissionState> + Send>>;
    fn request_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    // Subscribes to permission-state changes; returns an unsubscribe function. No-op subscription
    // when the host cannot observe permission changes.
    fn subscribe_permission(
        &self,
        listener: Box<dyn Fn(GeolocationPermissionState) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Webcam (device photo/video capture seam — formerly `Camera`; the `Camera`
// name now belongs to the 3D scene camera in `camera.rs`).
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum WebcamSource {
    #[default]
    Camera,
    Photos,
    Prompt,
}

#[derive(Clone, Debug, Default)]
pub struct WebcamCaptureOptions {
    pub source: WebcamSource,
    pub quality: Option<f32>,
    pub allow_editing: bool,
    pub max_duration_ms: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct WebcamPhoto {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

#[derive(Clone, Debug, Default)]
pub struct WebcamVideo {
    pub data_url: String,
    pub duration: f64,
    pub format: String,
}

pub trait WebcamBackend: Send + Sync {
    fn capture(
        &self,
        options: &WebcamCaptureOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<WebcamPhoto>> + Send>>;
    fn capture_video(
        &self,
        options: &WebcamCaptureOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<WebcamVideo>> + Send>>;
    fn request_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

// Foreground style for the status bar icons and text.
// `Light` — light icons/text (use on dark backgrounds).
// `Dark`  — dark icons/text (use on light backgrounds).
// `Default` — OS-determined; maps to iOS lightContent/darkContent by the system's appearance.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StatusBarStyle {
    Light,
    Dark,
    #[default]
    Default,
}

// Animation used when showing or hiding the status bar.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StatusBarAnimation {
    Fade,
    #[default]
    None,
    Slide,
}

// Snapshot of the current status bar state. `height` is in CSS pixels, or -1 when the host does
// not report it (web, desktops). `color` is a packed 0xRRGGBBAA integer.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct StatusBarInfo {
    pub color: u32,
    pub height: f32,
    pub overlays_content: bool,
    pub style: StatusBarStyle,
    pub visible: bool,
}

impl Default for StatusBarInfo {
    fn default() -> Self {
        StatusBarInfo {
            color: 0,
            height: -1.0,
            overlays_content: false,
            style: StatusBarStyle::Default,
            visible: true,
        }
    }
}

// A style-stack entry for push_status_bar_style_entry. All fields are optional; unset fields fall
// through to the next entry down the stack (or the baseline). `animation` controls the transition
// applied when this entry becomes or stops being the active top entry.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct StatusBarStyleEntry {
    pub animation: Option<StatusBarAnimation>,
    pub color: Option<u32>,
    pub overlays_content: Option<bool>,
    pub style: Option<StatusBarStyle>,
    pub visible: Option<bool>,
}

// Opaque handle returned by push_status_bar_style_entry. Pass to pop_status_bar_style_entry to
// remove this entry from the stack. Numeric identity; -1 is the sentinel for an invalid handle.
pub type StatusBarStyleEntryHandle = i64;

// Event entity for OS-driven status bar changes. Enable delivery with attach_status_bar; signals
// stay inert until then.
#[derive(Debug, Default)]
pub struct StatusBar {
    pub on_change: flighthq_signals::Signal<StatusBarInfo>,
}

// Status bar backend seam. The web default implements only set_background_color (theme-color hint)
// and get_info (read from the hint + safe defaults). A native host registers its own backend via
// set_status_bar_backend.
pub trait StatusBarBackend: Send + Sync {
    // Reads the current status bar state into `out` and returns it. `height` is -1 when unknown.
    fn get_info<'a>(&self, out: &'a mut StatusBarInfo) -> &'a mut StatusBarInfo;
    // `color` is a packed RGBA integer (0xRRGGBBAA, Flight convention). `animated` defaults to false.
    fn set_background_color(&self, color: u32, animated: bool);
    fn set_overlays_content(&self, overlay: bool);
    fn set_style(&self, style: StatusBarStyle);
    // `animation` defaults to `None`.
    fn set_visible(&self, visible: bool, animation: StatusBarAnimation);
    // Registers a listener invoked on any status bar change (OS-driven or app-driven); returns an
    // unsubscribe function.
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_permission_default_is_default() {
        // Mirrors the TS tri-state default: 'default' (not yet asked).
        assert_eq!(
            NotificationPermission::default(),
            NotificationPermission::Default
        );
    }

    #[test]
    fn notification_request_default_is_empty() {
        let request = NotificationRequest::default();
        assert_eq!(request.title, "");
        assert_eq!(request.id, None);
        assert!(request.actions.is_empty());
        assert!(request.data.is_none());
    }

    #[test]
    fn notification_capabilities_default_is_all_false() {
        let capabilities = NotificationCapabilities::default();
        assert!(!capabilities.actions);
        assert!(!capabilities.channels);
        assert!(!capabilities.cold_start);
        assert!(!capabilities.image);
        assert!(!capabilities.list_active);
        assert!(!capabilities.scheduling);
        assert!(!capabilities.text_reply);
    }

    #[test]
    fn sensor_accuracy_default_is_unknown() {
        assert_eq!(SensorAccuracy::default(), SensorAccuracy::Unknown);
    }

    #[test]
    fn sensors_permission_state_default_is_prompt() {
        assert_eq!(
            SensorsPermissionState::default(),
            SensorsPermissionState::Prompt
        );
    }

    #[test]
    fn sensor_subscribe_options_default_has_no_frequency() {
        assert_eq!(SensorSubscribeOptions::default().frequency, None);
    }
}
