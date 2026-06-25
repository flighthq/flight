//! Tray icon seam types.
//!
//! Free functions in `flighthq-tray` delegate to the active [`TrayBackend`] (a
//! web default or a native host's). Web has no tray icon, so the web backend
//! returns `-1` / sentinel values — the tray icon requires a native host
//! (Electron/Tauri). The application/dock badge lives in `flighthq-app`.

use crate::Vector2Like;
use crate::platform::MenuItemTemplate;

/// The kind of tray event delivered through [`TrayBackend::subscribe`].
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TrayEventType {
    #[default]
    Click,
    RightClick,
    DoubleClick,
    DropFiles,
    BalloonShow,
    BalloonClick,
    BalloonClose,
}

/// Options for creating a tray icon.
#[derive(Clone, Debug, Default)]
pub struct TrayIconOptions {
    pub icon: Option<String>,
    pub tooltip: Option<String>,
    pub title: Option<String>,
    /// macOS template-image flag: the icon auto-inverts for light/dark menu bars.
    pub icon_template: Option<bool>,
}

/// Capability flags for a tray backend. Use before calling APIs that may
/// silently no-op (for example check `balloon` before `display_tray_balloon`,
/// or `bounds` before `get_tray_icon_bounds`). On web all flags are `false`.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct TrayCapabilities {
    pub balloon: bool,
    pub bounds: bool,
    pub click_events: bool,
    pub drop_files: bool,
    pub pressed_icon: bool,
    pub title: bool,
}

/// The system icon to display alongside a Windows balloon notification.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TrayBalloonIconType {
    #[default]
    None,
    Info,
    Warning,
    Error,
}

/// Options for a Windows balloon notification shown from a tray icon.
#[derive(Clone, Debug, Default)]
pub struct TrayBalloonOptions {
    pub title: String,
    pub text: String,
    pub icon_type: Option<TrayBalloonIconType>,
    pub large_icon: Option<bool>,
    pub no_sound: Option<bool>,
    pub respect_quiet_time: Option<bool>,
}

/// The screen bounds of a tray icon.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct TrayIconBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A rich tray event payload delivered through [`TrayBackend::subscribe`].
#[derive(Clone, Debug, Default)]
pub struct TrayEventData {
    pub id: i32,
    pub event_type: TrayEventType,
    pub bounds: Option<TrayIconBounds>,
    pub position: Option<Vector2Like>,
    pub alt_key: bool,
    pub ctrl_key: bool,
    pub meta_key: bool,
    pub shift_key: bool,
    /// Dropped file paths, present only for `DropFiles` events.
    pub drop_files: Option<Vec<String>>,
    /// Dropped text, present only for `DropFiles` events.
    pub drop_text: Option<String>,
}

/// The swappable tray backend. The web default is a sentinel implementation; a
/// native host installs its own via `set_tray_backend`.
pub trait TrayBackend: Send + Sync {
    fn create(&self, options: &TrayIconOptions) -> i32;
    fn destroy(&self, id: i32);
    fn display_balloon(&self, id: i32, options: &TrayBalloonOptions);
    fn get_bounds(&self, id: i32) -> Option<TrayIconBounds>;
    fn get_capabilities(&self) -> TrayCapabilities;
    fn get_title(&self, id: i32) -> String;
    fn get_tooltip(&self, id: i32) -> String;
    fn is_destroyed(&self, id: i32) -> bool;
    fn list_ids(&self) -> Vec<i32>;
    fn pop_up_context_menu(&self, id: i32, position: Option<Vector2Like>);
    fn remove_balloon(&self, id: i32);
    fn set_context_menu(&self, id: i32, items: &[MenuItemTemplate]);
    fn set_icon(&self, id: i32, icon: &str);
    fn set_ignore_double_click_events(&self, id: i32, ignore: bool);
    fn set_pressed_icon(&self, id: i32, icon: &str);
    fn set_template(&self, id: i32, is_template: bool);
    fn set_title(&self, id: i32, title: &str);
    fn set_tooltip(&self, id: i32, tooltip: &str);
    fn subscribe(
        &self,
        listener: Box<dyn Fn(&TrayEventData) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;
}
