use std::sync::Arc;

use flight_hostcapability::contract::*;

struct NativeContext {
    generation: u32,
}

// A record copy keeps the exact platform object: the handle's Arc identity is the platform identity,
// and the consuming backend narrows it back to its native type.
#[test]
fn a_gl_context_copy_shares_the_platform_handle_and_narrows_to_its_native_type() {
    let provider: ProviderRef = Arc::new(());
    let context = GlContext {
        provider: provider.clone(),
        handle: Arc::new(NativeContext { generation: 3 }),
    };
    let copy = context.clone();
    assert!(Arc::ptr_eq(&copy.handle, &context.handle));
    assert!(Arc::ptr_eq(&copy.provider, &provider));
    assert_eq!(
        copy.handle
            .downcast_ref::<NativeContext>()
            .map(|native| native.generation),
        Some(3)
    );
}

#[test]
fn gpu_handles_from_one_provider_share_provider_identity_but_not_handle_identity() {
    let provider: ProviderRef = Arc::new(());
    let device = GpuDevice {
        provider: provider.clone(),
        handle: Arc::new(1_u8),
    };
    let context = GpuCanvasContext {
        provider: provider.clone(),
        handle: Arc::new(2_u8),
    };
    assert!(Arc::ptr_eq(&device.provider, &context.provider));
    assert!(!Arc::ptr_eq(&device.handle, &context.handle));
    assert!(device.handle.downcast_ref::<u16>().is_none());
}
