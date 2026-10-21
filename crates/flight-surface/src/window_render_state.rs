//! Window-bound render-state surface sizing (TS `attachWindowRenderState` /
//! `detachWindowRenderState`, moved app -> surface by Principal 2197d2fb).

use std::sync::Arc;

use flight_app::contract::AppWindow;
use flight_entity::Ref;
use flight_signals::{connect_signal, disconnect_signal};

use crate::surface_display::resize_surface;
use crate::types::*;

/// Sizes the surface backing store from the window's logical size scaled by its device pixel
/// ratio. Window sizes are non-negative, so `round` matches `Math.round` for every reachable value.
fn apply_window_render_state(
    capability: &HostSurfaceResizeCapability,
    win: &Ref<AppWindow>,
    surface: &SurfaceRef,
) {
    let (width, height, device_pixel_ratio) = {
        let guard = win.read().unwrap();
        (guard.width, guard.height, guard.device_pixel_ratio)
    };
    resize_surface(
        capability,
        surface,
        (width * device_pixel_ratio).round(),
        (height * device_pixel_ratio).round(),
    );
}

/// Binds a render state to the window's size and device pixel ratio: releases the window's prior
/// render-state observer, sizes the surface immediately, then reapplies on the window's own
/// `on_resize` and keeps that observer in the window registry (TS `attachWindowRenderState`).
// flight-lint: allow(conform-extra) D8 move (Principal 2197d2fb): TS exports this from app/src and flight-app records the matching conform-skip; the receiving owner is flight-surface. Principal ae8562b8 removed the source's unused RenderState parameter as move aftermath.
pub fn attach_window_render_state(
    host_surface_resize: &HostSurfaceResizeCapability,
    win: &Ref<AppWindow>,
    surface: &SurfaceRef,
) {
    AppWindow::detach_render_state_observer(win);
    apply_window_render_state(host_surface_resize, win, surface);
    let on_resize = win.read().unwrap().on_resize.clone();
    let capability = host_surface_resize.clone();
    let surface = surface.clone();
    let owner = Arc::downgrade(win);
    let slot = connect_signal(
        &on_resize,
        Arc::new(move |_value: &()| {
            let Some(win) = owner.upgrade() else {
                return;
            };
            apply_window_render_state(&capability, &win, &surface);
        }),
        None,
    );
    AppWindow::attach_render_state_observer(
        win,
        Arc::new(move || {
            disconnect_signal(&on_resize, slot);
        }),
    );
}

/// Stops the window from resizing the render state it carries (TS `detachWindowRenderState`).
// flight-lint: allow(conform-extra) D8 move (Principal 2197d2fb): TS exports this from app/src and flight-app records the matching conform-skip; the receiving owner is flight-surface
pub fn detach_window_render_state(win: &Ref<AppWindow>) {
    AppWindow::detach_render_state_observer(win);
}
