use std::sync::{Arc, Mutex};

use flight_surface::contract::*;

fn surface() -> SurfaceRef {
    return allocate_surface::<SurfaceBase>(None);
}

fn assert_same_surface(seen: &SurfaceRef, expected: &SurfaceRef) {
    assert!(Arc::ptr_eq(seen, expected));
}

mod resize_surface {
    use super::*;

    #[test]
    fn routes_the_device_pixel_size_through_the_capability() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let recorded = calls.clone();
        let capability = HostSurfaceResizeCapability {
            provider: Arc::new(()),
            resize: Arc::new(move |target: &SurfaceRef, width: f32, height: f32| {
                recorded
                    .lock()
                    .unwrap()
                    .push((target.clone(), width, height));
            }),
        };
        let target = surface();
        resize_surface(&capability, &target, 1600.0, 1000.0);
        let calls = calls.lock().unwrap();
        assert_same_surface(&calls[0].0, &target);
        assert_eq!((calls[0].1, calls[0].2), (1600.0, 1000.0));
    }
}

mod set_surface_display_size {
    use super::*;

    #[test]
    fn routes_the_logical_size_through_the_capability_unscaled() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let recorded = calls.clone();
        let capability = HostSurfaceDisplayCapability {
            provider: Arc::new(()),
            set_display_size: Arc::new(move |target: &SurfaceRef, width: f32, height: f32| {
                recorded
                    .lock()
                    .unwrap()
                    .push((target.clone(), width, height));
            }),
        };
        let target = surface();
        let resize = HostSurfaceResizeCapability {
            provider: Arc::new(()),
            resize: Arc::new(|_, _, _| {}),
        };
        resize_surface(&resize, &target, 1600.0, 1000.0);
        set_surface_display_size(&capability, &target, 800.0, 500.0);
        let calls = calls.lock().unwrap();
        assert_same_surface(&calls[0].0, &target);
        assert_eq!((calls[0].1, calls[0].2), (800.0, 500.0));
    }
}
