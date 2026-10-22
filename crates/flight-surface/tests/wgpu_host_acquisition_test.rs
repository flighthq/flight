use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::{FlightError, FlightErrorKind, get_entity_id};
use flight_host::{ProviderRef, WgpuDevice, WgpuSurfaceContext};
use flight_surface::contract::*;

use crate::block_on;

// A presentation surface whose size a provider can change after acquisition.
fn live_surface(width: Arc<AtomicU32>, height: Arc<AtomicU32>) -> WgpuPresentationSurface {
    return WgpuPresentationSurface {
        height: Arc::new(move || f32::from_bits(height.load(Ordering::SeqCst))),
        width: Arc::new(move || f32::from_bits(width.load(Ordering::SeqCst))),
    };
}

mod create_wgpu_host_acquisition {
    use super::*;

    #[test]
    fn allocates_an_entity_with_flight_ownership_no_format_and_a_zero_sized_surface() {
        let acquisition = create_wgpu_host_acquisition();
        let _: &dyn flight_entity::Entity = &acquisition;
        assert_eq!(acquisition.ownership, WgpuHostAcquisitionOwnership::Flight);
        assert_eq!(acquisition.format, "");
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (0.0, 0.0)
        );
    }

    #[test]
    fn carries_the_providers_exact_device_and_context_handles_once_assigned() {
        let provider: ProviderRef = Arc::new(());
        let device = WgpuDevice {
            provider: provider.clone(),
            handle: Arc::new(7_u32),
        };
        let context = WgpuSurfaceContext {
            provider: provider.clone(),
            handle: Arc::new(8_u32),
        };
        let mut acquisition = create_wgpu_host_acquisition();
        acquisition.device = device.clone();
        acquisition.context = context.clone();
        acquisition.format = "bgra8unorm".to_string();
        acquisition.ownership = WgpuHostAcquisitionOwnership::Caller;
        assert!(Arc::ptr_eq(&acquisition.device.handle, &device.handle));
        assert!(Arc::ptr_eq(&acquisition.context.handle, &context.handle));
        assert!(Arc::ptr_eq(
            &acquisition.device.provider,
            &acquisition.context.provider
        ));
    }

    #[test]
    fn reads_the_presentation_size_live_rather_than_as_a_snapshot() {
        let width = Arc::new(AtomicU32::new(640.0_f32.to_bits()));
        let height = Arc::new(AtomicU32::new(480.0_f32.to_bits()));
        let mut acquisition = create_wgpu_host_acquisition();
        acquisition.surface = live_surface(width.clone(), height.clone());
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (640.0, 480.0)
        );
        width.store(1280.0_f32.to_bits(), Ordering::SeqCst);
        height.store(720.0_f32.to_bits(), Ordering::SeqCst);
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (1280.0, 720.0)
        );
    }

    #[test]
    fn settles_an_asynchronous_acquire_and_a_provider_rejection_through_the_capability() {
        let released = Arc::new(Mutex::new(Vec::new()));
        let record = released.clone();
        let fail = Arc::new(AtomicU32::new(0));
        let failing = fail.clone();
        let capability = HostWgpuCapability {
            provider: Arc::new(()),
            acquire: Arc::new(move |_surface, options| {
                if failing.load(Ordering::SeqCst) == 1 {
                    let error = FlightError {
                        kind: FlightErrorKind::Error,
                        message: "no adapter".to_string(),
                    };
                    return Box::pin(std::future::ready(Err(error)));
                }
                let mut acquisition = create_wgpu_host_acquisition();
                acquisition.format = options
                    .format
                    .clone()
                    .unwrap_or_else(|| "rgba8unorm".to_string());
                return Box::pin(std::future::ready(Ok(acquisition)));
            }),
            attach_surface: Arc::new(|_surface, _attachment| None),
            create: Arc::new(|_window, _width, _height| None),
            is_supported: Arc::new(|| true),
            release: Arc::new(move |acquisition| {
                record.lock().unwrap().push(get_entity_id(acquisition))
            }),
        };
        let surface: SurfaceRef =
            Arc::new(std::sync::RwLock::new(flight_entity::allocate_entity::<
                SurfaceBase,
            >()));
        let options = WgpuHostAcquisitionOptions {
            format: Some("bgra8unorm".to_string()),
            power_preference: Some(GpuPowerPreference::HighPerformance),
        };
        let acquisition =
            block_on((capability.acquire)(&surface, &options)).expect("an acquisition");
        assert_eq!(acquisition.format, "bgra8unorm");
        (capability.release)(&acquisition);
        assert_eq!(*released.lock().unwrap(), vec![get_entity_id(&acquisition)]);

        fail.store(1, Ordering::SeqCst);
        let refused = block_on((capability.acquire)(&surface, &options));
        assert_eq!(
            refused.err().map(|error| error.message),
            Some("no adapter".to_string())
        );
        assert!(
            (capability.attach_surface)(
                &surface,
                &WgpuSurfaceAttachment {
                    alpha_mode: GpuCanvasAlphaMode::Opaque,
                    device: acquisition.device.clone(),
                    format: acquisition.format.clone(),
                }
            )
            .is_none()
        );
    }
}

mod initialize_wgpu_host_acquisition {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_host_acquisition() {
        let mut acquisition = create_wgpu_host_acquisition();
        let id = get_entity_id(&acquisition);
        acquisition.format = "bgra8unorm".to_string();
        acquisition.ownership = WgpuHostAcquisitionOwnership::Caller;
        acquisition.surface = live_surface(
            Arc::new(AtomicU32::new(1.0_f32.to_bits())),
            Arc::new(AtomicU32::new(2.0_f32.to_bits())),
        );
        initialize_wgpu_host_acquisition(&mut acquisition);
        assert_eq!(acquisition.format, "");
        assert_eq!(acquisition.ownership, WgpuHostAcquisitionOwnership::Flight);
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (0.0, 0.0)
        );
        assert_eq!(get_entity_id(&acquisition), id);
    }
}
