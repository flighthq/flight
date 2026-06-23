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

#[derive(Clone, Debug, Default)]
pub struct PlatformInfo {
    pub name: PlatformName,
    pub kind: PlatformKind,
    pub version: String,
    pub arch: String,
    pub locale: String,
    pub is_touch: bool,
}

pub trait PlatformBackend: Send + Sync {
    fn get_info<'a>(&self, out: &'a mut PlatformInfo) -> &'a mut PlatformInfo;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct ScreenInfo {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub work_width: f32,
    pub work_height: f32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

pub trait ScreenBackend: Send + Sync {
    // Output lifetime binds to `out` (the filled buffer the caller passes in),
    // not to `&self`, so backends return the same buffer they wrote.
    fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo>;
    fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct DeviceInfo {
    pub model: String,
    pub manufacturer: String,
    pub os_name: String,
    pub os_version: String,
    pub platform: String,
    pub is_virtual: bool,
    pub memory: i64,
}

#[derive(Clone, Debug, Default)]
pub struct SafeAreaInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

pub trait DeviceBackend: Send + Sync {
    fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo;
    fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets;
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ClipboardBookmark {
    pub title: String,
    pub url: String,
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
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct FileDialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct OpenFileDialogOptions {
    pub title: Option<String>,
    pub multiple: bool,
    pub directory: bool,
    pub filters: Vec<FileDialogFilter>,
    pub default_path: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct SaveFileDialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Vec<FileDialogFilter>,
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

#[derive(Clone, Debug, Default)]
pub struct MessageDialogResult {
    pub button_index: u32,
    pub checkbox_checked: bool,
}

pub trait DialogBackend: Send + Sync {
    fn open_file(
        &self,
        options: &OpenFileDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<String>> + Send>>;
    fn save_file(
        &self,
        options: &SaveFileDialogOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>>;
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
        message: &str,
        default_value: &str,
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
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct NotificationAction {
    pub id: String,
    pub title: String,
}

#[derive(Clone, Debug, Default)]
pub struct NotificationRequest {
    pub title: String,
    pub body: Option<String>,
    pub icon: Option<String>,
    pub tag: Option<String>,
    pub silent: bool,
    pub actions: Vec<NotificationAction>,
}

pub trait NotificationBackend: Send + Sync {
    fn notify(
        &self,
        request: &NotificationRequest,
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

// ---------------------------------------------------------------------------
// Shortcut
// ---------------------------------------------------------------------------

pub trait ShortcutBackend: Send + Sync {
    fn register(&self, accelerator: &str, listener: Box<dyn Fn() + Send + Sync>) -> bool;
    fn unregister(&self, accelerator: &str) -> bool;
    fn unregister_all(&self);
    fn is_registered(&self, accelerator: &str) -> bool;
}

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
// Tray
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum TrayEventType {
    Click,
    RightClick,
    DoubleClick,
}

#[derive(Clone, Debug, Default)]
pub struct TrayIconOptions {
    pub icon: Option<String>,
    pub tooltip: Option<String>,
    pub title: Option<String>,
}

pub trait TrayBackend: Send + Sync {
    fn create(&self, options: &TrayIconOptions) -> i32;
    fn destroy(&self, id: i32);
    fn set_tooltip(&self, id: i32, tooltip: &str);
    fn set_title(&self, id: i32, title: &str);
    fn set_context_menu(&self, id: i32, items: &[MenuItemTemplate]);
    fn subscribe(
        &self,
        listener: Box<dyn Fn(i32, TrayEventType) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// App / AppBackend
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct App {
    pub on_activate: flighthq_signals::Signal<()>,
    pub on_open_file: flighthq_signals::Signal<String>,
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
    fn subscribe_activate(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_open_file(
        &self,
        listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
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

pub trait ProtocolBackend: Send + Sync {
    fn register(&self, scheme: &str) -> bool;
    fn unregister(&self, scheme: &str) -> bool;
    fn is_registered(&self, scheme: &str) -> bool;
    fn set_as_default(&self, scheme: &str) -> bool;
    fn subscribe(&self, listener: Box<dyn Fn(String) + Send + Sync>)
    -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub release_date: String,
}

#[derive(Debug, Default)]
pub struct AppUpdater {
    pub on_checking: flighthq_signals::Signal<()>,
    pub on_update_available: flighthq_signals::Signal<UpdateInfo>,
    pub on_update_not_available: flighthq_signals::Signal<()>,
    pub on_download_progress: flighthq_signals::Signal<f32>,
    pub on_update_downloaded: flighthq_signals::Signal<UpdateInfo>,
    pub on_error: flighthq_signals::Signal<String>,
}

pub trait UpdaterBackend: Send + Sync {
    fn set_feed_url(&self, url: &str);
    fn check_for_updates(&self);
    fn download_update(&self);
    fn quit_and_install(&self);
    fn subscribe_checking(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_available(
        &self,
        listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_not_available(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_download_progress(
        &self,
        listener: Box<dyn Fn(f32) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_update_downloaded(
        &self,
        listener: Box<dyn Fn(UpdateInfo) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_error(
        &self,
        listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
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

pub trait IpcBackend: Send + Sync {
    fn send(&self, channel: &str, args: &[IpcValue]);
    fn invoke(&self, channel: &str, args: &[IpcValue]) -> IpcInvokeFuture;
    fn subscribe(&self, channel: &str, listener: IpcMessageListener)
    -> Box<dyn Fn() + Send + Sync>;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum NetworkConnectionType {
    Wifi,
    Cellular,
    Ethernet,
    Bluetooth,
    None,
    #[default]
    Unknown,
}

#[derive(Clone, Debug, Default)]
pub struct NetworkStatus {
    pub online: bool,
    pub connection_type: NetworkConnectionType,
    pub downlink: f32,
    pub effective_type: String,
}

pub trait NetworkBackend: Send + Sync {
    fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
}

#[derive(Debug, Default)]
pub struct Network {
    pub on_change: flighthq_signals::Signal<NetworkStatus>,
    pub on_offline: flighthq_signals::Signal<()>,
    pub on_online: flighthq_signals::Signal<()>,
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct PowerStatus {
    pub battery_level: f32,
    pub is_charging: bool,
    pub is_low_power: bool,
}

pub trait PowerBackend: Send + Sync {
    fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_suspend(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn subscribe_resume(
        &self,
        listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
    fn set_keep_awake(&self, enabled: bool) -> bool;
}

#[derive(Debug, Default)]
pub struct Power {
    pub on_change: flighthq_signals::Signal<PowerStatus>,
    pub on_charging: flighthq_signals::Signal<()>,
    pub on_discharging: flighthq_signals::Signal<()>,
    pub on_resume: flighthq_signals::Signal<()>,
    pub on_suspend: flighthq_signals::Signal<()>,
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
}

#[derive(Debug, Default)]
pub struct AppLifecycle {
    pub on_back_button: flighthq_signals::Signal<()>,
    pub on_pause: flighthq_signals::Signal<()>,
    pub on_resume: flighthq_signals::Signal<()>,
    pub on_state_change: flighthq_signals::Signal<AppLifecycleState>,
}

// ---------------------------------------------------------------------------
// SoftKeyboard
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct SoftKeyboardInfo {
    pub visible: bool,
    pub height: f32,
}

pub trait SoftKeyboardBackend: Send + Sync {
    fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo;
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
    fn show(&self);
    fn hide(&self);
}

#[derive(Debug, Default)]
pub struct SoftKeyboard {
    pub on_hide: flighthq_signals::Signal<()>,
    pub on_resize: flighthq_signals::Signal<f32>,
    pub on_show: flighthq_signals::Signal<f32>,
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

#[derive(Copy, Clone, Debug, Default)]
pub struct MotionReading {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Copy, Clone, Debug, Default)]
pub struct OrientationReading {
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
    pub absolute: bool,
    pub heading: f32,
}

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
    fn open_external(&self, url: &str) -> bool;
    /// Opens the local path `path` with its default OS application.
    fn open_path(&self, path: &str) -> bool;
    /// Reveals `path` in the OS file manager (e.g. Finder, Explorer, Nautilus).
    fn show_item_in_folder(&self, path: &str) -> bool;
    /// Moves `path` to the OS trash / recycle bin.
    fn move_to_trash(&self, path: &str) -> bool;
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
}

pub trait ShareBackend: Send + Sync {
    fn share(
        &self,
        content: &ShareContent,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
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
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum HapticNotificationType {
    #[default]
    Success,
    Warning,
    Error,
}

pub trait HapticsBackend: Send + Sync {
    fn vibrate(&self, duration_ms: u32) -> bool;
    fn impact(&self, style: HapticImpactStyle) -> bool;
    fn notification(&self, notification_type: HapticNotificationType) -> bool;
    fn selection(&self) -> bool;
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

pub trait GeolocationBackend: Send + Sync {
    fn get_current_position(
        &self,
        options: &GeolocationRequestOptions,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<GeoPosition>> + Send>>;
    fn watch_position(
        &self,
        listener: Box<dyn Fn(GeoPosition) + Send + Sync>,
        options: &GeolocationRequestOptions,
    ) -> u32;
    fn clear_watch(&self, id: u32);
    fn request_permission(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
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

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StatusBarStyle {
    Light,
    Dark,
    #[default]
    Default,
}

pub trait StatusBarBackend: Send + Sync {
    fn set_style(&self, style: StatusBarStyle);
    fn set_visible(&self, visible: bool);
    fn set_background_color(&self, color: u32);
    fn set_overlays_content(&self, overlay: bool);
}
