//! Window-bound render-state surface sizing (TS `attachWindowRenderState` /
//! `detachWindowRenderState`, moved app -> surface by Principal 2197d2fb).

use std::sync::Arc;

use flight_app::contract::AppWindow;
use flight_entity::Ref;
use flight_signals::{connect_signal, disconnect_signal};

use crate::surface_display::resize_surface;
use crate::types::*;

#[cfg(test)]
mod attach_tests {
    use std::sync::Mutex;

    use flight_app::contract::create_app_window;
    use flight_signals::emit_signal;

    use super::*;
    use crate::surface::allocate_surface;

    fn resize_capability(calls: Arc<Mutex<Vec<(f32, f32)>>>) -> HostSurfaceResizeCapability {
        return HostSurfaceResizeCapability {
            provider: Arc::new(()),
            resize: Arc::new(move |_surface: &SurfaceRef, width: f32, height: f32| {
                calls.lock().unwrap().push((width, height));
            }),
        };
    }

    fn surface() -> SurfaceRef {
        return allocate_surface::<SurfaceBase>(None);
    }

    fn resize_calls(win: &Ref<AppWindow>) {
        emit_signal(&win.read().unwrap().on_resize, &());
    }

    #[test]
    fn sizes_the_opaque_render_surface_from_the_window() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 800.0;
            guard.height = 600.0;
            guard.device_pixel_ratio = 2.0;
        }
        attach_window_render_state_core(&capability, &win, &surface());
        assert_eq!(*calls.lock().unwrap(), vec![(1600.0, 1200.0)]);
    }

    #[test]
    fn keeps_on_resize_core_owned_while_reapplying_the_backing_size() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 800.0;
            guard.height = 600.0;
            guard.device_pixel_ratio = 1.0;
        }
        attach_window_render_state_core(&capability, &win, &surface());
        {
            let mut guard = win.write().unwrap();
            guard.width = 400.0;
            guard.device_pixel_ratio = 2.0;
        }
        resize_calls(&win);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(800.0, 600.0), (800.0, 1200.0)]
        );
    }

    #[test]
    fn pins_resize_commands_to_the_captured_provider() {
        let origin_calls = Arc::new(Mutex::new(Vec::new()));
        let active_calls = Arc::new(Mutex::new(Vec::new()));
        let origin = resize_capability(origin_calls.clone());
        let active = resize_capability(active_calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 320.0;
            guard.height = 200.0;
        }
        attach_window_render_state_core(&origin, &win, &surface());
        win.write().unwrap().width = 640.0;
        resize_calls(&win);
        assert_eq!(
            *origin_calls.lock().unwrap(),
            vec![(320.0, 200.0), (640.0, 200.0)]
        );
        assert!(active_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn applies_the_default_window_size_on_attach() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        attach_window_render_state_core(&capability, &win, &surface());
        assert_eq!(*calls.lock().unwrap(), vec![(0.0, 0.0)]);
    }

    #[test]
    fn detach_stops_reacting_to_window_resize() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 800.0;
            guard.height = 600.0;
        }
        attach_window_render_state_core(&capability, &win, &surface());
        detach_window_render_state(&win);
        win.write().unwrap().width = 400.0;
        resize_calls(&win);
        assert_eq!(*calls.lock().unwrap(), vec![(800.0, 600.0)]);
    }

    #[test]
    fn reattaching_releases_the_prior_observer_and_only_that_observer() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        attach_window_render_state_core(&capability, &win, &surface());
        attach_window_render_state_core(&capability, &win, &surface());
        resize_calls(&win);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]
        );
    }
}

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

/// The attach behavior behind the moved `attachWindowRenderState`: releases the window's prior
/// render-state observer, sizes the surface immediately, then reapplies on the window's own
/// `on_resize` and keeps that observer in the window registry. The source's public signature also
/// carries an unused `RenderState` parameter whose Rust projection is awaiting the Principal ruling;
/// this internal form is what that ruling will wrap.
fn attach_window_render_state_core(
    capability: &HostSurfaceResizeCapability,
    win: &Ref<AppWindow>,
    surface: &SurfaceRef,
) {
    AppWindow::detach_render_state_observer(win);
    apply_window_render_state(capability, win, surface);
    let on_resize = win.read().unwrap().on_resize.clone();
    let capability = capability.clone();
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
