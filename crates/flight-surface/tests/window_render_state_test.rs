use std::sync::{Arc, Mutex};

use flight_app::contract::{AppWindow, create_app_window};
use flight_entity::Ref;
use flight_signals::emit_signal;
use flight_surface::contract::*;

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

mod attach_window_render_state {
    use super::*;

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
        attach_window_render_state(&capability, &win, &surface());
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
        attach_window_render_state(&capability, &win, &surface());
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
        let _active = resize_capability(active_calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 320.0;
            guard.height = 200.0;
        }
        attach_window_render_state(&origin, &win, &surface());
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
        attach_window_render_state(&capability, &win, &surface());
        assert_eq!(*calls.lock().unwrap(), vec![(0.0, 0.0)]);
    }

    #[test]
    fn reattaching_releases_the_prior_observer_and_only_that_observer() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        attach_window_render_state(&capability, &win, &surface());
        attach_window_render_state(&capability, &win, &surface());
        resize_calls(&win);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]
        );
    }
}

mod detach_window_render_state {
    use super::*;

    #[test]
    fn stops_reacting_to_window_resize() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capability = resize_capability(calls.clone());
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.width = 800.0;
            guard.height = 600.0;
        }
        attach_window_render_state(&capability, &win, &surface());
        detach_window_render_state(&win);
        win.write().unwrap().width = 400.0;
        resize_calls(&win);
        assert_eq!(*calls.lock().unwrap(), vec![(800.0, 600.0)]);
    }

    #[test]
    fn is_a_no_op_when_nothing_is_attached_and_leaves_the_window_usable() {
        let win: Ref<AppWindow> = create_app_window();
        detach_window_render_state(&win);
        detach_window_render_state(&win);
        win.write().unwrap().width = 10.0;
        assert_eq!(win.read().unwrap().width, 10.0);
    }
}
