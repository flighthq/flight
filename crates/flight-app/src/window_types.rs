use std::fmt;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_host::{NativeWindowHandle, ProviderRef};
use flight_input::HostInputPointerLockCapability;
use flight_signals::Signal;

use crate::types::{AppProviderFuture, AppUnsubscribe};

/// An application window (TS `AppWindow extends Entity`). Shared as a `Ref<AppWindow>` handle:
/// host subscriptions write the state mirror (position, size, fullscreen) back into the window, and
/// `Arc` identity is the source object identity. Commands update the mirror and emit the matching
/// signal; native providers also update it when the OS changes state.
///
/// The private fields replace the source's module side tables keyed by the window: the attached
/// host observers (in first-attach order), the terminal-close flag, and the lifecycle provider a
/// successful open/attach pinned for the eventual close.
pub struct AppWindow {
    runtime: EntityRuntimeSlot,
    /// Window title text. Reflected to the host chrome by `set_window_title`.
    pub title: String,
    /// Top-left position in screen coordinates (logical pixels).
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub device_pixel_ratio: f32,
    pub minimized: bool,
    pub maximized: bool,
    pub fullscreen: bool,
    pub focused: bool,
    pub visible: bool,
    pub resizable: bool,
    pub always_on_top: bool,
    /// Whether the window is hidden from the taskbar/dock switcher.
    pub skip_taskbar: bool,
    /// Window opacity in [0, 1]; 1 is fully opaque.
    pub opacity: f32,
    /// Icon resource path/URL shown in the title bar/taskbar. "" uses the host default.
    pub icon: String,
    /// Size constraints in logical pixels; a maximum of -1 is unbounded.
    pub min_width: f32,
    pub min_height: f32,
    pub max_width: f32,
    pub max_height: f32,
    pub on_activate: Signal<()>,
    pub on_close: Signal<()>,
    /// Emitted before the window closes; a listener calls `cancel_signal(&win.on_close_request)` to
    /// veto. `close_window`/`request_window_close` check the cancelled flag and abort when set.
    pub on_close_request: Signal<()>,
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
    pub(crate) backend: Option<HostWindowLifecycleCapability>,
    pub(crate) observers: Vec<(AppWindowObserverKey, AppUnsubscribe)>,
    pub(crate) terminal: bool,
}

/// The host observer slots a window keeps, one release each (the source's per-window symbols).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AppWindowObserverKey {
    Close,
    DropFile,
    Focus,
    Fullscreen,
    Move,
    Orientation,
    RenderState,
    Resize,
    Visibility,
}

/// Initial state for `open_window` (TS `WindowOptions`). `None` fields keep the window's current
/// value. Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WindowOptions {
    pub title: Option<String>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub resizable: Option<bool>,
    pub always_on_top: Option<bool>,
    pub fullscreen: Option<bool>,
    pub minimized: Option<bool>,
    pub maximized: Option<bool>,
    pub visible: Option<bool>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
    pub max_width: Option<f32>,
    pub max_height: Option<f32>,
    pub center: Option<bool>,
    /// Whether the window has native chrome (title bar/border). Native hosts only.
    pub frame: Option<bool>,
    /// Whether the window background is transparent. Native hosts only.
    pub transparent: Option<bool>,
}

/// Screen bounds of a window (TS `WindowBounds`). Plain record, filled by `get_window_bounds`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WindowBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Provider-bound identity of an element that can enter fullscreen (TS `FullscreenTargetHandle`, a
/// branded Entity).
#[derive(Default)]
pub struct FullscreenTargetHandle {
    runtime: EntityRuntimeSlot,
}

/// TS `HostElementFullscreenCapability`: element fullscreen requests and change notifications.
#[derive(Clone)]
pub struct HostElementFullscreenCapability {
    pub provider: ProviderRef,
    pub exit: Arc<dyn Fn() -> AppProviderFuture<bool> + Send + Sync>,
    pub request: Arc<dyn Fn(&Ref<FullscreenTargetHandle>) -> AppProviderFuture<bool> + Send + Sync>,
    pub subscribe:
        Option<Arc<dyn Fn(Arc<dyn Fn(bool) + Send + Sync>) -> AppUnsubscribe + Send + Sync>>,
}

/// Host fullscreen capability group (TS `HostFullscreenCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostFullscreenCapabilities {
    pub element: Option<HostElementFullscreenCapability>,
}

/// Who owns an attached existing window (TS `WindowAttachmentOwnership`). Host-owned windows are
/// detached from Flight on close but left alive; Flight-owned windows are closed by the provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowAttachmentOwnership {
    Host,
    Flight,
}

/// Provider-bound identity for the element whose content box drives `attach_window_resize` (TS
/// `WindowResizeTargetHandle`, a branded Entity). The web host maps it to an Element; neutral
/// contracts never name DOM.
#[derive(Default)]
pub struct WindowResizeTargetHandle {
    runtime: EntityRuntimeSlot,
}

/// Caller-owned pointer-lock state (D5). It replaces the source's module-level
/// `_pointerLockBackend`: a successful `lock_app_input_pointer` pins the provider here, so the next
/// `exit_app_input_pointer_lock` reaches the provider that acquired the lock.
#[derive(Clone, Default)]
pub struct AppPointerLockState {
    pub(crate) backend: Option<HostInputPointerLockCapability>,
}

/// A host listener for a window close request: returns whether a listener vetoed the close.
pub type WindowCloseRequestListener = Arc<dyn Fn() -> bool + Send + Sync>;

/// A host listener for host-originated window movement, with the new position.
pub type WindowMoveListener = Arc<dyn Fn(f32, f32) + Send + Sync>;

/// A host listener for a content-box resize, with width, height and device pixel ratio.
pub type WindowResizeListener = Arc<dyn Fn(f32, f32, f32) + Send + Sync>;

/// A host listener for visibility changes.
pub type WindowVisibilityListener = Arc<dyn Fn(bool) + Send + Sync>;

/// TS `HostWindowAppearanceCapability`. `None` = the source's omitted optional method.
#[derive(Clone)]
pub struct HostWindowAppearanceCapability {
    pub provider: ProviderRef,
    pub set_icon: Option<Arc<dyn Fn(&Ref<AppWindow>, &str) + Send + Sync>>,
    pub set_opacity: Option<Arc<dyn Fn(&Ref<AppWindow>, f32) + Send + Sync>>,
    pub set_title: Arc<dyn Fn(&Ref<AppWindow>, &str) + Send + Sync>,
}

/// TS `HostWindowAttachCapability`.
#[derive(Clone)]
pub struct HostWindowAttachCapability {
    pub provider: ProviderRef,
    pub attach: Arc<
        dyn Fn(&Ref<AppWindow>, &NativeWindowHandle, WindowAttachmentOwnership) -> bool
            + Send
            + Sync,
    >,
}

/// TS `HostWindowAttentionCapability`.
#[derive(Clone)]
pub struct HostWindowAttentionCapability {
    pub provider: ProviderRef,
    pub flash_window_frame: Option<Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>>,
    pub request_attention: Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>,
}

/// TS `HostWindowContentProtectionCapability`.
#[derive(Clone)]
pub struct HostWindowContentProtectionCapability {
    pub provider: ProviderRef,
    pub set_content_protection: Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>,
}

/// TS `HostWindowFocusCapability`.
#[derive(Clone)]
pub struct HostWindowFocusCapability {
    pub provider: ProviderRef,
    pub focus: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
}

/// TS `HostWindowFullscreenCapability`.
#[derive(Clone)]
pub struct HostWindowFullscreenCapability {
    pub provider: ProviderRef,
    pub set_fullscreen: Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>,
}

/// TS `HostWindowGeometryCapability`. The provider fills `out` for `get_bounds` (D9b).
#[derive(Clone)]
pub struct HostWindowGeometryCapability {
    pub provider: ProviderRef,
    pub center: Option<Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>>,
    pub get_bounds: Arc<dyn Fn(&mut WindowBounds, &Ref<AppWindow>) + Send + Sync>,
    pub set_position: Arc<dyn Fn(&Ref<AppWindow>, f32, f32) + Send + Sync>,
    pub set_size: Arc<dyn Fn(&Ref<AppWindow>, f32, f32) + Send + Sync>,
    pub subscribe_move: Option<Arc<dyn Fn(WindowMoveListener) -> AppUnsubscribe + Send + Sync>>,
    pub subscribe_resize: Option<
        Arc<
            dyn Fn(&Ref<WindowResizeTargetHandle>, WindowResizeListener) -> AppUnsubscribe
                + Send
                + Sync,
        >,
    >,
}

/// TS `HostWindowHierarchyCapability`. `None` parent detaches.
#[derive(Clone)]
pub struct HostWindowHierarchyCapability {
    pub provider: ProviderRef,
    pub set_parent: Arc<dyn Fn(&Ref<AppWindow>, Option<&Ref<AppWindow>>) + Send + Sync>,
}

/// TS `HostWindowLifecycleCapability`.
#[derive(Clone)]
pub struct HostWindowLifecycleCapability {
    pub provider: ProviderRef,
    pub close: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
    pub open: Arc<dyn Fn(&Ref<AppWindow>, &WindowOptions) -> bool + Send + Sync>,
    pub subscribe_close: Option<
        Arc<
            dyn Fn(WindowCloseRequestListener, Arc<dyn Fn() + Send + Sync>) -> AppUnsubscribe
                + Send
                + Sync,
        >,
    >,
}

/// TS `HostWindowProgressCapability`. A negative progress clears the indicator.
#[derive(Clone)]
pub struct HostWindowProgressCapability {
    pub provider: ProviderRef,
    pub set_progress: Arc<dyn Fn(&Ref<AppWindow>, f32) + Send + Sync>,
}

/// TS `HostWindowShadowCapability`.
#[derive(Clone)]
pub struct HostWindowShadowCapability {
    pub provider: ProviderRef,
    pub set_has_shadow: Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>,
}

/// TS `HostWindowShellCapability`.
#[derive(Clone)]
pub struct HostWindowShellCapability {
    pub provider: ProviderRef,
    pub set_menu_bar_visible: Option<Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>>,
    pub set_skip_taskbar: Option<Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>>,
}

/// TS `HostWindowSizeConstraintsCapability`. `set_resizable` is `None` when the host cannot change
/// resizability after open (web).
#[derive(Clone)]
pub struct HostWindowSizeConstraintsCapability {
    pub provider: ProviderRef,
    pub set_maximum_size: Arc<dyn Fn(&Ref<AppWindow>, f32, f32) + Send + Sync>,
    pub set_minimum_size: Arc<dyn Fn(&Ref<AppWindow>, f32, f32) + Send + Sync>,
    pub set_resizable: Option<Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>>,
}

/// TS `HostWindowStateCapability`.
#[derive(Clone)]
pub struct HostWindowStateCapability {
    pub provider: ProviderRef,
    pub maximize: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
    pub minimize: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
    pub restore: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
}

/// TS `HostWindowVisibilityCapability`.
#[derive(Clone)]
pub struct HostWindowVisibilityCapability {
    pub provider: ProviderRef,
    pub hide: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
    pub show: Arc<dyn Fn(&Ref<AppWindow>) + Send + Sync>,
    pub subscribe_visibility:
        Option<Arc<dyn Fn(WindowVisibilityListener) -> AppUnsubscribe + Send + Sync>>,
}

/// TS `HostWindowZOrderCapability`.
#[derive(Clone)]
pub struct HostWindowZOrderCapability {
    pub provider: ProviderRef,
    pub set_always_on_top: Arc<dyn Fn(&Ref<AppWindow>, bool) + Send + Sync>,
}

/// Host window capability group (TS `HostWindowCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostWindowCapabilities {
    pub appearance: Option<HostWindowAppearanceCapability>,
    pub attach: Option<HostWindowAttachCapability>,
    pub attention: Option<HostWindowAttentionCapability>,
    pub content_protection: Option<HostWindowContentProtectionCapability>,
    pub focus: Option<HostWindowFocusCapability>,
    pub fullscreen: Option<HostWindowFullscreenCapability>,
    pub geometry: Option<HostWindowGeometryCapability>,
    pub hierarchy: Option<HostWindowHierarchyCapability>,
    pub lifecycle: Option<HostWindowLifecycleCapability>,
    pub progress: Option<HostWindowProgressCapability>,
    pub shadow: Option<HostWindowShadowCapability>,
    pub shell: Option<HostWindowShellCapability>,
    pub size_constraints: Option<HostWindowSizeConstraintsCapability>,
    pub state: Option<HostWindowStateCapability>,
    pub visibility: Option<HostWindowVisibilityCapability>,
    pub z_order: Option<HostWindowZOrderCapability>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_app_window sets the source defaults
impl Default for AppWindow {
    fn default() -> Self {
        return AppWindow {
            runtime: EntityRuntimeSlot::default(),
            title: String::new(),
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
            device_pixel_ratio: 1.0,
            minimized: false,
            maximized: false,
            fullscreen: false,
            focused: false,
            visible: true,
            resizable: true,
            always_on_top: false,
            skip_taskbar: false,
            opacity: 1.0,
            icon: String::new(),
            min_width: 0.0,
            min_height: 0.0,
            max_width: -1.0,
            max_height: -1.0,
            on_activate: Signal::default(),
            on_close: Signal::default(),
            on_close_request: Signal::default(),
            on_deactivate: Signal::default(),
            on_drop_file: Signal::default(),
            on_focus_in: Signal::default(),
            on_focus_out: Signal::default(),
            on_fullscreen_changed: Signal::default(),
            on_maximize: Signal::default(),
            on_minimize: Signal::default(),
            on_move: Signal::default(),
            on_orientation_changed: Signal::default(),
            on_render_context_lost: Signal::default(),
            on_render_context_restored: Signal::default(),
            on_resize: Signal::default(),
            on_restore: Signal::default(),
            backend: None,
            observers: Vec::new(),
            terminal: false,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: observers and the pinned backend are closures, so Debug reports the state mirror and observer count
impl fmt::Debug for AppWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("AppWindow")
            .field("title", &self.title)
            .field("x", &self.x)
            .field("y", &self.y)
            .field("width", &self.width)
            .field("height", &self.height)
            .field("visible", &self.visible)
            .field("observers", &self.observers.len())
            .field("terminal", &self.terminal)
            .finish();
    }
}

flight_entity::impl_entity!(AppWindow);

flight_entity::impl_entity!(FullscreenTargetHandle);

flight_entity::impl_entity!(WindowResizeTargetHandle);
