use std::sync::Arc;

use flight_host::contract::*;

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
fn wgpu_handles_from_one_provider_share_provider_identity_but_not_handle_identity() {
    let provider: ProviderRef = Arc::new(());
    let device = WgpuDevice {
        provider: provider.clone(),
        handle: Arc::new(1_u8),
    };
    let context = WgpuSurfaceContext {
        provider: provider.clone(),
        handle: Arc::new(2_u8),
    };
    assert!(Arc::ptr_eq(&device.provider, &context.provider));
    assert!(!Arc::ptr_eq(&device.handle, &context.handle));
    assert!(device.handle.downcast_ref::<u16>().is_none());
}

#[test]
fn a_shared_host_image_source_keeps_one_platform_identity_across_holders() {
    let source = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new("image"),
    });
    let held = source.clone();
    assert!(Arc::ptr_eq(&held, &source));
    assert_eq!(held.handle.downcast_ref::<&str>(), Some(&"image"));
}

#[test]
fn native_handles_keep_their_platform_object_and_provider_through_a_copy() {
    let provider: ProviderRef = Arc::new(());
    let surface = NativeSurfaceHandle {
        provider: provider.clone(),
        handle: Arc::new(7_i32),
    };
    let window = NativeWindowHandle {
        provider: provider.clone(),
        handle: Arc::new(8_i32),
    };
    let view = NativeViewHandle {
        provider: provider.clone(),
        handle: Arc::new(9_i32),
    };
    let stream = MediaStreamHandle {
        provider: provider.clone(),
        handle: Arc::new(10_i32),
    };
    let face = FontFaceHandle {
        provider: provider.clone(),
        handle: Arc::new(11_i32),
    };
    let canvas = CanvasRenderingContext2D {
        provider: provider.clone(),
        handle: Arc::new(12_i32),
    };
    assert!(Arc::ptr_eq(&surface.clone().handle, &surface.handle));
    assert!(Arc::ptr_eq(&window.clone().handle, &window.handle));
    assert!(Arc::ptr_eq(&view.clone().handle, &view.handle));
    assert!(Arc::ptr_eq(&stream.clone().handle, &stream.handle));
    assert!(Arc::ptr_eq(&face.clone().handle, &face.handle));
    assert!(Arc::ptr_eq(&canvas.clone().handle, &canvas.handle));
    for token in [
        &surface.provider,
        &window.provider,
        &view.provider,
        &stream.provider,
        &face.provider,
        &canvas.provider,
    ] {
        assert!(Arc::ptr_eq(token, &provider));
    }
    assert_eq!(surface.handle.downcast_ref::<i32>(), Some(&7));
}

#[test]
fn input_ingress_sources_are_told_apart_by_handle_identity_not_by_provider() {
    let provider: ProviderRef = Arc::new(());
    let first = InputIngressSource {
        provider: provider.clone(),
        handle: Arc::new(()),
    };
    let second = InputIngressSource {
        provider: provider.clone(),
        handle: Arc::new(()),
    };
    assert!(Arc::ptr_eq(&first.clone().handle, &first.handle));
    assert!(Arc::ptr_eq(&first.provider, &second.provider));
    assert!(!Arc::ptr_eq(&first.handle, &second.handle));
}
