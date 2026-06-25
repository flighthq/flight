//! ApplicationWindow — OS window entity, backend trait, and all window commands.
//!
//! The [`ApplicationWindow`] type (defined in `flighthq-types`) holds logical
//! window state. Window signals live in an [`ApplicationWindowSignals`] companion
//! that callers create alongside the window and pass into attach/detach helpers.
//! This keeps `ApplicationWindow` `Clone` (no `Arc<Mutex<…>>` in the entity) while
//! giving the application layer full event coverage.
//!
//! Veto model: the TS reference vetoes a close by calling `cancelSignal` and
//! reading `signal.data.cancelled` after the emit. The Rust signals model resets
//! its cancellation flag at the end of each emit, so a post-emit veto must live
//! in the payload instead. `on_close_request` therefore carries a
//! [`WindowCloseRequest`] whose `cancel()` a listener calls to veto; the command
//! functions read it after emitting.

use flighthq_signals::{Signal, emit_signal};
use flighthq_types::{ApplicationWindow, Matrix, RenderState, WindowBounds, WindowOptions};
use std::cell::Cell;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// WindowBackend trait
// ---------------------------------------------------------------------------

/// Control seam for windowing: a host backend that the window command functions
/// delegate to. The native-default backend (winit/tao, installed by a host)
/// maps each [`ApplicationWindow`] to a real OS window. Every method takes the
/// target window so the seam supports multiple windows. The built-in default is
/// a no-op/sentinel backend so every command works headlessly.
pub trait WindowBackend: Send + Sync {
    fn open(&self, win: &mut ApplicationWindow, options: &WindowOptions) -> bool;
    fn close(&self, win: &ApplicationWindow);
    fn center(&self, win: &ApplicationWindow);
    fn focus(&self, win: &ApplicationWindow);
    /// Fills `out` with the window's screen bounds. The default backend copies
    /// the window's own logical state.
    fn get_bounds(&self, win: &ApplicationWindow, out: &mut WindowBounds);
    fn hide(&self, win: &ApplicationWindow);
    fn maximize(&self, win: &ApplicationWindow);
    fn minimize(&self, win: &ApplicationWindow);
    fn request_attention(&self, win: &ApplicationWindow, attention: bool);
    fn restore(&self, win: &ApplicationWindow);
    fn set_always_on_top(&self, win: &ApplicationWindow, always_on_top: bool);
    /// Prevents (or allows) the window contents from being captured in
    /// screenshots / screen sharing. Native only; the default is a no-op.
    fn set_content_protection(&self, win: &ApplicationWindow, enabled: bool);
    /// Briefly flashes the window frame to attract attention. Native only; the
    /// default is a no-op.
    fn flash_window_frame(&self, win: &ApplicationWindow);
    fn set_fullscreen(&self, win: &ApplicationWindow, fullscreen: bool);
    /// Shows or hides the native drop shadow around the window. macOS/native
    /// only; the default is a no-op.
    fn set_has_shadow(&self, win: &ApplicationWindow, has_shadow: bool);
    fn set_icon(&self, win: &ApplicationWindow, icon: &str);
    fn set_maximum_size(&self, win: &ApplicationWindow, width: f32, height: f32);
    fn set_menu_bar_visible(&self, win: &ApplicationWindow, visible: bool);
    fn set_minimum_size(&self, win: &ApplicationWindow, width: f32, height: f32);
    fn set_opacity(&self, win: &ApplicationWindow, opacity: f32);
    fn set_parent(&self, win: &ApplicationWindow, parent: Option<&ApplicationWindow>);
    fn set_position(&self, win: &ApplicationWindow, x: f32, y: f32);
    fn set_progress(&self, win: &ApplicationWindow, progress: f32);
    fn set_resizable(&self, win: &ApplicationWindow, resizable: bool);
    fn set_size(&self, win: &ApplicationWindow, width: f32, height: f32);
    fn set_skip_taskbar(&self, win: &ApplicationWindow, skip: bool);
    fn set_title(&self, win: &ApplicationWindow, title: &str);
    fn show(&self, win: &ApplicationWindow);
}

// ---------------------------------------------------------------------------
// WindowCloseRequest payload
// ---------------------------------------------------------------------------

/// Payload for `on_close_request`. A listener vetoes a pending close by calling
/// [`cancel`](WindowCloseRequest::cancel). Interior mutability lets a `&`-borrow
/// listener record the veto, which the command functions read after the emit.
#[derive(Debug, Default)]
pub struct WindowCloseRequest {
    cancelled: Cell<bool>,
}

impl WindowCloseRequest {
    /// Vetoes the pending close. Call from an `on_close_request` listener.
    pub fn cancel(&self) {
        self.cancelled.set(true);
    }

    /// Returns whether a listener vetoed the close.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.get()
    }
}

// ---------------------------------------------------------------------------
// ApplicationWindowSignals
// ---------------------------------------------------------------------------

/// Signals companion to [`ApplicationWindow`]. Create one alongside the window
/// and pass it into attach/detach helpers. This keeps the entity `Clone`.
#[derive(Debug, Default)]
pub struct ApplicationWindowSignals {
    pub on_activate: Signal<()>,
    pub on_close: Signal<()>,
    /// Emitted before close; a listener vetoes by calling
    /// [`WindowCloseRequest::cancel`] on the payload.
    pub on_close_request: Signal<WindowCloseRequest>,
    pub on_deactivate: Signal<()>,
    pub on_drop_file: Signal<String>,
    pub on_focus_in: Signal<()>,
    pub on_focus_out: Signal<()>,
    pub on_fullscreen_changed: Signal<()>,
    pub on_maximize: Signal<()>,
    pub on_minimize: Signal<()>,
    pub on_move: Signal<()>,
    pub on_orientation_changed: Signal<()>,
    pub on_render_context_lost: Signal<()>,
    pub on_render_context_restored: Signal<()>,
    pub on_resize: Signal<()>,
    pub on_restore: Signal<()>,
}

// ---------------------------------------------------------------------------
// attach_* / detach_* — event wiring
// ---------------------------------------------------------------------------
//
// The TS reference wires these to DOM events on the page window / a canvas /
// document. The Rust application layer has no DOM; OS-originated events are
// delivered by the native window backend, which is installed by a host and is
// not yet built. Each attach therefore records a cleanup slot in a per-window
// observer registry (keyed by window kind), so detach/dispose are meaningful and
// idempotent today, and returns a `WindowEventGuard` whose drop also clears the
// slot. When the native event source lands, the subscription is registered here.

/// Wires platform close events to `signals.on_close_request` and
/// `signals.on_close`. Idempotent: a prior close wiring is cleared first.
/// Returns a [`WindowEventGuard`]; drop it (or call [`detach_window_close`]) to
/// detach.
pub fn attach_window_close(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Close)
}

/// Wires drag-and-drop file events for the given surface handle to
/// `signals.on_drop_file`. `surface_id` is an opaque native-surface identifier.
pub fn attach_window_drop_file(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
    _surface_id: u64,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::DropFile)
}

/// Wires focus-in / focus-out events to the corresponding signals.
pub fn attach_window_focus(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
    _surface_id: u64,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Focus)
}

/// Wires fullscreen-change events to `signals.on_fullscreen_changed`.
pub fn attach_window_fullscreen(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Fullscreen)
}

/// Wires OS/screen-originated window-move events to `signals.on_move`. The TS
/// reference best-effort-wires this to the browser `resize` event (no reliable
/// page-move event exists); on native the move source is the host window
/// backend, installed later. Records a per-window observer slot so detach/dispose
/// are meaningful today. Idempotent: a prior move wiring is cleared first.
pub fn attach_window_move(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Move)
}

/// Wires device orientation-change events to `signals.on_orientation_changed`.
pub fn attach_window_orientation(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Orientation)
}

/// Wires render-context-lost / restored events to the corresponding signals.
pub fn attach_window_render_context(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::RenderContext)
}

/// Binds `state` to `win`'s device-pixel-ratio: writes the device transform into
/// `state.render_transform_2d`. Mirrors the TS `apply()` step that writes the
/// transform; the backing-store sizing in TS is a canvas/DOM concern with no
/// Rust equivalent here. Pair with [`attach_window_resize`], the source of
/// size/DPI updates. The render state must have an initialized
/// `render_transform_2d`.
pub fn attach_window_render_state(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
    state: &mut RenderState,
) -> WindowEventGuard {
    if let Some(ref mut transform) = state.render_transform_2d {
        compute_window_device_transform(win, transform);
    }
    attach_observer(win, ObserverKind::RenderState)
}

/// Observes the platform resize source and writes `win.width`, `win.height`,
/// and `win.device_pixel_ratio`, then emits `signals.on_resize`.
pub fn attach_window_resize(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
    _surface_id: u64,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Resize)
}

/// Wires platform visibility-change events to `signals.on_activate` /
/// `signals.on_deactivate`.
pub fn attach_window_visibility(
    win: &ApplicationWindow,
    _signals: &ApplicationWindowSignals,
) -> WindowEventGuard {
    attach_observer(win, ObserverKind::Visibility)
}

// ---------------------------------------------------------------------------
// detach_* wrappers — explicit named detach for each event kind
// ---------------------------------------------------------------------------

/// Detaches the close event wiring from [`attach_window_close`].
pub fn detach_window_close(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the drop-file event wiring from [`attach_window_drop_file`].
pub fn detach_window_drop_file(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the focus event wiring from [`attach_window_focus`].
pub fn detach_window_focus(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the fullscreen event wiring from [`attach_window_fullscreen`].
pub fn detach_window_fullscreen(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the move event wiring from [`attach_window_move`].
pub fn detach_window_move(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the orientation event wiring from [`attach_window_orientation`].
pub fn detach_window_orientation(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the render-context wiring from [`attach_window_render_context`].
pub fn detach_window_render_context(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the render-state wiring from [`attach_window_render_state`].
pub fn detach_window_render_state(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the resize wiring from [`attach_window_resize`].
pub fn detach_window_resize(guard: WindowEventGuard) {
    drop(guard);
}

/// Detaches the visibility wiring from [`attach_window_visibility`].
pub fn detach_window_visibility(guard: WindowEventGuard) {
    drop(guard);
}

// ---------------------------------------------------------------------------
// Window commands
// ---------------------------------------------------------------------------

/// Centers the window on its current display via the backend.
pub fn center_window(win: &ApplicationWindow) {
    get_window_backend().center(win);
}

/// Closes the window. Emits `on_close_request` first; if a listener vetoed the
/// close (via [`WindowCloseRequest::cancel`]) returns `false`. Otherwise the
/// backend closes the window, `on_close` fires, and returns `true`.
pub fn close_window(win: &mut ApplicationWindow, signals: &ApplicationWindowSignals) -> bool {
    if !request_window_close(win, signals) {
        return false;
    }
    get_window_backend().close(win);
    emit_signal(&signals.on_close, &());
    true
}

/// Writes the window's device transform — a uniform scale by
/// `device_pixel_ratio` — into `out` and returns a mutable reference. Reads all
/// `win` fields before writing `out`, so `out` may alias derived data safely.
pub fn compute_window_device_transform<'a>(
    win: &ApplicationWindow,
    out: &'a mut Matrix,
) -> &'a mut Matrix {
    let scale = win.device_pixel_ratio;
    out.a = scale;
    out.b = 0.0;
    out.c = 0.0;
    out.d = scale;
    out.tx = 0.0;
    out.ty = 0.0;
    out
}

/// Creates a new [`ApplicationWindow`] with sensible defaults.
pub fn create_application_window() -> ApplicationWindow {
    ApplicationWindow::default()
}

/// Creates a new [`ApplicationWindowSignals`] companion with all signals
/// initialized.
pub fn create_application_window_signals() -> ApplicationWindowSignals {
    ApplicationWindowSignals::default()
}

/// Builds the built-in default window backend: a no-op/sentinel backend that
/// keeps every window command working headlessly. Native hosts replace it via
/// [`set_window_backend`]. The TS reference's `createWebWindowBackend` covers
/// browser capabilities; the Rust default is the no-op floor a native host
/// builds on.
pub fn create_native_window_backend() -> Arc<dyn WindowBackend> {
    Arc::new(NativeNoOpWindowBackend)
}

/// Disposes all observer wiring registered for `win` and clears its registry
/// entry. After this call the window's attached observers no longer fire.
pub fn dispose_application_window(win: &ApplicationWindow) {
    let mut guard = observers().lock().expect("window observers mutex poisoned");
    guard.remove(&window_key(win));
}

/// Briefly flashes the window frame to attract attention. No-op on the default
/// backend; native hosts implement it (e.g. Electron `flashFrame(true)`).
pub fn flash_window_frame(win: &ApplicationWindow) {
    get_window_backend().flash_window_frame(win);
}

/// Brings the window to the foreground and marks it focused.
pub fn focus_window(win: &mut ApplicationWindow) {
    win.focused = true;
    get_window_backend().focus(win);
}

/// Returns the active window backend. Falls back to the built-in native default
/// (a no-op/sentinel backend) when no backend has been installed.
pub fn get_window_backend() -> Arc<dyn WindowBackend> {
    let mut guard = backend().lock().expect("window backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_window_backend());
    }
    Arc::clone(guard.as_ref().expect("backend initialized above"))
}

/// Fills `out` with the window's current screen bounds and returns a mutable
/// reference to it.
pub fn get_window_bounds<'a>(
    win: &ApplicationWindow,
    out: &'a mut WindowBounds,
) -> &'a mut WindowBounds {
    get_window_backend().get_bounds(win, out);
    out
}

/// Returns the index of the display (screen) the window is currently on, or
/// `-1` if unknown. Seam: the default returns `-1` (no native screen API wired);
/// native backends resolve the display and return its index.
pub fn get_window_display(_win: &ApplicationWindow) -> i32 {
    -1
}

/// Hides the window without closing it. No-op when already hidden.
pub fn hide_window(win: &mut ApplicationWindow) {
    if !win.visible {
        return;
    }
    win.visible = false;
    get_window_backend().hide(win);
}

/// Maximizes the window. Updates state and emits `on_maximize` when the state
/// changes. No-op when already maximized.
pub fn maximize_window(win: &mut ApplicationWindow, signals: &ApplicationWindowSignals) {
    if win.maximized {
        return;
    }
    win.maximized = true;
    get_window_backend().maximize(win);
    emit_signal(&signals.on_maximize, &());
}

/// Minimizes the window. Updates state and emits `on_minimize` when the state
/// changes. No-op when already minimized.
pub fn minimize_window(win: &mut ApplicationWindow, signals: &ApplicationWindowSignals) {
    if win.minimized {
        return;
    }
    win.minimized = true;
    get_window_backend().minimize(win);
    emit_signal(&signals.on_minimize, &());
}

/// Opens (or configures) the window from `options`, applying each provided
/// field and delegating to the backend. Returns whether a window was opened.
pub fn open_window(win: &mut ApplicationWindow, options: &WindowOptions) -> bool {
    if let Some(ref t) = options.title {
        win.title = t.clone();
    }
    if let Some(v) = options.x {
        win.x = v;
    }
    if let Some(v) = options.y {
        win.y = v;
    }
    if let Some(v) = options.width {
        win.width = v;
    }
    if let Some(v) = options.height {
        win.height = v;
    }
    if let Some(v) = options.resizable {
        win.resizable = v;
    }
    if let Some(v) = options.always_on_top {
        win.always_on_top = v;
    }
    if let Some(v) = options.fullscreen {
        win.fullscreen = v;
    }
    if let Some(v) = options.minimized {
        win.minimized = v;
    }
    if let Some(v) = options.maximized {
        win.maximized = v;
    }
    if let Some(v) = options.visible {
        win.visible = v;
    }
    if let Some(v) = options.min_width {
        win.min_width = v;
    }
    if let Some(v) = options.min_height {
        win.min_height = v;
    }
    if let Some(v) = options.max_width {
        win.max_width = v;
    }
    if let Some(v) = options.max_height {
        win.max_height = v;
    }
    let result = get_window_backend().open(win, options);
    // Apply center after open so the backend has registered the OS window first.
    if options.center {
        center_window(win);
    }
    result
}

/// Requests user attention on the window (taskbar flash / dock bounce). Pass
/// `false` to cancel.
pub fn request_window_attention(win: &ApplicationWindow, attention: bool) {
    get_window_backend().request_attention(win, attention);
}

/// Emits `on_close_request` and returns whether the close may proceed.
/// Returns `false` when a listener vetoed via [`WindowCloseRequest::cancel`].
pub fn request_window_close(_win: &ApplicationWindow, signals: &ApplicationWindowSignals) -> bool {
    let request = WindowCloseRequest::default();
    emit_signal(&signals.on_close_request, &request);
    !request.is_cancelled()
}

/// Restores the window from a minimized or maximized state. Emits `on_restore`
/// when the state changed.
pub fn restore_window(win: &mut ApplicationWindow, signals: &ApplicationWindowSignals) {
    if !win.minimized && !win.maximized {
        return;
    }
    win.minimized = false;
    win.maximized = false;
    get_window_backend().restore(win);
    emit_signal(&signals.on_restore, &());
}

/// Sets whether the window floats above others.
pub fn set_window_always_on_top(win: &mut ApplicationWindow, always_on_top: bool) {
    win.always_on_top = always_on_top;
    get_window_backend().set_always_on_top(win, always_on_top);
}

/// Installs a native host window backend. Pass `None` to fall back to the
/// built-in native default.
pub fn set_window_backend(new_backend: Option<Arc<dyn WindowBackend>>) {
    let mut guard = backend().lock().expect("window backend mutex poisoned");
    *guard = new_backend;
}

/// Prevents (or allows) the window contents from being captured in screenshots
/// or screen sharing. No-op on the default backend; native hosts implement it.
pub fn set_window_content_protection(win: &ApplicationWindow, enabled: bool) {
    get_window_backend().set_content_protection(win, enabled);
}

/// Sets fullscreen state. Updates state and emits `on_fullscreen_changed` when
/// the state changes. No-op when the state is already as requested.
pub fn set_window_fullscreen(
    win: &mut ApplicationWindow,
    signals: &ApplicationWindowSignals,
    fullscreen: bool,
) {
    if win.fullscreen == fullscreen {
        return;
    }
    win.fullscreen = fullscreen;
    get_window_backend().set_fullscreen(win, fullscreen);
    emit_signal(&signals.on_fullscreen_changed, &());
}

/// Shows or hides the native drop shadow around the window. macOS/native only;
/// no-op on the default backend.
pub fn set_window_has_shadow(win: &ApplicationWindow, has_shadow: bool) {
    get_window_backend().set_has_shadow(win, has_shadow);
}

/// Sets the window icon path. On native this updates the real OS icon.
pub fn set_window_icon(win: &mut ApplicationWindow, icon: &str) {
    win.icon = icon.to_owned();
    get_window_backend().set_icon(win, icon);
}

/// Sets the maximum window size in logical pixels (`-1.0` for unbounded).
pub fn set_window_maximum_size(win: &mut ApplicationWindow, width: f32, height: f32) {
    win.max_width = width;
    win.max_height = height;
    get_window_backend().set_maximum_size(win, width, height);
}

/// Shows or hides the window's menu bar. Native hosts only; no-op otherwise.
pub fn set_window_menu_bar_visible(win: &ApplicationWindow, visible: bool) {
    get_window_backend().set_menu_bar_visible(win, visible);
}

/// Sets the minimum window size in logical pixels.
pub fn set_window_minimum_size(win: &mut ApplicationWindow, width: f32, height: f32) {
    win.min_width = width;
    win.min_height = height;
    get_window_backend().set_minimum_size(win, width, height);
}

/// Sets the window opacity in `[0.0, 1.0]`.
pub fn set_window_opacity(win: &mut ApplicationWindow, opacity: f32) {
    win.opacity = opacity;
    get_window_backend().set_opacity(win, opacity);
}

/// Sets the window's parent (for modal/child relationships). Pass `None` to
/// detach. Native hosts only.
pub fn set_window_parent(win: &ApplicationWindow, parent: Option<&ApplicationWindow>) {
    get_window_backend().set_parent(win, parent);
}

/// Moves the window's top-left to `(x, y)` in screen coordinates. Updates
/// state and emits `on_move`.
pub fn set_window_position(
    win: &mut ApplicationWindow,
    signals: &ApplicationWindowSignals,
    x: f32,
    y: f32,
) {
    win.x = x;
    win.y = y;
    get_window_backend().set_position(win, x, y);
    emit_signal(&signals.on_move, &());
}

/// Sets the taskbar/dock progress indicator in `[0.0, 1.0]`; a negative value
/// clears it.
pub fn set_window_progress(win: &ApplicationWindow, progress: f32) {
    get_window_backend().set_progress(win, progress);
}

/// Sets whether the user can resize the window.
pub fn set_window_resizable(win: &mut ApplicationWindow, resizable: bool) {
    win.resizable = resizable;
    get_window_backend().set_resizable(win, resizable);
}

/// Resizes the window to `width × height` (logical pixels). Updates state and
/// emits `on_resize`.
pub fn set_window_size(
    win: &mut ApplicationWindow,
    signals: &ApplicationWindowSignals,
    width: f32,
    height: f32,
) {
    win.width = width;
    win.height = height;
    get_window_backend().set_size(win, width, height);
    emit_signal(&signals.on_resize, &());
}

/// Sets whether the window is hidden from the taskbar/dock switcher.
pub fn set_window_skip_taskbar(win: &mut ApplicationWindow, skip: bool) {
    win.skip_taskbar = skip;
    get_window_backend().set_skip_taskbar(win, skip);
}

/// Sets the window title text.
pub fn set_window_title(win: &mut ApplicationWindow, title: &str) {
    win.title = title.to_owned();
    get_window_backend().set_title(win, title);
}

/// Shows a hidden window. No-op when already visible.
pub fn show_window(win: &mut ApplicationWindow) {
    if win.visible {
        return;
    }
    win.visible = true;
    get_window_backend().show(win);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Opaque guard returned by every `attach_window_*` function. Drop it to
/// detach the corresponding event wiring.
pub struct WindowEventGuard {
    window: usize,
    kind: ObserverKind,
}

impl Drop for WindowEventGuard {
    fn drop(&mut self) {
        let mut guard = observers().lock().expect("window observers mutex poisoned");
        if let Some(kinds) = guard.get_mut(&self.window) {
            kinds.remove(&self.kind);
            if kinds.is_empty() {
                guard.remove(&self.window);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Observer registry, backend registry, default backend
// ---------------------------------------------------------------------------
//
// `ApplicationWindow` is a plain `Clone` entity with no identity field, so the
// per-window observer set is kept in a side table keyed by the entity's address
// (the convention `flighthq-lifecycle` uses). attach records the kind; the
// returned guard's drop, detach, and dispose remove it. The native event source
// that drives these observers is installed by a host backend in a later wave.

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum ObserverKind {
    Close,
    DropFile,
    Focus,
    Fullscreen,
    Move,
    Orientation,
    RenderContext,
    RenderState,
    Resize,
    Visibility,
}

fn attach_observer(win: &ApplicationWindow, kind: ObserverKind) -> WindowEventGuard {
    let key = window_key(win);
    let mut guard = observers().lock().expect("window observers mutex poisoned");
    guard.entry(key).or_default().insert(kind);
    WindowEventGuard { window: key, kind }
}

fn backend() -> &'static Mutex<Option<Arc<dyn WindowBackend>>> {
    static BACKEND: Mutex<Option<Arc<dyn WindowBackend>>> = Mutex::new(None);
    &BACKEND
}

fn observers() -> &'static Mutex<HashMap<usize, std::collections::HashSet<ObserverKind>>> {
    OBSERVERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn window_key(win: &ApplicationWindow) -> usize {
    win as *const ApplicationWindow as usize
}

static OBSERVERS: std::sync::OnceLock<
    Mutex<HashMap<usize, std::collections::HashSet<ObserverKind>>>,
> = std::sync::OnceLock::new();

/// Built-in default backend: every command is a no-op and `get_bounds` reports
/// the window's own logical state. Native hosts replace it via
/// [`set_window_backend`].
struct NativeNoOpWindowBackend;

impl WindowBackend for NativeNoOpWindowBackend {
    fn open(&self, _win: &mut ApplicationWindow, _options: &WindowOptions) -> bool {
        false
    }
    fn close(&self, _win: &ApplicationWindow) {}
    fn center(&self, _win: &ApplicationWindow) {}
    fn focus(&self, _win: &ApplicationWindow) {}
    fn get_bounds(&self, win: &ApplicationWindow, out: &mut WindowBounds) {
        out.x = win.x;
        out.y = win.y;
        out.width = win.width;
        out.height = win.height;
    }
    fn hide(&self, _win: &ApplicationWindow) {}
    fn maximize(&self, _win: &ApplicationWindow) {}
    fn minimize(&self, _win: &ApplicationWindow) {}
    fn request_attention(&self, _win: &ApplicationWindow, _attention: bool) {}
    fn restore(&self, _win: &ApplicationWindow) {}
    fn set_always_on_top(&self, _win: &ApplicationWindow, _always_on_top: bool) {}
    fn set_content_protection(&self, _win: &ApplicationWindow, _enabled: bool) {}
    fn flash_window_frame(&self, _win: &ApplicationWindow) {}
    fn set_fullscreen(&self, _win: &ApplicationWindow, _fullscreen: bool) {}
    fn set_has_shadow(&self, _win: &ApplicationWindow, _has_shadow: bool) {}
    fn set_icon(&self, _win: &ApplicationWindow, _icon: &str) {}
    fn set_maximum_size(&self, _win: &ApplicationWindow, _width: f32, _height: f32) {}
    fn set_menu_bar_visible(&self, _win: &ApplicationWindow, _visible: bool) {}
    fn set_minimum_size(&self, _win: &ApplicationWindow, _width: f32, _height: f32) {}
    fn set_opacity(&self, _win: &ApplicationWindow, _opacity: f32) {}
    fn set_parent(&self, _win: &ApplicationWindow, _parent: Option<&ApplicationWindow>) {}
    fn set_position(&self, _win: &ApplicationWindow, _x: f32, _y: f32) {}
    fn set_progress(&self, _win: &ApplicationWindow, _progress: f32) {}
    fn set_resizable(&self, _win: &ApplicationWindow, _resizable: bool) {}
    fn set_size(&self, _win: &ApplicationWindow, _width: f32, _height: f32) {}
    fn set_skip_taskbar(&self, _win: &ApplicationWindow, _skip: bool) {}
    fn set_title(&self, _win: &ApplicationWindow, _title: &str) {}
    fn show(&self, _win: &ApplicationWindow) {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // A recording backend mirroring the TS `recordingWindowBackend`.
    #[derive(Default)]
    struct RecordingBackend {
        calls: Mutex<Vec<String>>,
    }

    impl RecordingBackend {
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
        fn push(&self, s: impl Into<String>) {
            self.calls.lock().unwrap().push(s.into());
        }
    }

    impl WindowBackend for RecordingBackend {
        fn open(&self, _win: &mut ApplicationWindow, options: &WindowOptions) -> bool {
            self.push(format!(
                "open:{}",
                options.title.clone().unwrap_or_default()
            ));
            true
        }
        fn close(&self, _win: &ApplicationWindow) {
            self.push("close");
        }
        fn center(&self, _win: &ApplicationWindow) {
            self.push("center");
        }
        fn focus(&self, _win: &ApplicationWindow) {
            self.push("focus");
        }
        fn get_bounds(&self, _win: &ApplicationWindow, out: &mut WindowBounds) {
            out.x = 1.0;
            out.y = 2.0;
            out.width = 3.0;
            out.height = 4.0;
        }
        fn hide(&self, _win: &ApplicationWindow) {
            self.push("hide");
        }
        fn maximize(&self, _win: &ApplicationWindow) {
            self.push("maximize");
        }
        fn minimize(&self, _win: &ApplicationWindow) {
            self.push("minimize");
        }
        fn request_attention(&self, _win: &ApplicationWindow, attention: bool) {
            self.push(format!("requestAttention:{attention}"));
        }
        fn restore(&self, _win: &ApplicationWindow) {
            self.push("restore");
        }
        fn set_always_on_top(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setAlwaysOnTop:{v}"));
        }
        fn set_content_protection(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setContentProtection:{v}"));
        }
        fn flash_window_frame(&self, _win: &ApplicationWindow) {
            self.push("flashWindowFrame");
        }
        fn set_fullscreen(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setFullscreen:{v}"));
        }
        fn set_has_shadow(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setHasShadow:{v}"));
        }
        fn set_icon(&self, _win: &ApplicationWindow, icon: &str) {
            self.push(format!("setIcon:{icon}"));
        }
        fn set_maximum_size(&self, _win: &ApplicationWindow, w: f32, h: f32) {
            self.push(format!("setMaximumSize:{w},{h}"));
        }
        fn set_menu_bar_visible(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setMenuBarVisible:{v}"));
        }
        fn set_minimum_size(&self, _win: &ApplicationWindow, w: f32, h: f32) {
            self.push(format!("setMinimumSize:{w},{h}"));
        }
        fn set_opacity(&self, _win: &ApplicationWindow, o: f32) {
            self.push(format!("setOpacity:{o}"));
        }
        fn set_parent(&self, _win: &ApplicationWindow, parent: Option<&ApplicationWindow>) {
            self.push(format!(
                "setParent:{}",
                if parent.is_none() { "null" } else { "win" }
            ));
        }
        fn set_position(&self, _win: &ApplicationWindow, x: f32, y: f32) {
            self.push(format!("setPosition:{x},{y}"));
        }
        fn set_progress(&self, _win: &ApplicationWindow, p: f32) {
            self.push(format!("setProgress:{p}"));
        }
        fn set_resizable(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setResizable:{v}"));
        }
        fn set_size(&self, _win: &ApplicationWindow, w: f32, h: f32) {
            self.push(format!("setSize:{w},{h}"));
        }
        fn set_skip_taskbar(&self, _win: &ApplicationWindow, v: bool) {
            self.push(format!("setSkipTaskbar:{v}"));
        }
        fn set_title(&self, _win: &ApplicationWindow, title: &str) {
            self.push(format!("setTitle:{title}"));
        }
        fn show(&self, _win: &ApplicationWindow) {
            self.push("show");
        }
    }

    // The backend registry is process-global; serialize backend-touching tests
    // through one Mutex so concurrent Cargo test threads don't clobber each
    // other's installed backend.
    fn with_recording_backend<R>(f: impl FnOnce(&Arc<RecordingBackend>) -> R) -> R {
        let _serial = BACKEND_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let backend = Arc::new(RecordingBackend::default());
        set_window_backend(Some(Arc::clone(&backend) as Arc<dyn WindowBackend>));
        let result = f(&backend);
        set_window_backend(None);
        result
    }

    static BACKEND_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn make_render_state() -> RenderState {
        RenderState {
            render_transform_2d: Some(Matrix::default()),
            ..Default::default()
        }
    }

    fn count_listener() -> (Arc<AtomicUsize>, Arc<dyn Fn(&()) + Send + Sync>) {
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        (
            count,
            Arc::new(move |_: &()| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
        )
    }

    #[test]
    #[serial]
    fn center_window_delegates_to_backend() {
        with_recording_backend(|backend| {
            center_window(&create_application_window());
            assert!(backend.calls().contains(&"center".to_string()));
        });
    }

    #[test]
    #[serial]
    fn close_window_closes_and_emits_when_not_vetoed() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (closed, listener) = count_listener();
            let _g = connect_signal(&signals.on_close, listener, SignalConnectOptions::default());
            assert!(close_window(&mut win, &signals));
            assert!(backend.calls().contains(&"close".to_string()));
            assert_eq!(closed.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[serial]
    fn close_window_aborts_when_listener_vetoes() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let _g = connect_signal(
                &signals.on_close_request,
                Arc::new(|req: &WindowCloseRequest| req.cancel()),
                SignalConnectOptions::default(),
            );
            assert!(!close_window(&mut win, &signals));
            assert!(!backend.calls().contains(&"close".to_string()));
        });
    }

    #[test]
    fn compute_window_device_transform_writes_uniform_scale() {
        let win = ApplicationWindow {
            device_pixel_ratio: 3.0,
            ..Default::default()
        };
        let mut m = Matrix {
            tx: 9.0,
            ty: 9.0,
            ..Default::default()
        };
        let result = compute_window_device_transform(&win, &mut m);
        assert_eq!(result.a, 3.0);
        assert_eq!(result.d, 3.0);
        assert_eq!(result.b, 0.0);
        assert_eq!(result.c, 0.0);
        assert_eq!(result.tx, 0.0);
        assert_eq!(result.ty, 0.0);
    }

    #[test]
    fn create_application_window_returns_defaults() {
        let win = create_application_window();
        assert!(win.visible);
        assert!(win.resizable);
        assert_eq!(win.device_pixel_ratio, 1.0);
        assert_eq!(win.opacity, 1.0);
        assert_eq!(win.max_width, -1.0);
        assert_eq!(win.max_height, -1.0);
    }

    #[test]
    fn create_application_window_signals_initializes_all_signals() {
        let sigs = create_application_window_signals();
        let _ = &sigs.on_activate;
        let _ = &sigs.on_close;
        let _ = &sigs.on_resize;
    }

    #[test]
    fn attach_window_render_state_writes_device_transform() {
        let mut win = create_application_window();
        win.device_pixel_ratio = 2.0;
        let signals = create_application_window_signals();
        let mut state = make_render_state();
        let g = attach_window_render_state(&win, &signals, &mut state);
        assert_eq!(state.render_transform_2d.unwrap().a, 2.0);
        assert_eq!(state.render_transform_2d.unwrap().d, 2.0);
        drop(g);
        dispose_application_window(&win);
    }

    #[test]
    fn dispose_application_window_clears_observers() {
        let win = create_application_window();
        let signals = create_application_window_signals();
        // Keep guards alive so only dispose clears the registry.
        let g1 = attach_window_fullscreen(&win, &signals);
        let g2 = attach_window_visibility(&win, &signals);
        {
            let guard = observers().lock().unwrap();
            assert_eq!(guard.get(&window_key(&win)).map(|s| s.len()), Some(2));
        }
        dispose_application_window(&win);
        {
            let guard = observers().lock().unwrap();
            assert!(guard.get(&window_key(&win)).is_none());
        }
        // Guards dropping after dispose must not panic.
        drop(g1);
        drop(g2);
    }

    #[test]
    fn detach_window_fullscreen_removes_observer() {
        let win = create_application_window();
        let signals = create_application_window_signals();
        let g = attach_window_fullscreen(&win, &signals);
        detach_window_fullscreen(g);
        let guard = observers().lock().unwrap();
        assert!(guard.get(&window_key(&win)).is_none());
    }

    #[test]
    fn attach_and_detach_window_move_manage_observer() {
        let win = create_application_window();
        let signals = create_application_window_signals();
        let g = attach_window_move(&win, &signals);
        {
            let guard = observers().lock().unwrap();
            assert!(
                guard
                    .get(&window_key(&win))
                    .unwrap()
                    .contains(&ObserverKind::Move)
            );
        }
        detach_window_move(g);
        let guard = observers().lock().unwrap();
        assert!(guard.get(&window_key(&win)).is_none());
    }

    #[test]
    #[serial]
    fn flash_window_frame_delegates() {
        with_recording_backend(|backend| {
            flash_window_frame(&create_application_window());
            assert!(backend.calls().contains(&"flashWindowFrame".to_string()));
        });
    }

    #[test]
    fn get_window_display_returns_minus_one() {
        let win = create_application_window();
        assert_eq!(get_window_display(&win), -1);
    }

    #[test]
    #[serial]
    fn focus_window_marks_focused_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            focus_window(&mut win);
            assert!(win.focused);
            assert!(backend.calls().contains(&"focus".to_string()));
        });
    }

    #[test]
    #[serial]
    fn get_window_backend_falls_back_and_returns_registered() {
        let _serial = BACKEND_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_window_backend(None);
        // Fallback default returns the window's own bounds.
        let win = ApplicationWindow {
            x: 5.0,
            y: 6.0,
            width: 7.0,
            height: 8.0,
            ..Default::default()
        };
        let mut out = WindowBounds::default();
        get_window_bounds(&win, &mut out);
        assert_eq!(out.width, 7.0);
    }

    #[test]
    #[serial]
    fn get_window_bounds_fills_from_backend() {
        with_recording_backend(|_backend| {
            let mut out = WindowBounds::default();
            let win = create_application_window();
            let result = get_window_bounds(&win, &mut out);
            assert_eq!(result.width, 3.0);
        });
    }

    #[test]
    #[serial]
    fn hide_window_marks_not_visible_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            hide_window(&mut win);
            assert!(!win.visible);
            assert!(backend.calls().contains(&"hide".to_string()));
        });
    }

    #[test]
    #[serial]
    fn maximize_window_emits_once() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (count, listener) = count_listener();
            let _g = connect_signal(
                &signals.on_maximize,
                listener,
                SignalConnectOptions::default(),
            );
            maximize_window(&mut win, &signals);
            maximize_window(&mut win, &signals);
            assert!(win.maximized);
            assert_eq!(count.load(Ordering::SeqCst), 1);
            assert!(backend.calls().contains(&"maximize".to_string()));
        });
    }

    #[test]
    #[serial]
    fn minimize_window_sets_state_and_emits() {
        with_recording_backend(|_backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (count, listener) = count_listener();
            let _g = connect_signal(
                &signals.on_minimize,
                listener,
                SignalConnectOptions::default(),
            );
            minimize_window(&mut win, &signals);
            assert!(win.minimized);
            assert_eq!(count.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[serial]
    fn open_window_applies_options_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let options = WindowOptions {
                title: Some("Game".into()),
                width: Some(640.0),
                height: Some(480.0),
                always_on_top: Some(true),
                ..Default::default()
            };
            assert!(open_window(&mut win, &options));
            assert_eq!(win.title, "Game");
            assert_eq!(win.width, 640.0);
            assert!(win.always_on_top);
            assert!(backend.calls().contains(&"open:Game".to_string()));
        });
    }

    #[test]
    #[serial]
    fn open_window_centers_when_center_option_set() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let options = WindowOptions {
                title: Some("Centered".into()),
                center: true,
                ..Default::default()
            };
            open_window(&mut win, &options);
            assert!(backend.calls().contains(&"center".to_string()));
        });
    }

    #[test]
    #[serial]
    fn open_window_does_not_center_without_option() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let options = WindowOptions {
                title: Some("Normal".into()),
                ..Default::default()
            };
            open_window(&mut win, &options);
            assert!(!backend.calls().contains(&"center".to_string()));
        });
    }

    #[test]
    #[serial]
    fn request_window_attention_delegates() {
        with_recording_backend(|backend| {
            request_window_attention(&create_application_window(), true);
            assert!(
                backend
                    .calls()
                    .contains(&"requestAttention:true".to_string())
            );
        });
    }

    #[test]
    fn request_window_close_true_when_not_vetoed() {
        let win = create_application_window();
        let signals = create_application_window_signals();
        assert!(request_window_close(&win, &signals));
    }

    #[test]
    fn request_window_close_false_when_vetoed() {
        let win = create_application_window();
        let signals = create_application_window_signals();
        let _g = connect_signal(
            &signals.on_close_request,
            Arc::new(|req: &WindowCloseRequest| req.cancel()),
            SignalConnectOptions::default(),
        );
        assert!(!request_window_close(&win, &signals));
    }

    #[test]
    #[serial]
    fn restore_window_clears_state_and_emits() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            maximize_window(&mut win, &signals);
            let (count, listener) = count_listener();
            let _g = connect_signal(
                &signals.on_restore,
                listener,
                SignalConnectOptions::default(),
            );
            restore_window(&mut win, &signals);
            assert!(!win.maximized);
            assert_eq!(count.load(Ordering::SeqCst), 1);
            assert!(backend.calls().contains(&"restore".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_always_on_top_sets_state_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_always_on_top(&mut win, true);
            assert!(win.always_on_top);
            assert!(backend.calls().contains(&"setAlwaysOnTop:true".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_backend_clears_to_fallback_when_none() {
        let _serial = BACKEND_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_window_backend(Some(Arc::new(RecordingBackend::default())));
        set_window_backend(None);
        // get_window_backend reinstalls the default; no panic, valid backend.
        let _b = get_window_backend();
    }

    #[test]
    #[serial]
    fn set_window_content_protection_delegates() {
        with_recording_backend(|backend| {
            set_window_content_protection(&create_application_window(), true);
            assert!(
                backend
                    .calls()
                    .contains(&"setContentProtection:true".to_string())
            );
        });
    }

    #[test]
    #[serial]
    fn set_window_has_shadow_delegates() {
        with_recording_backend(|backend| {
            set_window_has_shadow(&create_application_window(), false);
            assert!(backend.calls().contains(&"setHasShadow:false".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_fullscreen_emits_once() {
        with_recording_backend(|_backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (count, listener) = count_listener();
            let _g = connect_signal(
                &signals.on_fullscreen_changed,
                listener,
                SignalConnectOptions::default(),
            );
            set_window_fullscreen(&mut win, &signals, true);
            set_window_fullscreen(&mut win, &signals, true);
            assert!(win.fullscreen);
            assert_eq!(count.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[serial]
    fn set_window_icon_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_icon(&mut win, "icon.png");
            assert_eq!(win.icon, "icon.png");
            assert!(backend.calls().contains(&"setIcon:icon.png".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_maximum_size_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_maximum_size(&mut win, 1920.0, 1080.0);
            assert_eq!(win.max_width, 1920.0);
            assert_eq!(win.max_height, 1080.0);
            assert!(
                backend
                    .calls()
                    .contains(&"setMaximumSize:1920,1080".to_string())
            );
        });
    }

    #[test]
    #[serial]
    fn set_window_menu_bar_visible_delegates() {
        with_recording_backend(|backend| {
            set_window_menu_bar_visible(&create_application_window(), false);
            assert!(
                backend
                    .calls()
                    .contains(&"setMenuBarVisible:false".to_string())
            );
        });
    }

    #[test]
    #[serial]
    fn set_window_minimum_size_sets_and_delegates() {
        with_recording_backend(|_backend| {
            let mut win = create_application_window();
            set_window_minimum_size(&mut win, 320.0, 240.0);
            assert_eq!(win.min_width, 320.0);
            assert_eq!(win.min_height, 240.0);
        });
    }

    #[test]
    #[serial]
    fn set_window_opacity_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_opacity(&mut win, 0.5);
            assert_eq!(win.opacity, 0.5);
            assert!(backend.calls().contains(&"setOpacity:0.5".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_parent_delegates_with_null() {
        with_recording_backend(|backend| {
            set_window_parent(&create_application_window(), None);
            assert!(backend.calls().contains(&"setParent:null".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_position_sets_and_emits() {
        with_recording_backend(|_backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (count, listener) = count_listener();
            let _g = connect_signal(&signals.on_move, listener, SignalConnectOptions::default());
            set_window_position(&mut win, &signals, 100.0, 50.0);
            assert_eq!(win.x, 100.0);
            assert_eq!(win.y, 50.0);
            assert_eq!(count.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[serial]
    fn set_window_progress_delegates() {
        with_recording_backend(|backend| {
            set_window_progress(&create_application_window(), 0.25);
            assert!(backend.calls().contains(&"setProgress:0.25".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_resizable_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_resizable(&mut win, false);
            assert!(!win.resizable);
            assert!(backend.calls().contains(&"setResizable:false".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_size_sets_and_emits() {
        with_recording_backend(|_backend| {
            let mut win = create_application_window();
            let signals = create_application_window_signals();
            let (count, listener) = count_listener();
            let _g = connect_signal(
                &signals.on_resize,
                listener,
                SignalConnectOptions::default(),
            );
            set_window_size(&mut win, &signals, 800.0, 600.0);
            assert_eq!(win.width, 800.0);
            assert_eq!(win.height, 600.0);
            assert_eq!(count.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[serial]
    fn set_window_skip_taskbar_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_skip_taskbar(&mut win, true);
            assert!(win.skip_taskbar);
            assert!(backend.calls().contains(&"setSkipTaskbar:true".to_string()));
        });
    }

    #[test]
    #[serial]
    fn set_window_title_sets_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            set_window_title(&mut win, "My App");
            assert_eq!(win.title, "My App");
            assert!(backend.calls().contains(&"setTitle:My App".to_string()));
        });
    }

    #[test]
    #[serial]
    fn show_window_marks_visible_and_delegates() {
        with_recording_backend(|backend| {
            let mut win = create_application_window();
            hide_window(&mut win);
            show_window(&mut win);
            assert!(win.visible);
            assert!(backend.calls().contains(&"show".to_string()));
        });
    }
}
