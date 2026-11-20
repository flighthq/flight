use std::sync::{Arc, RwLock};

use flight_host_headless::*;
use flight_render_wgpu::*;
use flight_surface::WgpuHostAcquisitionOptions;

use crate::support::*;

mod create_bitmap_from_headless_screen_render_target {
    use super::*;

    // The known scene, rendered offscreen through the SDK and read back through the SDK's capture,
    // matches the analytically known frame exactly: every pixel, every channel. Solid opaque fills
    // on whole pixels leave no rounding for any adapter, software or hardware, to differ on, so
    // the tolerance is zero.
    #[test]
    fn reads_back_the_known_scene_pixel_for_pixel() {
        let Some(mut host) =
            create_test_headless_host("reads_back_the_known_scene_pixel_for_pixel")
        else {
            return;
        };
        let screen = render_known_scene(&host);
        let actual = create_bitmap_from_headless_screen_render_target(&screen, Some(10_000))
            .expect("a captured frame reads back");
        let expected = create_known_scene_expected_bitmap();
        assert_eq!((actual.width, actual.height), (SCENE_WIDTH, SCENE_HEIGHT));
        let mismatches: Vec<(u32, u32, &[u8], &[u8])> = (0..SCENE_HEIGHT)
            .flat_map(|y| (0..SCENE_WIDTH).map(move |x| (x, y)))
            .filter_map(|(x, y)| {
                let offset = ((y * SCENE_WIDTH + x) * 4) as usize;
                let got = &actual.data[offset..offset + 4];
                let want = &expected.data[offset..offset + 4];
                return (got != want).then_some((x, y, got, want));
            })
            .collect();
        assert!(
            mismatches.is_empty(),
            "{} of {} pixels differ on {} ({}); first: {:?}",
            mismatches.len(),
            SCENE_WIDTH * SCENE_HEIGHT,
            get_headless_host_adapter_name(&host),
            get_headless_host_adapter_backend(&host),
            &mismatches[..mismatches.len().min(8)]
        );
        drop(screen);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn returns_none_for_a_target_that_never_enabled_capture() {
        let Some(mut host) =
            create_test_headless_host("returns_none_for_a_target_that_never_enabled_capture")
        else {
            return;
        };
        let surface = create_headless_host_surface(&host, 4, 4);
        let screen = create_wgpu_screen_render_target(
            get_headless_host_wgpu_capability(&host),
            get_headless_host_wgpu_device(&host),
            &surface,
            None,
        );
        let screen = Arc::new(RwLock::new(screen));
        assert!(create_bitmap_from_headless_screen_render_target(&screen, Some(1_000)).is_none());
        drop(screen);
        destroy_headless_host(&mut host);
    }
}

mod create_headless_host {
    use super::*;

    #[test]
    fn opens_a_device_the_sdk_can_build_a_render_state_on() {
        let Some(mut host) =
            create_test_headless_host("opens_a_device_the_sdk_can_build_a_render_state_on")
        else {
            return;
        };
        let state = create_wgpu_render_state(get_headless_host_wgpu_device(&host), None);
        let native = get_wgpu_render_state_native_device(&state);
        let texture = native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 2,
                height: 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        assert_eq!(texture.width(), 2);
        drop(state);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn opens_an_adapter_only_on_an_allowed_backend() {
        let Some(mut host) =
            create_test_headless_host("opens_an_adapter_only_on_an_allowed_backend")
        else {
            return;
        };
        let backend = get_headless_host_adapter_backend(&host).to_string();
        destroy_headless_host(&mut host);
        let mut only = create_headless_host_options();
        only.allow_dx12 = backend == "dx12";
        only.allow_metal = backend == "metal";
        only.allow_vulkan = backend == "vulkan";
        let mut same = create_headless_host(Some(&only)).expect("the same backend opens again");
        assert_eq!(get_headless_host_adapter_backend(&same), backend);
        destroy_headless_host(&mut same);
        let mut without = create_headless_host_options();
        without.allow_dx12 = backend != "dx12";
        without.allow_metal = backend != "metal";
        without.allow_vulkan = backend != "vulkan";
        if let Some(mut other) = create_headless_host(Some(&without)) {
            assert_ne!(get_headless_host_adapter_backend(&other), backend);
            destroy_headless_host(&mut other);
        }
    }

    #[test]
    fn returns_none_when_no_backend_is_selected() {
        let mut options = create_headless_host_options();
        options.allow_dx12 = false;
        options.allow_metal = false;
        options.allow_vulkan = false;
        assert!(create_headless_host(Some(&options)).is_none());
    }
}

mod create_headless_host_options {
    use super::*;

    #[test]
    fn accepts_every_backend_and_a_software_adapter_with_no_power_preference() {
        let options = create_headless_host_options();
        assert!(options.allow_software_adapter);
        assert!(options.allow_dx12 && options.allow_metal && options.allow_vulkan);
        assert_eq!(options.power_preference, HeadlessHostPowerPreference::None);
    }
}

mod create_headless_host_render_target {
    use super::*;

    #[test]
    fn creates_a_capture_enabled_rgba_screen_target_of_the_requested_extent() {
        let Some(mut host) = create_test_headless_host(
            "creates_a_capture_enabled_rgba_screen_target_of_the_requested_extent",
        ) else {
            return;
        };
        let target = create_headless_host_render_target(&host, 20, 12);
        let WgpuRenderTarget::Screen(screen) = &target else {
            panic!("a headless render target is a screen target");
        };
        {
            let screen = screen.read().unwrap();
            assert!(screen.capture_enabled);
            assert_eq!(screen.format, wgpu::TextureFormat::Rgba8Unorm);
            assert_eq!((screen.width, screen.height), (20, 12));
        }
        assert!(is_wgpu_screen_render_target(&target));
        drop(target);
        destroy_headless_host(&mut host);
    }
}

mod destroy_headless_host {
    use super::*;

    #[test]
    fn destroys_the_device_once_and_marks_the_host() {
        let Some(mut host) =
            create_test_headless_host("destroys_the_device_once_and_marks_the_host")
        else {
            return;
        };
        let state = create_wgpu_render_state(get_headless_host_wgpu_device(&host), None);
        destroy_headless_host(&mut host);
        destroy_headless_host(&mut host);
        assert!(is_headless_host_destroyed(&host));
        // The loss settles through the host's spawned continuation; give it a bounded while.
        let native = get_wgpu_render_state_native_device(&state);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let lost = loop {
            let _ = native.device.poll(wgpu::PollType::Poll);
            if let Some(lost) = get_wgpu_device_loss(&state) {
                break lost;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the loss never settled"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        };
        assert_eq!(lost.reason, WgpuDeviceLostReason::Destroyed);
    }
}

mod get_headless_host_adapter_backend {
    use super::*;

    #[test]
    fn names_a_backend_the_options_selected() {
        let Some(mut host) = create_test_headless_host("names_a_backend_the_options_selected")
        else {
            return;
        };
        assert!(
            ["vulkan", "metal", "dx12"].contains(&get_headless_host_adapter_backend(&host)),
            "{}",
            get_headless_host_adapter_backend(&host)
        );
        destroy_headless_host(&mut host);
    }
}

mod get_headless_host_adapter_name {
    use super::*;

    #[test]
    fn matches_the_adapter_the_explanation_reports() {
        let Some(mut host) =
            create_test_headless_host("matches_the_adapter_the_explanation_reports")
        else {
            return;
        };
        let explanation = explain_headless_host(None);
        assert_eq!(
            get_headless_host_adapter_name(&host),
            explanation.adapter_name
        );
        assert!(!get_headless_host_adapter_name(&host).is_empty());
        destroy_headless_host(&mut host);
    }
}

mod get_headless_host_wgpu_capability {
    use super::*;

    #[test]
    fn acquires_the_hosts_own_device_for_a_headless_surface_immediately() {
        let Some(mut host) = create_test_headless_host(
            "acquires_the_hosts_own_device_for_a_headless_surface_immediately",
        ) else {
            return;
        };
        let surface = create_headless_host_surface(&host, 32, 16);
        let capability = get_headless_host_wgpu_capability(&host);
        assert!((capability.is_supported)());
        let acquired = pollster::block_on(create_wgpu_acquisition(
            capability,
            &surface,
            Some(&WgpuHostAcquisitionOptions {
                format: None,
                power_preference: None,
            }),
        ))
        .expect("an immediate acquisition");
        assert!(Arc::ptr_eq(
            &acquired.device.handle,
            &get_headless_host_wgpu_device(&host).handle
        ));
        assert_eq!(acquired.format, "rgba8unorm");
        assert_eq!(
            ((acquired.surface.width)(), (acquired.surface.height)()),
            (32.0, 16.0)
        );
        release_wgpu_acquisition(capability, &acquired);
        destroy_headless_host(&mut host);
    }

    #[test]
    fn refuses_to_attach_a_surface_another_host_created() {
        let Some(mut host) =
            create_test_headless_host("refuses_to_attach_a_surface_another_host_created")
        else {
            return;
        };
        let foreign: flight_surface::SurfaceRef =
            flight_surface::allocate_surface::<flight_surface::SurfaceBase>(None);
        let capability = get_headless_host_wgpu_capability(&host);
        let attached = (capability.attach_surface)(
            &foreign,
            &flight_surface::WgpuSurfaceAttachment {
                alpha_mode: flight_surface::GpuCanvasAlphaMode::Premultiplied,
                device: get_headless_host_wgpu_device(&host).clone(),
                format: "rgba8unorm".to_string(),
            },
        );
        assert!(attached.is_none());
        destroy_headless_host(&mut host);
    }
}

mod get_headless_host_wgpu_device {
    use super::*;

    #[test]
    fn carries_the_native_device_the_sdk_narrows() {
        let Some(mut host) = create_test_headless_host("carries_the_native_device_the_sdk_narrows")
        else {
            return;
        };
        let device = get_headless_host_wgpu_device(&host);
        assert!(device.handle.downcast_ref::<WgpuNativeDevice>().is_some());
        destroy_headless_host(&mut host);
    }
}

mod is_headless_host_destroyed {
    use super::*;

    #[test]
    fn is_false_until_the_host_is_destroyed() {
        let Some(mut host) = create_test_headless_host("is_false_until_the_host_is_destroyed")
        else {
            return;
        };
        assert!(!is_headless_host_destroyed(&host));
        destroy_headless_host(&mut host);
        assert!(is_headless_host_destroyed(&host));
    }
}

mod is_headless_host_software_adapter {
    use super::*;

    #[test]
    fn rejects_hosts_whose_only_adapters_are_software_when_software_is_refused() {
        let Some(mut host) = create_test_headless_host(
            "rejects_hosts_whose_only_adapters_are_software_when_software_is_refused",
        ) else {
            return;
        };
        let mut options = create_headless_host_options();
        options.allow_software_adapter = false;
        let hardware = create_headless_host(Some(&options));
        if is_headless_host_software_adapter(&host) {
            assert!(hardware.is_none());
        } else if let Some(mut hardware) = hardware {
            assert!(!is_headless_host_software_adapter(&hardware));
            destroy_headless_host(&mut hardware);
        }
        destroy_headless_host(&mut host);
    }
}
