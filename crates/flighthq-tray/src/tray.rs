//! Tray free functions and backend management.

use flighthq_types::{
    MenuItemTemplate, TrayBackend, TrayBalloonOptions, TrayCapabilities, TrayEventData,
    TrayIconBounds, TrayIconOptions, Vector2Like,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

// ---------------------------------------------------------------------------
// TrayIcon handle
// ---------------------------------------------------------------------------

/// An opaque handle to a system-tray icon created by the active [`TrayBackend`].
///
/// The `id` field is an integer assigned by the backend. Treat it as opaque;
/// the only meaningful operation is passing it back to tray functions.
/// A handle whose backend id is negative (`id < 0`) is invalid and must not be
/// used — [`create_tray_icon`] returns `None` in that case rather than exposing
/// an invalid handle.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TrayIcon {
    pub id: i32,
}

// ---------------------------------------------------------------------------
// Web sentinel backend
// ---------------------------------------------------------------------------

/// Web tray capabilities. Web has no system tray, so every flag is `false`.
const WEB_CAPABILITIES: TrayCapabilities = TrayCapabilities {
    balloon: false,
    bounds: false,
    click_events: false,
    drop_files: false,
    pressed_icon: false,
    title: false,
};

/// Default web backend. Web has no system tray, so `create` returns `-1` and
/// all mutators are no-ops. A native host (Electron's `Tray`, Tauri) is
/// required for the tray icon itself. (The application/dock badge lives in
/// `flighthq-app`'s `set_app_badge_count`, not here.)
pub struct WebTrayBackend;

impl TrayBackend for WebTrayBackend {
    fn create(&self, _options: &TrayIconOptions) -> i32 {
        // No tray on web. -1 signals "unsupported"; create_tray_icon maps it to None.
        -1
    }

    fn destroy(&self, _id: i32) {
        // No-op: web has no tray icon to destroy.
    }

    fn display_balloon(&self, _id: i32, _options: &TrayBalloonOptions) {
        // No-op: balloon notifications require a native host (Windows only).
    }

    fn get_bounds(&self, _id: i32) -> Option<TrayIconBounds> {
        // No tray on web; None signals unavailable.
        None
    }

    fn get_capabilities(&self) -> TrayCapabilities {
        WEB_CAPABILITIES
    }

    fn get_title(&self, _id: i32) -> String {
        // No tray on web.
        String::new()
    }

    fn get_tooltip(&self, _id: i32) -> String {
        // No tray on web.
        String::new()
    }

    fn is_destroyed(&self, _id: i32) -> bool {
        // No tray icons exist on web; treat every id as destroyed.
        true
    }

    fn list_ids(&self) -> Vec<i32> {
        // No tray icons exist on web.
        Vec::new()
    }

    fn pop_up_context_menu(&self, _id: i32, _position: Option<Vector2Like>) {
        // No-op: web has no context menu to pop up.
    }

    fn remove_balloon(&self, _id: i32) {
        // No-op: balloon notifications require a native host (Windows only).
    }

    fn set_context_menu(&self, _id: i32, _items: &[MenuItemTemplate]) {
        // No-op: web has no tray icon — a native host is required.
    }

    fn set_icon(&self, _id: i32, _icon: &str) {
        // No-op: web has no tray icon to update.
    }

    fn set_ignore_double_click_events(&self, _id: i32, _ignore: bool) {
        // No-op: web has no tray icon double-click behavior to configure.
    }

    fn set_pressed_icon(&self, _id: i32, _icon: &str) {
        // No-op: web has no tray icon; pressed icon is macOS-specific.
    }

    fn set_template(&self, _id: i32, _is_template: bool) {
        // No-op: template images are a macOS menu-bar concept; irrelevant on web.
    }

    fn set_title(&self, _id: i32, _title: &str) {
        // No-op: web has no tray icon to update.
    }

    fn set_tooltip(&self, _id: i32, _tooltip: &str) {
        // No-op: web has no tray icon to update.
    }

    fn subscribe(
        &self,
        _listener: Box<dyn Fn(&TrayEventData) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No tray on web; a native host is required to emit tray events.
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active tray backend. Falls back to the web sentinel default when
/// no backend has been installed.
pub fn get_tray_backend() -> Arc<dyn TrayBackend> {
    let mut guard = BACKEND.lock().expect("tray backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(WebTrayBackend) as Arc<dyn TrayBackend>);
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Installs a native host tray backend. Pass `None` to revert to the web
/// sentinel default.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_tray_backend(backend: Option<Arc<dyn TrayBackend>>) {
    let mut guard = BACKEND.lock().expect("tray backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a tray icon with the given options, or returns `None` when the host
/// has no system tray (e.g. web). The backend signals "unsupported" by returning
/// a negative id; this function translates that to a `None` sentinel.
pub fn create_tray_icon(options: &TrayIconOptions) -> Option<TrayIcon> {
    let id = get_tray_backend().create(options);
    if id < 0 { None } else { Some(TrayIcon { id }) }
}

/// Destroys a tray icon and frees its host resource. No-op when the host has no
/// tray.
pub fn destroy_tray_icon(tray: TrayIcon) {
    get_tray_backend().destroy(tray.id);
}

/// Displays a Windows balloon notification from the tray icon. No-op on
/// macOS/Linux and on web. Balloon lifecycle events
/// (`BalloonShow`/`BalloonClick`/`BalloonClose`) are emitted via [`on_tray_event`].
pub fn display_tray_balloon(tray: TrayIcon, options: &TrayBalloonOptions) {
    get_tray_backend().display_balloon(tray.id, options);
}

/// Returns the capability flags for the active tray backend. Use before calling
/// APIs that may silently no-op — for example, check `balloon` before
/// [`display_tray_balloon`], or `bounds` before [`get_tray_icon_bounds`]. On
/// web all flags are `false`.
pub fn get_tray_capabilities() -> TrayCapabilities {
    get_tray_backend().get_capabilities()
}

/// Returns the screen bounds of the tray icon, or `None` when the platform does
/// not expose icon geometry (Linux/AppIndicator, web). Use for anchoring
/// popovers or windows to the icon.
pub fn get_tray_icon_bounds(tray: TrayIcon) -> Option<TrayIconBounds> {
    get_tray_backend().get_bounds(tray.id)
}

/// Returns the current title text of a tray icon, or an empty string when
/// unavailable (web, non-macOS).
pub fn get_tray_icon_title(tray: TrayIcon) -> String {
    get_tray_backend().get_title(tray.id)
}

/// Returns the current hover tooltip text of a tray icon, or an empty string
/// when unavailable (web).
pub fn get_tray_icon_tooltip(tray: TrayIcon) -> String {
    get_tray_backend().get_tooltip(tray.id)
}

/// Returns all live tray icon handles known to the active backend. On web this
/// is always empty.
pub fn get_tray_icons() -> Vec<TrayIcon> {
    get_tray_backend()
        .list_ids()
        .into_iter()
        .map(|id| TrayIcon { id })
        .collect()
}

/// Returns whether a tray icon has been destroyed. Returns `true` on web (no
/// trays exist). Use this to guard calls after [`destroy_tray_icon`] when the
/// tray lifecycle is unclear.
pub fn is_tray_destroyed(tray: TrayIcon) -> bool {
    get_tray_backend().is_destroyed(tray.id)
}

/// Subscribes to tray icon events, delivering a rich [`TrayEventData`] payload
/// (id, type, bounds, position, modifier keys, and drop payloads). Returns an
/// unsubscribe function.
///
/// On web this never fires (no tray); a native host is required.
pub fn on_tray_event(
    listener: Box<dyn Fn(&TrayEventData) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_tray_backend().subscribe(listener)
}

/// Programmatically shows the attached context menu, optionally at a specific
/// screen position. On web this is a no-op. Useful for showing the menu in
/// response to a custom gesture or shortcut without waiting for the user to
/// right-click the tray icon.
pub fn popup_tray_context_menu(tray: TrayIcon, position: Option<Vector2Like>) {
    get_tray_backend().pop_up_context_menu(tray.id, position);
}

/// Dismisses the currently-displayed Windows balloon notification. No-op on
/// macOS/Linux and web.
pub fn remove_tray_balloon(tray: TrayIcon) {
    get_tray_backend().remove_balloon(tray.id);
}

/// Sets the image for the tray icon. Accepts the same icon path/data-URI
/// accepted by [`create_tray_icon`]. Use this for runtime status updates
/// (indicators, spinners, theme changes).
pub fn set_tray_icon(tray: TrayIcon, icon: &str) {
    get_tray_backend().set_icon(tray.id, icon);
}

/// Sets the context menu attached to a tray icon. Shown on right-click (or
/// [`popup_tray_context_menu`]). No-op when the host has no tray.
pub fn set_tray_icon_context_menu(tray: TrayIcon, items: &[MenuItemTemplate]) {
    get_tray_backend().set_context_menu(tray.id, items);
}

/// Marks the tray icon as a macOS template image. Template images auto-invert
/// for light/dark menu bars. No-op on Windows/Linux and on web. Set
/// `icon_template = Some(true)` on [`TrayIconOptions`] at creation to combine
/// with the initial icon, or call this after creation to update the flag
/// dynamically.
pub fn set_tray_icon_template(tray: TrayIcon, is_template: bool) {
    get_tray_backend().set_template(tray.id, is_template);
}

/// Sets the title text displayed next to the tray icon (macOS menu bar only).
/// No-op on other platforms.
pub fn set_tray_icon_title(tray: TrayIcon, title: &str) {
    get_tray_backend().set_title(tray.id, title);
}

/// Sets the hover tooltip for the tray icon. No-op when the host has no tray.
pub fn set_tray_icon_tooltip(tray: TrayIcon, tooltip: &str) {
    get_tray_backend().set_tooltip(tray.id, tooltip);
}

/// Sets whether the host should collapse double-click events into individual
/// click events (macOS). No-op on Windows/Linux and on web.
pub fn set_tray_ignore_double_click_events(tray: TrayIcon, ignore: bool) {
    get_tray_backend().set_ignore_double_click_events(tray.id, ignore);
}

/// Sets the image shown when the tray icon is pressed (macOS only). Electron
/// calls this `setPressedImage`. No-op on Windows/Linux and on web.
pub fn set_tray_pressed_icon(tray: TrayIcon, icon: &str) {
    get_tray_backend().set_pressed_icon(tray.id, icon);
}

/// Starts an animated icon sequence by cycling through the given frames at the
/// specified interval. The caller owns the timer — this function is a thin
/// helper over [`set_tray_icon`] that starts an interval and returns a stop
/// function. Call the returned function to cancel. The tray icon is not
/// destroyed when the animation stops.
///
/// The first frame is set immediately (synchronously) before the timer starts.
/// Returns a no-op stop closure when `frames` is empty.
///
/// Note: interval timing is best-effort; the actual frame rate depends on the
/// host scheduler.
pub fn start_tray_icon_animation(
    tray: TrayIcon,
    frames: &[String],
    interval_ms: u64,
) -> Box<dyn Fn() + Send + Sync> {
    if frames.is_empty() {
        return Box::new(|| {});
    }
    set_tray_icon(tray, &frames[0]);
    let stopped = Arc::new(AtomicBool::new(false));
    let frames: Vec<String> = frames.to_vec();
    let thread_stopped = Arc::clone(&stopped);
    let interval = Duration::from_millis(interval_ms);
    std::thread::spawn(move || {
        let mut index = 0usize;
        loop {
            std::thread::sleep(interval);
            if thread_stopped.load(Ordering::SeqCst) {
                break;
            }
            index = (index + 1) % frames.len();
            set_tray_icon(tray, &frames[index]);
        }
    });
    Box::new(move || stopped.store(true, Ordering::SeqCst))
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn TrayBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;

    use flighthq_types::TrayBalloonIconType;
    use flighthq_types::TrayEventType;
    use serial_test::serial;

    use super::*;

    // Per-icon state inside the fake backend.
    #[derive(Clone, Default)]
    struct FakeTray {
        balloon: Option<TrayBalloonOptions>,
        destroyed: bool,
        icon: String,
        ignore_double_click: bool,
        is_template: bool,
        pressed_icon: String,
        title: String,
        tooltip: String,
    }

    struct FakeState {
        caps: TrayCapabilities,
        next_id: i32,
        trays: HashMap<i32, FakeTray>,
        last_popup_position: Option<Vector2Like>,
        listener: Option<Arc<dyn Fn(&TrayEventData) + Send + Sync>>,
    }

    // A full fake backend implementing every TrayBackend method for test control.
    #[derive(Clone)]
    struct FakeBackend {
        state: Arc<StdMutex<FakeState>>,
    }

    impl FakeBackend {
        fn new(caps: TrayCapabilities) -> Self {
            FakeBackend {
                state: Arc::new(StdMutex::new(FakeState {
                    caps,
                    next_id: 1,
                    trays: HashMap::new(),
                    last_popup_position: None,
                    listener: None,
                })),
            }
        }

        fn all_caps() -> TrayCapabilities {
            TrayCapabilities {
                balloon: true,
                bounds: true,
                click_events: true,
                drop_files: false,
                pressed_icon: true,
                title: true,
            }
        }

        fn fire_event(&self, event: &TrayEventData) {
            let listener = self.state.lock().unwrap().listener.clone();
            if let Some(listener) = listener {
                listener(event);
            }
        }

        fn icon_of(&self, id: i32) -> String {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .unwrap()
                .icon
                .clone()
        }

        fn is_template_of(&self, id: i32) -> bool {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .unwrap()
                .is_template
        }

        fn balloon_of(&self, id: i32) -> Option<TrayBalloonOptions> {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .unwrap()
                .balloon
                .clone()
        }

        fn pressed_icon_of(&self, id: i32) -> String {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .unwrap()
                .pressed_icon
                .clone()
        }

        fn ignore_double_click_of(&self, id: i32) -> bool {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .unwrap()
                .ignore_double_click
        }

        fn last_popup_position(&self) -> Option<Vector2Like> {
            self.state.lock().unwrap().last_popup_position
        }
    }

    impl TrayBackend for FakeBackend {
        fn create(&self, options: &TrayIconOptions) -> i32 {
            let mut state = self.state.lock().unwrap();
            let id = state.next_id;
            state.next_id += 1;
            state.trays.insert(
                id,
                FakeTray {
                    balloon: None,
                    destroyed: false,
                    icon: options.icon.clone().unwrap_or_default(),
                    ignore_double_click: false,
                    is_template: options.icon_template.unwrap_or(false),
                    pressed_icon: String::new(),
                    title: options.title.clone().unwrap_or_default(),
                    tooltip: options.tooltip.clone().unwrap_or_default(),
                },
            );
            id
        }

        fn destroy(&self, id: i32) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.destroyed = true;
            }
        }

        fn display_balloon(&self, id: i32, options: &TrayBalloonOptions) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.balloon = Some(options.clone());
            }
        }

        fn get_bounds(&self, id: i32) -> Option<TrayIconBounds> {
            let state = self.state.lock().unwrap();
            if !state.trays.contains_key(&id) {
                return None;
            }
            Some(TrayIconBounds {
                x: 100.0,
                y: 0.0,
                width: 22.0,
                height: 22.0,
            })
        }

        fn get_capabilities(&self) -> TrayCapabilities {
            self.state.lock().unwrap().caps
        }

        fn get_title(&self, id: i32) -> String {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .map(|t| t.title.clone())
                .unwrap_or_default()
        }

        fn get_tooltip(&self, id: i32) -> String {
            self.state
                .lock()
                .unwrap()
                .trays
                .get(&id)
                .map(|t| t.tooltip.clone())
                .unwrap_or_default()
        }

        fn is_destroyed(&self, id: i32) -> bool {
            let state = self.state.lock().unwrap();
            state.trays.get(&id).map(|t| t.destroyed).unwrap_or(true)
        }

        fn list_ids(&self) -> Vec<i32> {
            let state = self.state.lock().unwrap();
            state
                .trays
                .iter()
                .filter(|(_, t)| !t.destroyed)
                .map(|(id, _)| *id)
                .collect()
        }

        fn pop_up_context_menu(&self, _id: i32, position: Option<Vector2Like>) {
            self.state.lock().unwrap().last_popup_position = position;
        }

        fn remove_balloon(&self, id: i32) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.balloon = None;
            }
        }

        fn set_context_menu(&self, _id: i32, _items: &[MenuItemTemplate]) {}

        fn set_icon(&self, id: i32, icon: &str) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.icon = icon.to_string();
            }
        }

        fn set_ignore_double_click_events(&self, id: i32, ignore: bool) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.ignore_double_click = ignore;
            }
        }

        fn set_pressed_icon(&self, id: i32, icon: &str) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.pressed_icon = icon.to_string();
            }
        }

        fn set_template(&self, id: i32, is_template: bool) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.is_template = is_template;
            }
        }

        fn set_title(&self, id: i32, title: &str) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.title = title.to_string();
            }
        }

        fn set_tooltip(&self, id: i32, tooltip: &str) {
            let mut state = self.state.lock().unwrap();
            if let Some(tray) = state.trays.get_mut(&id) {
                tray.tooltip = tooltip.to_string();
            }
        }

        fn subscribe(
            &self,
            listener: Box<dyn Fn(&TrayEventData) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            let listener: Arc<dyn Fn(&TrayEventData) + Send + Sync> = Arc::from(listener);
            self.state.lock().unwrap().listener = Some(listener);
            let state = Arc::clone(&self.state);
            Box::new(move || {
                state.lock().unwrap().listener = None;
            })
        }
    }

    fn make_tray_event(event_type: TrayEventType, id: i32) -> TrayEventData {
        TrayEventData {
            id,
            event_type,
            bounds: None,
            position: None,
            alt_key: false,
            ctrl_key: false,
            meta_key: false,
            shift_key: false,
            drop_files: None,
            drop_text: None,
        }
    }

    fn install_fake() -> FakeBackend {
        let backend = FakeBackend::new(FakeBackend::all_caps());
        set_tray_backend(Some(Arc::new(backend.clone())));
        backend
    }

    // create_tray_icon
    #[test]
    #[serial]
    fn create_tray_icon_returns_none_on_web() {
        set_tray_backend(None);
        assert!(create_tray_icon(&TrayIconOptions::default()).is_none());
    }

    #[test]
    #[serial]
    fn create_tray_icon_returns_some_with_native_backend() {
        let _backend = install_fake();
        let icon = create_tray_icon(&TrayIconOptions::default());
        assert!(icon.is_some());
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn create_tray_icon_passes_icon_template_to_backend() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions {
            icon: Some("icon.png".into()),
            icon_template: Some(true),
            ..TrayIconOptions::default()
        })
        .unwrap();
        assert!(backend.is_template_of(tray.id));
        set_tray_backend(None);
    }

    // createWebTrayBackend — web capabilities are all false
    #[test]
    #[serial]
    fn create_web_tray_backend_capabilities_all_false() {
        let backend = WebTrayBackend;
        let caps = backend.get_capabilities();
        assert!(!caps.balloon);
        assert!(!caps.bounds);
        assert!(!caps.click_events);
        assert!(!caps.drop_files);
        assert!(!caps.pressed_icon);
        assert!(!caps.title);
    }

    #[test]
    #[serial]
    fn create_web_tray_backend_methods_do_not_panic() {
        let backend = WebTrayBackend;
        backend.set_icon(0, "icon.png");
        backend.set_template(0, true);
        backend.set_pressed_icon(0, "pressed.png");
        backend.set_ignore_double_click_events(0, true);
        backend.pop_up_context_menu(0, None);
        backend.display_balloon(
            0,
            &TrayBalloonOptions {
                title: "T".into(),
                text: "B".into(),
                ..Default::default()
            },
        );
        backend.remove_balloon(0);
        assert!(backend.get_bounds(0).is_none());
        assert_eq!(backend.get_title(0), "");
        assert_eq!(backend.get_tooltip(0), "");
        assert!(backend.is_destroyed(0));
        assert_eq!(backend.list_ids(), Vec::<i32>::new());
    }

    // destroy_tray_icon
    #[test]
    #[serial]
    fn destroy_tray_icon_does_not_panic() {
        let _backend = install_fake();
        let icon = create_tray_icon(&TrayIconOptions::default()).unwrap();
        destroy_tray_icon(icon);
        set_tray_backend(None);
    }

    // display_tray_balloon
    #[test]
    #[serial]
    fn display_tray_balloon_passes_options_to_backend() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let opts = TrayBalloonOptions {
            title: "Alert".into(),
            text: "Something happened".into(),
            ..Default::default()
        };
        display_tray_balloon(tray, &opts);
        let stored = backend.balloon_of(tray.id).unwrap();
        assert_eq!(stored.title, "Alert");
        assert_eq!(stored.text, "Something happened");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn display_tray_balloon_accepts_optional_fields() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let opts = TrayBalloonOptions {
            title: "Alert".into(),
            text: "Body".into(),
            icon_type: Some(TrayBalloonIconType::Warning),
            large_icon: Some(true),
            no_sound: Some(true),
            respect_quiet_time: Some(true),
        };
        display_tray_balloon(tray, &opts);
        assert_eq!(
            backend.balloon_of(tray.id).unwrap().icon_type,
            Some(TrayBalloonIconType::Warning)
        );
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn display_tray_balloon_no_op_on_web() {
        set_tray_backend(None);
        display_tray_balloon(
            TrayIcon { id: 0 },
            &TrayBalloonOptions {
                title: "T".into(),
                text: "B".into(),
                ..Default::default()
            },
        );
    }

    // get_tray_backend
    #[test]
    #[serial]
    fn get_tray_backend_returns_web_default() {
        set_tray_backend(None);
        let _backend = get_tray_backend();
    }

    // get_tray_capabilities
    #[test]
    #[serial]
    fn get_tray_capabilities_returns_active_backend_caps() {
        let mut caps = FakeBackend::all_caps();
        caps.balloon = true;
        caps.bounds = false;
        set_tray_backend(Some(Arc::new(FakeBackend::new(caps))));
        let got = get_tray_capabilities();
        assert!(got.balloon);
        assert!(!got.bounds);
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_capabilities_all_false_on_web() {
        set_tray_backend(None);
        let caps = get_tray_capabilities();
        assert!(
            !caps.balloon
                && !caps.bounds
                && !caps.click_events
                && !caps.drop_files
                && !caps.pressed_icon
                && !caps.title
        );
    }

    // get_tray_icon_bounds
    #[test]
    #[serial]
    fn get_tray_icon_bounds_returns_bounds_from_backend() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let bounds = get_tray_icon_bounds(tray);
        assert!(bounds.is_some());
        let bounds = bounds.unwrap();
        assert!(bounds.width > 0.0);
        assert!(bounds.height > 0.0);
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_icon_bounds_returns_none_on_web() {
        set_tray_backend(None);
        assert!(get_tray_icon_bounds(TrayIcon { id: 0 }).is_none());
    }

    // get_tray_icon_title
    #[test]
    #[serial]
    fn get_tray_icon_title_returns_current_title() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_icon_title(tray, "MyApp");
        assert_eq!(get_tray_icon_title(tray), "MyApp");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_icon_title_returns_empty_on_web() {
        set_tray_backend(None);
        assert_eq!(get_tray_icon_title(TrayIcon { id: 0 }), "");
    }

    // get_tray_icon_tooltip
    #[test]
    #[serial]
    fn get_tray_icon_tooltip_returns_current_tooltip() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_icon_tooltip(tray, "Hover tip");
        assert_eq!(get_tray_icon_tooltip(tray), "Hover tip");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_icon_tooltip_returns_empty_on_web() {
        set_tray_backend(None);
        assert_eq!(get_tray_icon_tooltip(TrayIcon { id: 0 }), "");
    }

    // get_tray_icons
    #[test]
    #[serial]
    fn get_tray_icons_returns_all_live_icons() {
        let _backend = install_fake();
        let t1 = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let t2 = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let ids: Vec<i32> = get_tray_icons().iter().map(|t| t.id).collect();
        assert!(ids.contains(&t1.id));
        assert!(ids.contains(&t2.id));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_icons_excludes_destroyed() {
        let _backend = install_fake();
        let t1 = create_tray_icon(&TrayIconOptions::default()).unwrap();
        destroy_tray_icon(t1);
        let ids: Vec<i32> = get_tray_icons().iter().map(|t| t.id).collect();
        assert!(!ids.contains(&t1.id));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn get_tray_icons_empty_on_web() {
        set_tray_backend(None);
        assert!(get_tray_icons().is_empty());
    }

    // is_tray_destroyed
    #[test]
    #[serial]
    fn is_tray_destroyed_returns_false_for_live_tray() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        assert!(!is_tray_destroyed(tray));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn is_tray_destroyed_returns_true_after_destroy() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        destroy_tray_icon(tray);
        assert!(is_tray_destroyed(tray));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn is_tray_destroyed_returns_true_on_web() {
        set_tray_backend(None);
        assert!(is_tray_destroyed(TrayIcon { id: 0 }));
    }

    // on_tray_event
    #[test]
    #[serial]
    fn on_tray_event_delivers_rich_event_data() {
        let backend = install_fake();
        let received: Arc<StdMutex<Option<TrayEventData>>> = Arc::new(StdMutex::new(None));
        let captured = Arc::clone(&received);
        on_tray_event(Box::new(move |event: &TrayEventData| {
            *captured.lock().unwrap() = Some(event.clone());
        }));
        let mut evt = make_tray_event(TrayEventType::RightClick, 7);
        evt.bounds = Some(TrayIconBounds {
            x: 100.0,
            y: 0.0,
            width: 22.0,
            height: 22.0,
        });
        evt.shift_key = true;
        backend.fire_event(&evt);
        let got = received.lock().unwrap().clone().unwrap();
        assert_eq!(got.id, 7);
        assert_eq!(got.event_type, TrayEventType::RightClick);
        assert_eq!(got.bounds.unwrap().x, 100.0);
        assert!(got.shift_key);
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn on_tray_event_delivers_drop_events_with_files() {
        let backend = install_fake();
        let received: Arc<StdMutex<Option<TrayEventData>>> = Arc::new(StdMutex::new(None));
        let captured = Arc::clone(&received);
        on_tray_event(Box::new(move |e: &TrayEventData| {
            *captured.lock().unwrap() = Some(e.clone());
        }));
        let mut evt = make_tray_event(TrayEventType::DropFiles, 1);
        evt.drop_files = Some(vec!["/path/to/file.txt".to_string()]);
        backend.fire_event(&evt);
        assert_eq!(
            received.lock().unwrap().clone().unwrap().drop_files,
            Some(vec!["/path/to/file.txt".to_string()])
        );
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn on_tray_event_unsubscribe_stops_delivery() {
        let backend = install_fake();
        let count = Arc::new(StdMutex::new(0u32));
        let counter = Arc::clone(&count);
        let unsubscribe = on_tray_event(Box::new(move |_e: &TrayEventData| {
            *counter.lock().unwrap() += 1;
        }));
        backend.fire_event(&make_tray_event(TrayEventType::Click, 1));
        unsubscribe();
        backend.fire_event(&make_tray_event(TrayEventType::Click, 1));
        assert_eq!(*count.lock().unwrap(), 1);
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn on_tray_event_delivers_balloon_events() {
        let backend = install_fake();
        let types: Arc<StdMutex<Vec<TrayEventType>>> = Arc::new(StdMutex::new(Vec::new()));
        let captured = Arc::clone(&types);
        on_tray_event(Box::new(move |e: &TrayEventData| {
            captured.lock().unwrap().push(e.event_type);
        }));
        backend.fire_event(&make_tray_event(TrayEventType::BalloonShow, 1));
        backend.fire_event(&make_tray_event(TrayEventType::BalloonClick, 1));
        backend.fire_event(&make_tray_event(TrayEventType::BalloonClose, 1));
        assert_eq!(
            *types.lock().unwrap(),
            vec![
                TrayEventType::BalloonShow,
                TrayEventType::BalloonClick,
                TrayEventType::BalloonClose
            ]
        );
        set_tray_backend(None);
    }

    // popup_tray_context_menu
    #[test]
    #[serial]
    fn popup_tray_context_menu_without_position() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        popup_tray_context_menu(tray, None);
        assert!(backend.last_popup_position().is_none());
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn popup_tray_context_menu_at_position() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        popup_tray_context_menu(tray, Some(Vector2Like { x: 200.0, y: 50.0 }));
        assert_eq!(
            backend.last_popup_position(),
            Some(Vector2Like { x: 200.0, y: 50.0 })
        );
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn popup_tray_context_menu_no_op_on_web() {
        set_tray_backend(None);
        popup_tray_context_menu(TrayIcon { id: 0 }, Some(Vector2Like { x: 0.0, y: 0.0 }));
    }

    // remove_tray_balloon
    #[test]
    #[serial]
    fn remove_tray_balloon_removes_active_balloon() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        display_tray_balloon(
            tray,
            &TrayBalloonOptions {
                title: "T".into(),
                text: "B".into(),
                ..Default::default()
            },
        );
        remove_tray_balloon(tray);
        assert!(backend.balloon_of(tray.id).is_none());
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn remove_tray_balloon_no_op_on_web() {
        set_tray_backend(None);
        remove_tray_balloon(TrayIcon { id: 0 });
    }

    // set_tray_backend
    #[test]
    #[serial]
    fn set_tray_backend_installs_custom() {
        let _backend = install_fake();
        assert!(create_tray_icon(&TrayIconOptions::default()).is_some());
        set_tray_backend(None);
    }

    // set_tray_icon
    #[test]
    #[serial]
    fn set_tray_icon_updates_icon_at_runtime() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions {
            icon: Some("idle.png".into()),
            ..Default::default()
        })
        .unwrap();
        set_tray_icon(tray, "active.png");
        assert_eq!(backend.icon_of(tray.id), "active.png");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn set_tray_icon_no_op_on_web() {
        set_tray_backend(None);
        set_tray_icon(TrayIcon { id: 0 }, "icon.png");
    }

    // set_tray_icon_context_menu
    #[test]
    #[serial]
    fn set_tray_icon_context_menu_does_not_panic() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_icon_context_menu(tray, &[]);
        set_tray_backend(None);
    }

    // set_tray_icon_template
    #[test]
    #[serial]
    fn set_tray_icon_template_marks_template() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_icon_template(tray, true);
        assert!(backend.is_template_of(tray.id));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn set_tray_icon_template_clears_template() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions {
            icon_template: Some(true),
            ..Default::default()
        })
        .unwrap();
        set_tray_icon_template(tray, false);
        assert!(!backend.is_template_of(tray.id));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn set_tray_icon_template_no_op_on_web() {
        set_tray_backend(None);
        set_tray_icon_template(TrayIcon { id: 0 }, true);
    }

    // set_tray_icon_title
    #[test]
    #[serial]
    fn set_tray_icon_title_does_not_panic_on_web() {
        set_tray_backend(None);
        set_tray_icon_title(TrayIcon { id: 0 }, "My App");
    }

    // set_tray_icon_tooltip
    #[test]
    #[serial]
    fn set_tray_icon_tooltip_does_not_panic_on_web() {
        set_tray_backend(None);
        set_tray_icon_tooltip(TrayIcon { id: 0 }, "Open");
    }

    // set_tray_ignore_double_click_events
    #[test]
    #[serial]
    fn set_tray_ignore_double_click_events_sets_flag() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_ignore_double_click_events(tray, true);
        assert!(backend.ignore_double_click_of(tray.id));
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn set_tray_ignore_double_click_events_no_op_on_web() {
        set_tray_backend(None);
        set_tray_ignore_double_click_events(TrayIcon { id: 0 }, true);
    }

    // set_tray_pressed_icon
    #[test]
    #[serial]
    fn set_tray_pressed_icon_sets_image() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        set_tray_pressed_icon(tray, "pressed.png");
        assert_eq!(backend.pressed_icon_of(tray.id), "pressed.png");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn set_tray_pressed_icon_no_op_on_web() {
        set_tray_backend(None);
        set_tray_pressed_icon(TrayIcon { id: 0 }, "pressed.png");
    }

    // start_tray_icon_animation
    #[test]
    #[serial]
    fn start_tray_icon_animation_sets_initial_frame_immediately() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions {
            icon: Some("frame0.png".into()),
            ..Default::default()
        })
        .unwrap();
        let frames = vec![
            "frame0.png".to_string(),
            "frame1.png".to_string(),
            "frame2.png".to_string(),
        ];
        let stop = start_tray_icon_animation(tray, &frames, 100_000);
        // Initial frame is set synchronously before the timer; the long interval
        // guarantees no later frame has fired yet.
        assert_eq!(backend.icon_of(tray.id), "frame0.png");
        stop();
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn start_tray_icon_animation_cycles_frames() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions {
            icon: Some("frame0.png".into()),
            ..Default::default()
        })
        .unwrap();
        let frames = vec!["frame0.png".to_string(), "frame1.png".to_string()];
        let stop = start_tray_icon_animation(tray, &frames, 20);
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(backend.icon_of(tray.id), "frame1.png");
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(backend.icon_of(tray.id), "frame0.png");
        stop();
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn start_tray_icon_animation_stop_cancels() {
        let backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let frames = vec!["a.png".to_string(), "b.png".to_string()];
        let stop = start_tray_icon_animation(tray, &frames, 20);
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(backend.icon_of(tray.id), "b.png");
        stop();
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(backend.icon_of(tray.id), "b.png");
        set_tray_backend(None);
    }

    #[test]
    #[serial]
    fn start_tray_icon_animation_no_op_stop_for_empty_frames() {
        let _backend = install_fake();
        let tray = create_tray_icon(&TrayIconOptions::default()).unwrap();
        let stop = start_tray_icon_animation(tray, &[], 100);
        stop();
        set_tray_backend(None);
    }
}
