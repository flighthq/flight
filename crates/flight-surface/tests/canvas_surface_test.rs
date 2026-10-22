use std::sync::{Arc, Mutex};

use flight_app::contract::{AppWindow, create_app_window};
use flight_entity::Ref;
use flight_host::{CanvasRenderingContext2D, NativeSurfaceHandle};
use flight_surface::contract::*;

#[derive(Debug)]
struct ContextMarker;

fn context() -> CanvasRenderingContext2D {
    return CanvasRenderingContext2D {
        provider: Arc::new(()),
        handle: Arc::new(ContextMarker),
    };
}

fn native(value: &'static str) -> Option<NativeSurfaceHandle> {
    return Some(NativeSurfaceHandle {
        provider: Arc::new(()),
        handle: Arc::new(value),
    });
}

fn app_window() -> Ref<AppWindow> {
    return create_app_window();
}

fn capability(
    create_handle: Option<NativeSurfaceHandle>,
    acquired_context: Option<CanvasRenderingContext2D>,
    created: Arc<Mutex<Vec<(Ref<AppWindow>, f32, f32)>>>,
    acquired: Arc<Mutex<Vec<SurfaceRef>>>,
    released: Arc<Mutex<Vec<SurfaceRef>>>,
) -> HostCanvasCapability {
    let create_recorded = created.clone();
    let acquire_recorded = acquired.clone();
    return HostCanvasCapability {
        provider: Arc::new(()),
        acquire: Arc::new(
            move |surface: &SurfaceRef, _options: Option<&CanvasRenderingContext2DSettings>| {
                acquire_recorded.lock().unwrap().push(surface.clone());
                return acquired_context.clone();
            },
        ),
        create: Arc::new(
            move |window: &Ref<AppWindow>,
                  width: f32,
                  height: f32,
                  _options: Option<&CanvasRenderingContext2DSettings>| {
                create_recorded
                    .lock()
                    .unwrap()
                    .push((window.clone(), width, height));
                return create_handle.clone();
            },
        ),
        create_surface: Arc::new(|_width: f32, _height: f32| None),
        destroy_surface: Arc::new(|_surface: &Ref<CanvasSurface>| {}),
        release: Arc::new(move |surface: &SurfaceRef| {
            released.lock().unwrap().push(surface.clone());
        }),
    };
}

mod create_canvas_surface {
    use super::*;

    #[test]
    fn allocates_a_drawable_in_the_window_and_acquires_a_2d_context() {
        let created = Arc::new(Mutex::new(Vec::new()));
        let acquired = Arc::new(Mutex::new(Vec::new()));
        let handle = native("canvas");
        let expected_context = context();
        let capability = capability(
            handle,
            Some(expected_context.clone()),
            created.clone(),
            acquired.clone(),
            Arc::new(Mutex::new(Vec::new())),
        );
        let window = app_window();
        let surface = create_canvas_surface(&capability, &window, 320.0, 240.0, None)
            .expect("surface is created");
        let borrowed = surface.read().unwrap();
        let created = created.lock().unwrap();
        assert!(Arc::ptr_eq(&created[0].0, &window));
        assert_eq!((created[0].1, created[0].2), (320.0, 240.0));
        let stored_handle = get_surface_handle(&*borrowed).expect("handle");
        assert_eq!(
            stored_handle.handle.downcast_ref::<&'static str>(),
            Some(&"canvas")
        );
        assert!(Arc::ptr_eq(
            &borrowed.context.handle,
            &expected_context.handle
        ));
    }

    #[test]
    fn returns_null_without_acquiring_when_the_window_cannot_yield_a_drawable() {
        let acquired = Arc::new(Mutex::new(Vec::new()));
        let capability = capability(
            None,
            Some(context()),
            Arc::new(Mutex::new(Vec::new())),
            acquired.clone(),
            Arc::new(Mutex::new(Vec::new())),
        );
        assert!(create_canvas_surface(&capability, &app_window(), 8.0, 8.0, None).is_none());
        assert!(acquired.lock().unwrap().is_empty());
    }

    #[test]
    fn returns_null_when_the_drawable_cannot_rasterize_2d() {
        let capability = capability(
            native("canvas"),
            None,
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        assert!(create_canvas_surface(&capability, &app_window(), 8.0, 8.0, None).is_none());
    }
}

mod create_canvas_surface_from_native_handle {
    use super::*;

    #[test]
    fn adopts_a_drawable_the_caller_owns_without_allocating_one() {
        let created = Arc::new(Mutex::new(Vec::new()));
        let capability = capability(
            native("unused"),
            Some(context()),
            created.clone(),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        let surface =
            create_canvas_surface_from_native_handle(&capability, native("adopted"), None)
                .expect("surface is adopted");
        let borrowed = surface.read().unwrap();
        let handle = get_surface_handle(&*borrowed).expect("adopted handle");
        assert_eq!(handle.handle.downcast_ref::<&str>(), Some(&"adopted"));
        assert!(created.lock().unwrap().is_empty());
    }
}

mod destroy_canvas_surface {
    use super::*;

    #[test]
    fn releases_the_surface_through_the_capability_preserving_identity() {
        let released = Arc::new(Mutex::new(Vec::new()));
        let capability = capability(
            native("canvas"),
            Some(context()),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
            released.clone(),
        );
        let surface = create_canvas_surface(&capability, &app_window(), 8.0, 8.0, None)
            .expect("surface is created");
        destroy_canvas_surface(&capability, &surface);
        let released = released.lock().unwrap();
        let erased: SurfaceRef = surface.clone();
        assert!(Arc::ptr_eq(&released[0], &erased));
    }
}
