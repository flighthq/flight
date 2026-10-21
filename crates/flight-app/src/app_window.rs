use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity, throw_type_error};
use flight_geometry::Matrix;
use flight_input::{
    HostInputDropFileCapability, HostInputFocusCapability, HostInputPointerLockCapability,
    HostInputTargetCapability, InputPointerLockExitFuture, InputPointerLockExitReason,
    InputPointerLockRequestFuture, InputPointerLockRequestReason, InputTargetHandle,
};
use flight_screen::{HostScreenChangeCapability, ScreenChangeEvent};
use flight_signals::{Signal, create_signal, emit_signal};

use crate::types::{AppProviderFuture, AppUnsubscribe};
use crate::window_types::*;

/// Caller-owned pointer-lock state with no provider pinned (D5).
// flight-lint: allow(conform-extra) D5: caller-owned pointer-lock state replaces the TS module-level `_pointerLockBackend`
pub fn create_app_pointer_lock_state() -> AppPointerLockState {
    return AppPointerLockState { backend: None };
}

/// Creates a window with the source defaults: visible, resizable, opaque, unbounded maximum size,
/// device pixel ratio 1, and fresh signals.
pub fn create_app_window() -> Ref<AppWindow> {
    let mut out: AppWindow = allocate_entity();
    initialize_app_window(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_app_window`.
pub fn initialize_app_window(out: &mut AppWindow) {
    out.always_on_top = false;
    out.device_pixel_ratio = 1.0;
    out.focused = false;
    out.fullscreen = false;
    out.height = 0.0;
    out.icon = String::new();
    out.max_height = -1.0;
    out.maximized = false;
    out.max_width = -1.0;
    out.min_height = 0.0;
    out.minimized = false;
    out.min_width = 0.0;
    out.opacity = 1.0;
    out.resizable = true;
    out.skip_taskbar = false;
    out.title = String::new();
    out.visible = true;
    out.width = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.on_activate = create_signal();
    out.on_close = create_signal();
    out.on_close_request = create_signal();
    out.on_deactivate = create_signal();
    out.on_drop_file = create_signal();
    out.on_focus_in = create_signal();
    out.on_focus_out = create_signal();
    out.on_fullscreen_changed = create_signal();
    out.on_maximize = create_signal();
    out.on_minimize = create_signal();
    out.on_move = create_signal();
    out.on_orientation_changed = create_signal();
    out.on_render_context_lost = create_signal();
    out.on_render_context_restored = create_signal();
    out.on_resize = create_signal();
    out.on_restore = create_signal();
    out.backend = None;
    out.observers = Vec::new();
    out.terminal = false;
}

/// Attaches an existing native window without requiring an `AppLoop`. A false result leaves the
/// window's lifecycle unchanged; success pins its eventual close to this exact lifecycle capability,
/// so a later `close_window` reaches the host that adopted the handle.
pub fn attach_window(
    host_window_attach: &HostWindowAttachCapability,
    host_window_lifecycle: &HostWindowLifecycleCapability,
    win: &Ref<AppWindow>,
    handle: &NativeWindowHandle,
    ownership: WindowAttachmentOwnership,
) -> bool {
    let attached = (host_window_attach.attach)(win, handle, ownership);
    if attached {
        let mut guard = win.write().unwrap();
        guard.backend = Some(host_window_lifecycle.clone());
        guard.terminal = false;
    }
    return attached;
}

/// Wires the host's close-request and terminal-close sources to the window's signals. A vetoed
/// request is reported back to the host so it can keep the native window alive. Idempotent.
pub fn attach_window_close(
    host_window_lifecycle: &HostWindowLifecycleCapability,
    win: &Ref<AppWindow>,
) {
    replace_window_observer(win, AppWindowObserverKey::Close, || {
        let (request, closed) = (Arc::downgrade(win), Arc::downgrade(win));
        let subscribe_close = require_slot(
            &host_window_lifecycle.subscribe_close,
            "hostWindowLifecycle.subscribeClose",
        );
        return subscribe_close(
            Arc::new(move || {
                let Some(win) = request.upgrade() else {
                    return false;
                };
                let signal = win.read().unwrap().on_close_request.clone();
                emit_signal(&signal, &());
                return is_signal_cancelled(&signal);
            }),
            Arc::new(move || {
                if let Some(win) = closed.upgrade() {
                    notify_window_closed(&win);
                }
            }),
        );
    });
}

/// Forwards file drops on `target` to `win.on_drop_file`.
pub fn attach_window_drop_file(
    host_input_drop_file: &HostInputDropFileCapability,
    win: &Ref<AppWindow>,
    target: &InputTargetHandle,
) {
    let signal = win.read().unwrap().on_drop_file.clone();
    replace_window_observer(win, AppWindowObserverKey::DropFile, || {
        return (host_input_drop_file.subscribe)(
            target,
            Arc::new(move |path: &str| emit_signal(&signal, &path.to_string())),
        );
    });
}

/// Forwards focus in/out on `target` to `win.on_focus_in` / `win.on_focus_out`.
pub fn attach_window_focus(
    host_input_focus: &HostInputFocusCapability,
    win: &Ref<AppWindow>,
    target: &InputTargetHandle,
) {
    let (focus_in, focus_out) = {
        let guard = win.read().unwrap();
        (guard.on_focus_in.clone(), guard.on_focus_out.clone())
    };
    replace_window_observer(win, AppWindowObserverKey::Focus, || {
        return (host_input_focus.subscribe)(
            target,
            Arc::new(move || emit_signal(&focus_in, &())),
            Arc::new(move || emit_signal(&focus_out, &())),
        );
    });
}

/// Mirrors element fullscreen changes into `win.fullscreen` and emits `on_fullscreen_changed` on
/// every report.
pub fn attach_window_fullscreen(
    host_fullscreen: &HostElementFullscreenCapability,
    win: &Ref<AppWindow>,
) {
    let owner = Arc::downgrade(win);
    replace_window_observer(win, AppWindowObserverKey::Fullscreen, || {
        let subscribe = require_slot(&host_fullscreen.subscribe, "hostFullscreen.subscribe");
        return subscribe(Arc::new(move |fullscreen: bool| {
            let Some(win) = owner.upgrade() else {
                return;
            };
            let signal = {
                let mut guard = win.write().unwrap();
                guard.fullscreen = fullscreen;
                guard.on_fullscreen_changed.clone()
            };
            emit_signal(&signal, &());
        }));
    });
}

/// Wires host-originated window movement to the entity and its `on_move` signal; a report of the
/// current position changes nothing.
pub fn attach_window_move(
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
) {
    let owner = Arc::downgrade(win);
    replace_window_observer(win, AppWindowObserverKey::Move, || {
        let subscribe_move = require_slot(
            &host_window_geometry.subscribe_move,
            "hostWindowGeometry.subscribeMove",
        );
        return subscribe_move(Arc::new(move |x: f32, y: f32| {
            let Some(win) = owner.upgrade() else {
                return;
            };
            let moved = {
                let mut guard = win.write().unwrap();
                if guard.x != x || guard.y != y {
                    guard.x = x;
                    guard.y = y;
                    Some(guard.on_move.clone())
                } else {
                    None
                }
            };
            if let Some(signal) = moved {
                emit_signal(&signal, &());
            }
        }));
    });
}

/// Forwards display orientation changes to `win.on_orientation_changed`. Orientation is a property
/// of the display, so this consumes the screen change capability and forwards only change events
/// whose orientation metric changed.
pub fn attach_window_orientation(
    host_screen_change: &HostScreenChangeCapability,
    win: &Ref<AppWindow>,
) {
    let signal = win.read().unwrap().on_orientation_changed.clone();
    replace_window_observer(win, AppWindowObserverKey::Orientation, || {
        return (host_screen_change.subscribe)(Arc::new(move |event: &ScreenChangeEvent| {
            if event
                .changed_metrics
                .as_ref()
                .is_some_and(|metrics| metrics.orientation)
            {
                emit_signal(&signal, &());
            }
        }));
    });
}

/// Mirrors the content-box size and device pixel ratio of `target` into the window and emits
/// `on_resize` on every report.
pub fn attach_window_resize(
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
    target: &Ref<WindowResizeTargetHandle>,
) {
    let owner = Arc::downgrade(win);
    replace_window_observer(win, AppWindowObserverKey::Resize, || {
        let subscribe_resize = require_slot(
            &host_window_geometry.subscribe_resize,
            "hostWindowGeometry.subscribeResize",
        );
        return subscribe_resize(
            target,
            Arc::new(move |width: f32, height: f32, device_pixel_ratio: f32| {
                let Some(win) = owner.upgrade() else {
                    return;
                };
                let signal = {
                    let mut guard = win.write().unwrap();
                    guard.width = width;
                    guard.height = height;
                    guard.device_pixel_ratio = device_pixel_ratio;
                    guard.on_resize.clone()
                };
                emit_signal(&signal, &());
            }),
        );
    });
}

/// Forwards host visibility to `win.on_activate` (visible) and `win.on_deactivate` (hidden).
pub fn attach_window_visibility(
    host_window_visibility: &HostWindowVisibilityCapability,
    win: &Ref<AppWindow>,
) {
    let (activate, deactivate) = {
        let guard = win.read().unwrap();
        (guard.on_activate.clone(), guard.on_deactivate.clone())
    };
    replace_window_observer(win, AppWindowObserverKey::Visibility, || {
        let subscribe_visibility = require_slot(
            &host_window_visibility.subscribe_visibility,
            "hostWindowVisibility.subscribeVisibility",
        );
        return subscribe_visibility(Arc::new(move |visible: bool| {
            emit_signal(if visible { &activate } else { &deactivate }, &());
        }));
    });
}

/// Centers the window on its current display.
pub fn center_window(host_window_geometry: &HostWindowGeometryCapability, win: &Ref<AppWindow>) {
    require_slot(&host_window_geometry.center, "hostWindowGeometry.center")(win);
}

/// Closes the window. A window already closed reports `true`. Otherwise `on_close_request` is
/// emitted first; a veto aborts the close and returns `false`. Otherwise the pinned lifecycle
/// capability (or `host_window_lifecycle` when none is pinned) closes the window, `on_close` fires,
/// and this returns `true`.
pub fn close_window(
    host_window_lifecycle: &HostWindowLifecycleCapability,
    win: &Ref<AppWindow>,
) -> bool {
    if win.read().unwrap().terminal {
        return true;
    }
    if !request_window_close(win) {
        return false;
    }
    let backend = win
        .read()
        .unwrap()
        .backend
        .clone()
        .unwrap_or_else(|| host_window_lifecycle.clone());
    (backend.close)(win);
    notify_window_closed(win);
    return true;
}

/// Writes the window's device transform, a uniform scale by its device pixel ratio, into `out`.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn compute_window_device_transform(out: &mut Matrix, win: &Ref<AppWindow>) {
    let scale = win.read().unwrap().device_pixel_ratio;
    out.a = scale;
    out.b = 0.0;
    out.c = 0.0;
    out.d = scale;
    out.tx = 0.0;
    out.ty = 0.0;
}

/// Releases the window's close-request/close attachment.
pub fn detach_window_close(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Close);
}

/// Releases the window's file-drop attachment.
pub fn detach_window_drop_file(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::DropFile);
}

/// Releases the window's focus attachment.
pub fn detach_window_focus(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Focus);
}

/// Releases the window's fullscreen attachment.
pub fn detach_window_fullscreen(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Fullscreen);
}

/// Releases the window's move attachment.
pub fn detach_window_move(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Move);
}

/// Releases the window's orientation attachment.
pub fn detach_window_orientation(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Orientation);
}

/// Releases the window's resize attachment.
pub fn detach_window_resize(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Resize);
}

/// Releases the window's visibility attachment.
pub fn detach_window_visibility(win: &Ref<AppWindow>) {
    remove_window_observer(win, AppWindowObserverKey::Visibility);
}

/// Releases every attached host observer in first-attach order, then forgets them. A release that
/// panics stops the rest and leaves the registry as it was, as a throw does in the source.
pub fn dispose_app_window(win: &Ref<AppWindow>) {
    let releases: Vec<AppUnsubscribe> = win
        .read()
        .unwrap()
        .observers
        .iter()
        .map(|(_, release)| release.clone())
        .collect();
    for release in releases {
        release();
    }
    win.write().unwrap().observers.clear();
}

/// Releases the host's active pointer lock. The provider that acquired the lock (pinned in `state`)
/// is used when one is pinned, else `host_input_pointer_lock`; a successful exit through the pinned
/// provider clears the pin.
// flight-lint: allow(conform-params) D5: caller-owned pointer-lock state replaces the TS module-level `_pointerLockBackend`
pub fn exit_app_input_pointer_lock(
    state: &Ref<AppPointerLockState>,
    host_input_pointer_lock: &HostInputPointerLockCapability,
) -> InputPointerLockExitFuture {
    let backend = state
        .read()
        .unwrap()
        .backend
        .clone()
        .unwrap_or_else(|| host_input_pointer_lock.clone());
    let pending = (backend.exit)();
    let state = state.clone();
    return Box::pin(async move {
        let outcome = pending.await;
        if outcome.reason == InputPointerLockExitReason::Ok {
            let mut guard = state.write().unwrap();
            if guard
                .backend
                .as_ref()
                .is_some_and(|pinned| Arc::ptr_eq(&pinned.provider, &backend.provider))
            {
                guard.backend = None;
            }
        }
        return outcome;
    });
}

/// Leaves element fullscreen; the provider's Promise (its outcome, or its rejection) is returned as
/// is.
pub fn exit_app_window_fullscreen(
    host_fullscreen: &HostElementFullscreenCapability,
) -> AppProviderFuture<bool> {
    return (host_fullscreen.exit)();
}

/// Briefly flashes the window frame to attract attention.
pub fn flash_window_frame(
    host_window_attention: &HostWindowAttentionCapability,
    win: &Ref<AppWindow>,
) {
    require_slot(
        &host_window_attention.flash_window_frame,
        "hostWindowAttention.flashWindowFrame",
    )(win);
}

/// Marks the window focused and brings it to the foreground.
pub fn focus_window(host_window_focus: &HostWindowFocusCapability, win: &Ref<AppWindow>) {
    win.write().unwrap().focused = true;
    (host_window_focus.focus)(win);
}

/// Fills `out` with the host window's current screen bounds.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_window_bounds(
    out: &mut WindowBounds,
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
) {
    (host_window_geometry.get_bounds)(out, win);
}

/// Hides a visible window without closing it.
pub fn hide_window(host_window_visibility: &HostWindowVisibilityCapability, win: &Ref<AppWindow>) {
    {
        let mut guard = win.write().unwrap();
        if !guard.visible {
            return;
        }
        guard.visible = false;
    }
    (host_window_visibility.hide)(win);
}

fn is_signal_cancelled<T>(signal: &Signal<T>) -> bool {
    return signal
        .data
        .read()
        .unwrap()
        .as_ref()
        .is_some_and(|data| data.cancelled);
}

/// Requests pointer lock on an opaque target. Expected target, availability, denial and operation
/// failures are returned as outcomes. Only a successful acquisition pins this provider in `state`
/// for the eventual exit.
// flight-lint: allow(conform-params) D5: caller-owned pointer-lock state replaces the TS module-level `_pointerLockBackend`
pub fn lock_app_input_pointer(
    state: &Ref<AppPointerLockState>,
    host_input_pointer_lock: &HostInputPointerLockCapability,
    target: &InputTargetHandle,
) -> InputPointerLockRequestFuture {
    let backend = host_input_pointer_lock.clone();
    let pending = (backend.request)(target);
    let state = state.clone();
    return Box::pin(async move {
        let outcome = pending.await;
        if outcome.reason == InputPointerLockRequestReason::Ok {
            state.write().unwrap().backend = Some(backend);
        }
        return outcome;
    });
}

/// Maximizes the window, emitting `on_maximize` when the state changes.
pub fn maximize_window(host_window_state: &HostWindowStateCapability, win: &Ref<AppWindow>) {
    let signal = {
        let mut guard = win.write().unwrap();
        if guard.maximized {
            return;
        }
        guard.maximized = true;
        guard.on_maximize.clone()
    };
    (host_window_state.maximize)(win);
    emit_signal(&signal, &());
}

/// Minimizes the window, emitting `on_minimize` when the state changes.
pub fn minimize_window(host_window_state: &HostWindowStateCapability, win: &Ref<AppWindow>) {
    let signal = {
        let mut guard = win.write().unwrap();
        if guard.minimized {
            return;
        }
        guard.minimized = true;
        guard.on_minimize.clone()
    };
    (host_window_state.minimize)(win);
    emit_signal(&signal, &());
}

/// The single terminal-close choke point for app-driven and host-driven closes. Native callbacks may
/// fire synchronously inside the provider's close; whichever path arrives first emits `on_close` and
/// every later path is a no-op. The window's observers are then released even when a listener panics
/// (the panic is re-raised afterwards).
pub fn notify_window_closed(win: &Ref<AppWindow>) {
    let signal = {
        let mut guard = win.write().unwrap();
        if guard.terminal {
            return;
        }
        guard.terminal = true;
        guard.backend = None;
        guard.on_close.clone()
    };
    let emitted = catch_unwind(AssertUnwindSafe(|| emit_signal(&signal, &())));
    dispose_app_window(win);
    if let Err(payload) = emitted {
        resume_unwind(payload);
    }
}

/// Opens (or configures) the window: applies each provided option to the entity, then asks the
/// lifecycle capability to open it. On success that capability is pinned for the eventual close and
/// the window leaves its terminal state; `center` is applied after a successful open. Returns
/// whether the host opened a window.
pub fn open_window(
    host_window_lifecycle: &HostWindowLifecycleCapability,
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
    options: Option<&WindowOptions>,
) -> bool {
    let defaults = WindowOptions {
        title: None,
        x: None,
        y: None,
        width: None,
        height: None,
        resizable: None,
        always_on_top: None,
        fullscreen: None,
        minimized: None,
        maximized: None,
        visible: None,
        min_width: None,
        min_height: None,
        max_width: None,
        max_height: None,
        center: None,
        frame: None,
        transparent: None,
    };
    let options = options.unwrap_or(&defaults);
    {
        let mut guard = win.write().unwrap();
        if let Some(title) = &options.title {
            guard.title = title.clone();
        }
        if let Some(x) = options.x {
            guard.x = x;
        }
        if let Some(y) = options.y {
            guard.y = y;
        }
        if let Some(width) = options.width {
            guard.width = width;
        }
        if let Some(height) = options.height {
            guard.height = height;
        }
        if let Some(resizable) = options.resizable {
            guard.resizable = resizable;
        }
        if let Some(always_on_top) = options.always_on_top {
            guard.always_on_top = always_on_top;
        }
        if let Some(fullscreen) = options.fullscreen {
            guard.fullscreen = fullscreen;
        }
        if let Some(minimized) = options.minimized {
            guard.minimized = minimized;
        }
        if let Some(maximized) = options.maximized {
            guard.maximized = maximized;
        }
        if let Some(visible) = options.visible {
            guard.visible = visible;
        }
        if let Some(min_width) = options.min_width {
            guard.min_width = min_width;
        }
        if let Some(min_height) = options.min_height {
            guard.min_height = min_height;
        }
        if let Some(max_width) = options.max_width {
            guard.max_width = max_width;
        }
        if let Some(max_height) = options.max_height {
            guard.max_height = max_height;
        }
    }
    let result = (host_window_lifecycle.open)(win, options);
    if result {
        let mut guard = win.write().unwrap();
        guard.backend = Some(host_window_lifecycle.clone());
        guard.terminal = false;
    }
    if result && options.center == Some(true) {
        if let Some(center) = &host_window_geometry.center {
            center(win);
        }
    }
    return result;
}

/// Prepares a provider-bound target for direct input.
pub fn prepare_element_for_input(
    host_input_target: &HostInputTargetCapability,
    target: &InputTargetHandle,
) {
    (host_input_target.prepare)(target);
}

// The source's `observers.get(key)?.(); observers.delete(key)`: the release runs first, and the slot
// is forgotten only after it returns.
fn remove_window_observer(win: &Ref<AppWindow>, key: AppWindowObserverKey) {
    let release = win
        .read()
        .unwrap()
        .observers
        .iter()
        .find(|(entry, _)| *entry == key)
        .map(|(_, release)| release.clone());
    if let Some(release) = release {
        release();
    }
    win.write()
        .unwrap()
        .observers
        .retain(|(entry, _)| *entry != key);
}

// The source's `observers.get(key)?.(); observers.set(key, subscribe(...))`: the previous release
// runs before the new subscription, which then takes the slot (keeping its first-attach position).
fn replace_window_observer(
    win: &Ref<AppWindow>,
    key: AppWindowObserverKey,
    subscribe: impl FnOnce() -> AppUnsubscribe,
) {
    let previous = win
        .read()
        .unwrap()
        .observers
        .iter()
        .find(|(entry, _)| *entry == key)
        .map(|(_, release)| release.clone());
    if let Some(previous) = previous {
        previous();
    }
    let release = subscribe();
    let mut guard = win.write().unwrap();
    match guard.observers.iter_mut().find(|(entry, _)| *entry == key) {
        Some(slot) => slot.1 = release,
        None => guard.observers.push((key, release)),
    }
}

/// Emits `on_close_request` and returns whether the close may proceed (`false` when a listener
/// vetoed by cancelling the signal). Gates an app-driven close without closing.
pub fn request_window_close(win: &Ref<AppWindow>) -> bool {
    let signal = win.read().unwrap().on_close_request.clone();
    emit_signal(&signal, &());
    return !is_signal_cancelled(&signal);
}

/// Requests element fullscreen for `target`; the provider's Promise is returned as is.
pub fn request_app_window_fullscreen(
    host_fullscreen: &HostElementFullscreenCapability,
    target: &Ref<FullscreenTargetHandle>,
) -> AppProviderFuture<bool> {
    return (host_fullscreen.request)(target);
}

/// Requests user attention on the window (taskbar flash / dock bounce); `false` stops it.
pub fn request_window_attention(
    host_window_attention: &HostWindowAttentionCapability,
    win: &Ref<AppWindow>,
    attention: bool,
) {
    (host_window_attention.request_attention)(win, attention);
}

// A required optional provider method (the source's `Required<Pick<...>>`): calling an absent one is
// the source's runtime TypeError ("... is not a function").
fn require_slot<T: Clone>(slot: &Option<T>, name: &str) -> T {
    return match slot {
        Some(callback) => callback.clone(),
        None => throw_type_error(&format!("{} is not a function", name)),
    };
}

/// Restores the window from a minimized or maximized state, emitting `on_restore` when it changed.
pub fn restore_window(host_window_state: &HostWindowStateCapability, win: &Ref<AppWindow>) {
    let signal = {
        let mut guard = win.write().unwrap();
        if !guard.minimized && !guard.maximized {
            return;
        }
        guard.minimized = false;
        guard.maximized = false;
        guard.on_restore.clone()
    };
    (host_window_state.restore)(win);
    emit_signal(&signal, &());
}

/// Sets whether the window floats above others.
pub fn set_window_always_on_top(
    host_window_z_order: &HostWindowZOrderCapability,
    win: &Ref<AppWindow>,
    always_on_top: bool,
) {
    win.write().unwrap().always_on_top = always_on_top;
    (host_window_z_order.set_always_on_top)(win, always_on_top);
}

/// Prevents (or allows) the window contents from being captured.
pub fn set_window_content_protection(
    host_window_content_protection: &HostWindowContentProtectionCapability,
    win: &Ref<AppWindow>,
    enabled: bool,
) {
    (host_window_content_protection.set_content_protection)(win, enabled);
}

/// Sets fullscreen state, emitting `on_fullscreen_changed` when it changes.
pub fn set_window_fullscreen(
    host_window_fullscreen: &HostWindowFullscreenCapability,
    win: &Ref<AppWindow>,
    fullscreen: bool,
) {
    let signal = {
        let mut guard = win.write().unwrap();
        if guard.fullscreen == fullscreen {
            return;
        }
        guard.fullscreen = fullscreen;
        guard.on_fullscreen_changed.clone()
    };
    (host_window_fullscreen.set_fullscreen)(win, fullscreen);
    emit_signal(&signal, &());
}

/// Shows or hides the native drop shadow.
pub fn set_window_has_shadow(
    host_window_shadow: &HostWindowShadowCapability,
    win: &Ref<AppWindow>,
    has_shadow: bool,
) {
    (host_window_shadow.set_has_shadow)(win, has_shadow);
}

/// Sets the window icon (path/URL).
pub fn set_window_icon(
    host_window_appearance: &HostWindowAppearanceCapability,
    win: &Ref<AppWindow>,
    icon: &str,
) {
    win.write().unwrap().icon = icon.to_string();
    require_slot(
        &host_window_appearance.set_icon,
        "hostWindowAppearance.setIcon",
    )(win, icon);
}

/// Sets the maximum window size in logical pixels (-1 for unbounded).
pub fn set_window_maximum_size(
    host_window_size_constraints: &HostWindowSizeConstraintsCapability,
    win: &Ref<AppWindow>,
    width: f32,
    height: f32,
) {
    {
        let mut guard = win.write().unwrap();
        guard.max_width = width;
        guard.max_height = height;
    }
    (host_window_size_constraints.set_maximum_size)(win, width, height);
}

/// Shows or hides the window's menu bar.
pub fn set_window_menu_bar_visible(
    host_window_shell: &HostWindowShellCapability,
    win: &Ref<AppWindow>,
    visible: bool,
) {
    require_slot(
        &host_window_shell.set_menu_bar_visible,
        "hostWindowShell.setMenuBarVisible",
    )(win, visible);
}

/// Sets the minimum window size in logical pixels.
pub fn set_window_minimum_size(
    host_window_size_constraints: &HostWindowSizeConstraintsCapability,
    win: &Ref<AppWindow>,
    width: f32,
    height: f32,
) {
    {
        let mut guard = win.write().unwrap();
        guard.min_width = width;
        guard.min_height = height;
    }
    (host_window_size_constraints.set_minimum_size)(win, width, height);
}

/// Sets the window opacity in [0, 1].
pub fn set_window_opacity(
    host_window_appearance: &HostWindowAppearanceCapability,
    win: &Ref<AppWindow>,
    opacity: f32,
) {
    win.write().unwrap().opacity = opacity;
    require_slot(
        &host_window_appearance.set_opacity,
        "hostWindowAppearance.setOpacity",
    )(win, opacity);
}

/// Sets the window's parent for modal/child relationships; `None` detaches.
pub fn set_window_parent(
    host_window_hierarchy: &HostWindowHierarchyCapability,
    win: &Ref<AppWindow>,
    parent: Option<&Ref<AppWindow>>,
) {
    (host_window_hierarchy.set_parent)(win, parent);
}

/// Moves the window's top-left to (x, y) and emits `on_move`.
pub fn set_window_position(
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
    x: f32,
    y: f32,
) {
    let signal = {
        let mut guard = win.write().unwrap();
        guard.x = x;
        guard.y = y;
        guard.on_move.clone()
    };
    (host_window_geometry.set_position)(win, x, y);
    emit_signal(&signal, &());
}

/// Sets the taskbar/dock progress indicator in [0, 1]; a negative value clears it.
pub fn set_window_progress(
    host_window_progress: &HostWindowProgressCapability,
    win: &Ref<AppWindow>,
    progress: f32,
) {
    (host_window_progress.set_progress)(win, progress);
}

/// Sets whether the user can resize the window.
pub fn set_window_resizable(
    host_window_size_constraints: &HostWindowSizeConstraintsCapability,
    win: &Ref<AppWindow>,
    resizable: bool,
) {
    win.write().unwrap().resizable = resizable;
    require_slot(
        &host_window_size_constraints.set_resizable,
        "hostWindowSizeConstraints.setResizable",
    )(win, resizable);
}

/// Resizes the window (logical pixels) and emits `on_resize`.
pub fn set_window_size(
    host_window_geometry: &HostWindowGeometryCapability,
    win: &Ref<AppWindow>,
    width: f32,
    height: f32,
) {
    let signal = {
        let mut guard = win.write().unwrap();
        guard.width = width;
        guard.height = height;
        guard.on_resize.clone()
    };
    (host_window_geometry.set_size)(win, width, height);
    emit_signal(&signal, &());
}

/// Sets whether the window is hidden from the taskbar/dock switcher.
pub fn set_window_skip_taskbar(
    host_window_shell: &HostWindowShellCapability,
    win: &Ref<AppWindow>,
    skip: bool,
) {
    win.write().unwrap().skip_taskbar = skip;
    require_slot(
        &host_window_shell.set_skip_taskbar,
        "hostWindowShell.setSkipTaskbar",
    )(win, skip);
}

/// Sets the window title text.
pub fn set_window_title(
    host_window_appearance: &HostWindowAppearanceCapability,
    win: &Ref<AppWindow>,
    title: &str,
) {
    win.write().unwrap().title = title.to_string();
    (host_window_appearance.set_title)(win, title);
}

/// Shows a hidden window.
pub fn show_window(host_window_visibility: &HostWindowVisibilityCapability, win: &Ref<AppWindow>) {
    {
        let mut guard = win.write().unwrap();
        if guard.visible {
            return;
        }
        guard.visible = true;
    }
    (host_window_visibility.show)(win);
}
