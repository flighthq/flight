use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

use flight_host::HostImageSource;
use flight_render_wgpu::*;

use crate::support::*;

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn create_destination(native: &WgpuNativeDevice) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
}

fn external_source(fake: &Arc<TestImageSource>) -> Arc<dyn WgpuExternalImageSource> {
    return fake.clone();
}

mod create_wgpu_external_host_image_source {
    use super::*;

    #[test]
    fn wraps_the_source_as_a_host_image_that_narrows_back_to_the_same_payload() {
        let (_, fake) = create_test_image(4, 4, true);
        let source = external_source(&fake);
        let image = create_wgpu_external_host_image_source(test_provider(), source.clone());
        assert!(Arc::ptr_eq(&image.provider, &test_provider()));
        let narrowed = image
            .handle
            .downcast_ref::<Arc<dyn WgpuExternalImageSource>>()
            .expect("the handle carries the external payload");
        assert!(Arc::ptr_eq(narrowed, &source));
    }
}

mod is_wgpu_external_image_source_ready {
    use super::*;

    // A native source has no 2D context to probe; the observable equivalent of "never binds the
    // context" is that the predicate performs no copy.
    #[test]
    fn accepts_a_dimension_valid_canvas_without_probing_or_binding_its_context() {
        let (_, fake) = create_test_image(4, 4, true);
        assert!(is_wgpu_external_image_source_ready(fake.as_ref(), 4, 4));
        assert_eq!(fake.copy_attempt_count(), 0);
    }

    #[test]
    fn accepts_a_decoded_image_with_enough_pixels() {
        let (_, fake) = create_test_image(4, 4, true);
        assert!(is_wgpu_external_image_source_ready(fake.as_ref(), 4, 4));
    }

    #[test]
    fn rejects_zero_extents_and_undersized_sources() {
        let (_, fake) = create_test_image(4, 4, true);
        assert!(!is_wgpu_external_image_source_ready(fake.as_ref(), 0, 4));
        assert!(!is_wgpu_external_image_source_ready(fake.as_ref(), 5, 4));
    }

    #[test]
    fn rejects_an_undecoded_image_element() {
        let (_, fake) = create_test_image(0, 0, false);
        assert!(!is_wgpu_external_image_source_ready(fake.as_ref(), 1, 1));
    }

    // A Rust predicate only ever sees the narrowed trait object, so an unrecognized host payload is
    // caught at narrowing: it panics (D10) rather than failing open into a copy.
    #[test]
    fn rejects_an_unrecognized_source_instead_of_failing_open() {
        let native = create_test_native_device();
        let texture = create_destination(&native);
        let foreign = HostImageSource {
            provider: test_provider(),
            handle: Arc::new(42u32),
        };
        let result = catch_unwind(AssertUnwindSafe(|| {
            upload_wgpu_texture_element(&native, &texture, wgpu::Origin3d::ZERO, 1, 1, &foreign);
        }));
        assert!(panic_message(result.unwrap_err()).contains("WgpuExternalImageSource"));
    }
}

mod try_copy_wgpu_external_image_to_texture {
    use super::*;

    #[test]
    fn copies_a_ready_source() {
        let native = create_test_native_device();
        let texture = create_destination(&native);
        let (_, fake) = create_test_image(4, 4, true);
        assert!(try_copy_wgpu_external_image_to_texture(
            &native.queue,
            fake.as_ref(),
            &texture,
            wgpu::Origin3d::ZERO,
            false,
            4,
            4,
        ));
        assert_eq!(
            *fake.copies.lock().unwrap(),
            vec![TestImageCopy {
                height: 4,
                origin: [0, 0, 0],
                premultiplied_alpha: false,
                texture: texture.clone(),
                width: 4,
            }]
        );
    }

    #[test]
    fn fails_closed_when_a_canvas_has_no_usable_context() {
        let native = create_test_native_device();
        let texture = create_destination(&native);
        let (_, fake) = create_test_image(4, 4, true);
        *fake.copy_error.lock().unwrap() = Some(WgpuExternalCopyError::NotReady);
        assert!(!try_copy_wgpu_external_image_to_texture(
            &native.queue,
            fake.as_ref(),
            &texture,
            wgpu::Origin3d::ZERO,
            false,
            4,
            4,
        ));
    }

    #[test]
    fn fails_closed_when_the_browser_cannot_snapshot_current_canvas_content() {
        let native = create_test_native_device();
        let texture = create_destination(&native);
        let (_, fake) = create_test_image(4, 4, true);
        *fake.copy_error.lock().unwrap() = Some(WgpuExternalCopyError::CopyFailed);
        assert!(!try_copy_wgpu_external_image_to_texture(
            &native.queue,
            fake.as_ref(),
            &texture,
            wgpu::Origin3d::ZERO,
            false,
            4,
            4,
        ));
    }

    #[test]
    fn rethrows_security_failures() {
        let native = create_test_native_device();
        let texture = create_destination(&native);
        let (_, fake) = create_test_image(4, 4, true);
        *fake.copy_error.lock().unwrap() =
            Some(WgpuExternalCopyError::Invalid("tainted canvas".to_string()));
        let result = catch_unwind(AssertUnwindSafe(|| {
            try_copy_wgpu_external_image_to_texture(
                &native.queue,
                fake.as_ref(),
                &texture,
                wgpu::Origin3d::ZERO,
                false,
                4,
                4,
            );
        }));
        assert!(panic_message(result.unwrap_err()).contains("tainted canvas"));
    }
}
