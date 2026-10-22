use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_render::*;
use flight_surface::{CanvasSurface, HostCanvasCapability};

fn surface() -> Ref<CanvasSurface> {
    return Arc::new(RwLock::new(crate::support::test_default::<CanvasSurface>()));
}

fn host(
    create_surface: Arc<dyn Fn(f32, f32) -> Option<Ref<CanvasSurface>> + Send + Sync>,
    destroy_surface: Arc<dyn Fn(&Ref<CanvasSurface>) + Send + Sync>,
) -> HostCanvasCapability {
    return HostCanvasCapability {
        provider: Arc::new(()),
        acquire: Arc::new(|_, _| None),
        create: Arc::new(|_, _, _, _| None),
        create_surface,
        destroy_surface,
        release: Arc::new(|_| {}),
    };
}

mod create_canvas_host_surface {
    use super::*;

    #[test]
    fn create_canvas_host_surface_passes_dimensions_and_preserves_result() {
        let expected = surface();
        let returned = expected.clone();
        let dimensions = Arc::new(Mutex::new(Vec::new()));
        let calls = dimensions.clone();
        let host = host(
            Arc::new(move |width, height| {
                calls.lock().unwrap().push((width, height));
                return Some(returned.clone());
            }),
            Arc::new(|_| {}),
        );
        let mut surfaces = crate::support::test_default::<CanvasHostSurfaces>();
        let actual = create_canvas_host_surface(&mut surfaces, &host, 30.0, 40.0).unwrap();
        assert!(Arc::ptr_eq(&actual, &expected));
        assert_eq!(*dimensions.lock().unwrap(), vec![(30.0, 40.0)]);
    }

    #[test]
    fn create_canvas_host_surface_preserves_host_refusal() {
        let host = host(Arc::new(|_, _| None), Arc::new(|_| {}));
        assert!(
            create_canvas_host_surface(
                &mut crate::support::test_default::<CanvasHostSurfaces>(),
                &host,
                10.0,
                20.0
            )
            .is_none()
        );
    }
}

mod destroy_canvas_host_surface {
    use super::*;

    #[test]
    fn destroy_canvas_host_surface_routes_each_surface_to_its_host() {
        let first_surface = surface();
        let second_surface = surface();
        let first_return = first_surface.clone();
        let second_return = second_surface.clone();
        let first_destroyed = Arc::new(Mutex::new(Vec::new()));
        let second_destroyed = Arc::new(Mutex::new(Vec::new()));
        let first_calls = first_destroyed.clone();
        let second_calls = second_destroyed.clone();
        let first = host(
            Arc::new(move |_, _| Some(first_return.clone())),
            Arc::new(move |value| first_calls.lock().unwrap().push(value.clone())),
        );
        let second = host(
            Arc::new(move |_, _| Some(second_return.clone())),
            Arc::new(move |value| second_calls.lock().unwrap().push(value.clone())),
        );
        let mut surfaces = crate::support::test_default::<CanvasHostSurfaces>();
        create_canvas_host_surface(&mut surfaces, &first, 10.0, 20.0);
        create_canvas_host_surface(&mut surfaces, &second, 30.0, 40.0);
        destroy_canvas_host_surface(&mut surfaces, &first_surface);
        destroy_canvas_host_surface(&mut surfaces, &second_surface);
        assert_eq!(first_destroyed.lock().unwrap().len(), 1);
        assert_eq!(second_destroyed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(
            &first_destroyed.lock().unwrap()[0],
            &first_surface
        ));
        assert!(Arc::ptr_eq(
            &second_destroyed.lock().unwrap()[0],
            &second_surface
        ));
    }

    #[test]
    fn destroy_canvas_host_surface_is_noop_after_first_destroy() {
        let expected = surface();
        let returned = expected.clone();
        let count = Arc::new(Mutex::new(0));
        let calls = count.clone();
        let host = host(
            Arc::new(move |_, _| Some(returned.clone())),
            Arc::new(move |_| *calls.lock().unwrap() += 1),
        );
        let mut surfaces = crate::support::test_default::<CanvasHostSurfaces>();
        create_canvas_host_surface(&mut surfaces, &host, 10.0, 20.0);
        destroy_canvas_host_surface(&mut surfaces, &expected);
        destroy_canvas_host_surface(&mut surfaces, &expected);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn destroy_canvas_host_surface_is_noop_for_unknown_surface() {
        destroy_canvas_host_surface(
            &mut crate::support::test_default::<CanvasHostSurfaces>(),
            &surface(),
        );
    }
}

mod get_canvas_host_surface {
    use super::*;

    #[test]
    fn get_canvas_host_surface_returns_creating_host() {
        let expected = surface();
        let returned = expected.clone();
        let host = host(
            Arc::new(move |_, _| Some(returned.clone())),
            Arc::new(|_| {}),
        );
        let mut surfaces = crate::support::test_default::<CanvasHostSurfaces>();
        create_canvas_host_surface(&mut surfaces, &host, 1.0, 1.0);
        let actual = get_canvas_host_surface(&surfaces, &expected).unwrap();
        assert!(Arc::ptr_eq(&actual.create_surface, &host.create_surface));
    }

    #[test]
    fn get_canvas_host_surface_returns_none_for_unknown_surface() {
        assert!(
            get_canvas_host_surface(
                &crate::support::test_default::<CanvasHostSurfaces>(),
                &surface()
            )
            .is_none()
        );
    }

    #[test]
    fn get_canvas_host_surface_returns_none_after_destroy() {
        let expected = surface();
        let returned = expected.clone();
        let host = host(
            Arc::new(move |_, _| Some(returned.clone())),
            Arc::new(|_| {}),
        );
        let mut surfaces = crate::support::test_default::<CanvasHostSurfaces>();
        create_canvas_host_surface(&mut surfaces, &host, 1.0, 1.0);
        destroy_canvas_host_surface(&mut surfaces, &expected);
        assert!(get_canvas_host_surface(&surfaces, &expected).is_none());
    }
}
