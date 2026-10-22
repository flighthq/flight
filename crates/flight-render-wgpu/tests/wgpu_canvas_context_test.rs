use std::sync::Arc;
use std::sync::atomic::Ordering;

use flight_render_wgpu::*;

use crate::support::*;

fn create_test_texture(native: &WgpuNativeDevice, width: u32, height: u32) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Bgra8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
}

mod create_wgpu_canvas_frame {
    use super::*;

    #[test]
    fn wraps_the_texture_a_screen_frame_draws_into() {
        let native = create_test_native_device();
        let texture = create_test_texture(&native, 8, 4);

        let frame = create_wgpu_canvas_frame(texture.clone());

        assert_eq!(frame.texture, texture);
        assert_eq!(frame.texture.width(), 8);
        assert_eq!(frame.texture.height(), 4);
    }

    // The surface lease is crate-private; a frame with no lease is observable as one a context can
    // present, which hands the same texture back to it.
    #[test]
    fn builds_a_frame_a_lease_free_context_presents_as_is() {
        let native = create_test_native_device();
        let texture = create_test_texture(&native, 2, 2);
        let canvas = create_test_canvas(2, 2);

        WgpuCanvasContext::present(
            &*canvas.context,
            &native,
            create_wgpu_canvas_frame(texture.clone()),
        );

        assert_eq!(canvas.context.present_count.load(Ordering::SeqCst), 1);
        assert_eq!(*canvas.context.presented.lock().unwrap(), vec![texture]);
    }
}

mod create_wgpu_surface_context {
    use super::*;

    #[test]
    fn keeps_the_provider_it_was_given() {
        let canvas = create_test_canvas(4, 4);
        let context: Arc<dyn WgpuCanvasContext> = canvas.context.clone();
        let provider = test_provider();

        let surface_context = create_wgpu_surface_context(provider.clone(), context);

        assert!(Arc::ptr_eq(&surface_context.provider, &provider));
    }

    #[test]
    fn carries_the_canvas_context_with_its_arc_identity_as_the_platform_identity() {
        let canvas = create_test_canvas(4, 4);
        let context: Arc<dyn WgpuCanvasContext> = canvas.context.clone();

        let surface_context = create_wgpu_surface_context(test_provider(), context);

        let carried = surface_context
            .handle
            .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
            .expect("the handle carries an Arc<dyn WgpuCanvasContext>");
        assert_eq!(
            Arc::as_ptr(carried) as *const u8,
            Arc::as_ptr(&canvas.context) as *const u8
        );
    }

    #[test]
    fn routes_calls_through_the_handle_to_the_wrapped_context() {
        let canvas = create_test_canvas(4, 4);
        let context: Arc<dyn WgpuCanvasContext> = canvas.context.clone();
        let surface_context = create_wgpu_surface_context(test_provider(), context);
        let carried = surface_context
            .handle
            .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
            .expect("the handle carries an Arc<dyn WgpuCanvasContext>")
            .clone();

        WgpuCanvasContext::unconfigure(&*carried);

        assert_eq!(canvas.context.unconfigure_count.load(Ordering::SeqCst), 1);
    }
}
