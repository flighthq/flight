use std::sync::{Arc, RwLock};

use flight_host_headless::*;
use flight_render_wgpu::*;

use crate::support::*;

mod explain_headless_screen_render_target_read_back {
    use super::*;

    // A screen target over a fresh headless surface, capture as asked, nothing rendered.
    fn create_target(
        host: &HeadlessHost,
        capture: bool,
    ) -> flight_entity::Ref<WgpuScreenRenderTarget> {
        let surface = create_headless_host_surface(host, 8, 8);
        let mut screen = create_wgpu_screen_render_target(
            get_headless_host_wgpu_capability(host),
            get_headless_host_wgpu_device(host),
            &surface,
            None,
        );
        if capture {
            enable_wgpu_screen_render_target_capture(&mut screen);
        }
        return Arc::new(RwLock::new(screen));
    }

    #[test]
    fn reports_capture_not_enabled_for_a_plain_target() {
        let Some(mut host) =
            create_test_headless_host("reports_capture_not_enabled_for_a_plain_target")
        else {
            return;
        };
        let screen = create_target(&host, false);
        let explanation = explain_headless_screen_render_target_read_back(&screen, Some(1_000));
        assert_eq!(
            explanation.reason,
            HeadlessReadBackExplanationReason::CaptureNotEnabled
        );
        assert!(explanation.message.is_empty());
        assert!(create_bitmap_from_headless_screen_render_target(&screen, Some(1_000)).is_none());
        drop(screen);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn reports_no_captured_frame_before_a_frame_is_submitted() {
        let Some(mut host) =
            create_test_headless_host("reports_no_captured_frame_before_a_frame_is_submitted")
        else {
            return;
        };
        let screen = create_target(&host, true);
        let explanation = explain_headless_screen_render_target_read_back(&screen, Some(1_000));
        assert_eq!(
            explanation.reason,
            HeadlessReadBackExplanationReason::NoCapturedFrame
        );
        assert!(create_bitmap_from_headless_screen_render_target(&screen, Some(1_000)).is_none());
        drop(screen);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn reports_ready_exactly_when_the_read_back_succeeds() {
        let Some(mut host) =
            create_test_headless_host("reports_ready_exactly_when_the_read_back_succeeds")
        else {
            return;
        };
        let screen = render_known_scene(&host);
        let explanation = explain_headless_screen_render_target_read_back(&screen, Some(10_000));
        assert_eq!(explanation.reason, HeadlessReadBackExplanationReason::Ready);
        assert!(explanation.message.is_empty());
        let bitmap = create_bitmap_from_headless_screen_render_target(&screen, Some(10_000))
            .expect("the explained frame reads back");
        assert_eq!((bitmap.width, bitmap.height), (SCENE_WIDTH, SCENE_HEIGHT));
        drop(screen);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn reports_a_map_failure_in_the_sdks_words() {
        let Some(mut host) = create_test_headless_host("reports_a_map_failure_in_the_sdks_words")
        else {
            return;
        };
        // A capture buffer on a second, live device: the target's device never settles its map,
        // so the read-back gives up by name at the timeout.
        let Some(mut other) = create_headless_host(None) else {
            destroy_headless_host(&mut host);
            return;
        };
        let other_native = get_headless_host_wgpu_device(&other)
            .handle
            .downcast_ref::<WgpuNativeDevice>()
            .unwrap()
            .clone();
        let foreign = other_native.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 256,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let screen = create_target(&host, true);
        {
            let mut target = screen.write().unwrap();
            target.capture_buffer = Some(foreign);
            target.capture_bytes_per_row = 256;
            target.capture_width = 1;
            target.capture_height = 1;
        }
        let explanation = explain_headless_screen_render_target_read_back(&screen, Some(50));
        assert_eq!(
            explanation.reason,
            HeadlessReadBackExplanationReason::MapFailed
        );
        assert!(
            explanation.message.contains("did not map within 50ms"),
            "{}",
            explanation.message
        );
        drop(screen);
        destroy_headless_host(&mut other);
        destroy_headless_host(&mut host);
    }
}
