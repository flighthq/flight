//! flight-compiler: target-native

use std::sync::{Arc, Mutex};

use flight_app::contract::{AppWindow, create_app_window};
use flight_entity::Ref;
use flight_host::NativeSurfaceHandle;
use flight_surface::contract::*;

mod host_gl_capability {
    use super::*;

    #[test]
    fn passes_the_device_pixel_extent_to_the_host_exactly() {
        // The device-pixel extent is a TS Number carried as f64 until the host writes its device
        // storage. 16777217 and 16777219 are integers an f32 lane cannot hold: it would pass
        // 16777216 and 16777220.
        type GlCreate = dyn Fn(&Ref<AppWindow>, f64, f64, Option<&GlContextOptions>) -> Option<NativeSurfaceHandle>
            + Send
            + Sync;
        let created = Arc::new(Mutex::new(Vec::new()));
        let record = created.clone();
        let create: Arc<GlCreate> = Arc::new(move |_window, width, height, _options| {
            record.lock().unwrap().push((width, height));
            return None;
        });
        let capability = HostGlCapability {
            provider: Arc::new(()),
            acquire: Arc::new(|_, _| None),
            create,
            release: Arc::new(|_| {}),
            subscribe: Arc::new(|_, _, _| Arc::new(|| {})),
        };
        (capability.create)(&create_app_window(), 16_777_217.0, 16_777_219.0, None);
        assert_eq!(*created.lock().unwrap(), vec![(16_777_217.0, 16_777_219.0)]);
    }
}
