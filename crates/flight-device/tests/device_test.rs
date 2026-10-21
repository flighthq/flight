use std::sync::{Arc, Mutex};

use flight_device::contract::*;
use flight_hostcapability::ProviderRef;
use flight_useragent::DEVICE_FORM_FACTOR_UNKNOWN;

fn fake_backend(refresh: Option<Arc<dyn Fn() + Send + Sync>>) -> HostDeviceCapability {
    let provider: ProviderRef = Arc::new(());
    return HostDeviceCapability {
        provider,
        get_capabilities: Arc::new(|out: &mut DeviceCapabilities| {
            out.has_keyboard = true;
            out.has_mouse = true;
            out.has_stylus = false;
        }),
        get_display_metrics: Arc::new(|out: &mut DeviceDisplayMetrics| {
            out.color_depth = 8;
            out.density_dpi = 440.0;
            out.logical_height = 800.0;
            out.logical_width = 360.0;
            out.physical_height = 1600.0;
            out.physical_width = 720.0;
            out.pixel_ratio = 2.0;
        }),
        get_id: Arc::new(|| "test-device-id".to_string()),
        get_info: Arc::new(|out: &mut DeviceInfo| {
            out.arch = "arm64".to_string();
            out.available_memory = 3_000_000_000.0;
            out.board_name = "msm8998".to_string();
            out.color_gamut = "display-p3".to_string();
            out.cpu_cores = 8;
            out.font_scale = 1.2;
            out.form_factor = "Phone".to_string();
            out.gpu_renderer = "Adreno 650".to_string();
            out.gpu_vendor = "Qualcomm".to_string();
            out.is_hdr = true;
            out.is_jailbroken = false;
            out.is_low_end_device = false;
            out.is_rooted = false;
            out.is_virtual = true;
            out.manufacturer = "Google".to_string();
            out.marketing_name = "Pixel 8 Pro".to_string();
            out.model = "Pixel".to_string();
            out.os_build = "TP1A.220624.014".to_string();
            out.os_name = "Android".to_string();
            out.os_version = "14".to_string();
            out.platform_string = "Linux armv8l".to_string();
            out.product_name = "husky".to_string();
            out.supported_abis = vec!["arm64-v8a".to_string(), "armeabi-v7a".to_string()];
            out.total_memory = 8_000_000_000.0;
            out.web_view_version = "120.0.6099.230".to_string();
        }),
        get_safe_area_insets: Arc::new(|out: &mut SafeAreaInsets| {
            out.bottom = 16.0;
            out.left = 0.0;
            out.right = 0.0;
            out.top = 24.0;
        }),
        refresh,
    };
}

mod create_device_capabilities {
    use super::*;

    #[test]
    fn allocates_a_zeroed_snapshot_with_all_false_capability_flags() {
        let caps = create_device_capabilities();
        assert!(!caps.has_keyboard && !caps.has_mouse && !caps.has_stylus);
    }
}

mod create_device_display_metrics {
    use super::*;

    #[test]
    fn allocates_a_zeroed_snapshot_with_minus_1_numeric_sentinels() {
        let m = create_device_display_metrics();
        assert_eq!(m.color_depth, -1);
        assert_eq!(m.density_dpi, -1.0);
        assert_eq!(m.logical_height, -1.0);
        assert_eq!(m.logical_width, -1.0);
        assert_eq!(m.physical_height, -1.0);
        assert_eq!(m.physical_width, -1.0);
        assert_eq!(m.pixel_ratio, -1.0);
    }
}

mod create_device_info {
    use super::*;

    #[test]
    fn allocates_zeroed_snapshot_with_string_boolean_and_minus_1_numeric_sentinels() {
        let info = create_device_info();
        assert_eq!(info.arch, "");
        assert_eq!(info.available_memory, -1.0);
        assert_eq!(info.board_name, "");
        assert_eq!(info.color_gamut, "");
        assert_eq!(info.cpu_cores, -1);
        assert_eq!(info.font_scale, -1.0);
        assert_eq!(info.form_factor, DEVICE_FORM_FACTOR_UNKNOWN);
        assert_eq!(info.gpu_renderer, "");
        assert_eq!(info.gpu_vendor, "");
        assert!(
            !info.is_hdr
                && !info.is_jailbroken
                && !info.is_low_end_device
                && !info.is_rooted
                && !info.is_virtual
        );
        assert_eq!(info.manufacturer, "");
        assert_eq!(info.marketing_name, "");
        assert_eq!(info.model, "");
        assert_eq!(info.os_build, "");
        assert_eq!(info.os_name, "");
        assert_eq!(info.os_version, "");
        assert_eq!(info.platform_string, "");
        assert_eq!(info.product_name, "");
        assert!(info.supported_abis.is_empty());
        assert_eq!(info.total_memory, -1.0);
        assert_eq!(info.web_view_version, "");
    }
}

mod create_safe_area_insets {
    use super::*;

    #[test]
    fn allocates_zeroed_edges() {
        assert_eq!(
            create_safe_area_insets(),
            SafeAreaInsets {
                top: 0.0,
                right: 0.0,
                bottom: 0.0,
                left: 0.0
            }
        );
    }
}

mod get_device_capabilities {
    use super::*;

    #[test]
    fn fills_out_via_the_host_backend() {
        let mut out = create_device_capabilities();
        get_device_capabilities(&mut out, &fake_backend(None));
        assert!(out.has_keyboard && out.has_mouse && !out.has_stylus);
    }
}

mod get_device_display_metrics {
    use super::*;

    #[test]
    fn fills_out_via_the_host_backend() {
        let mut out = create_device_display_metrics();
        get_device_display_metrics(&mut out, &fake_backend(None));
        assert_eq!(out.color_depth, 8);
        assert_eq!(out.density_dpi, 440.0);
        assert_eq!(out.logical_height, 800.0);
        assert_eq!(out.logical_width, 360.0);
        assert_eq!(out.physical_height, 1600.0);
        assert_eq!(out.physical_width, 720.0);
        assert_eq!(out.pixel_ratio, 2.0);
    }
}

mod get_device_id {
    use super::*;

    #[test]
    fn returns_the_value_from_the_host_backend() {
        assert_eq!(get_device_id(&fake_backend(None)), "test-device-id");
    }
}

mod get_device_info {
    use super::*;

    #[test]
    fn fills_out_via_the_host_backend() {
        let mut out = create_device_info();
        get_device_info(&mut out, &fake_backend(None));
        assert_eq!(out.arch, "arm64");
        assert_eq!(out.available_memory, 3_000_000_000.0);
        assert_eq!(out.board_name, "msm8998");
        assert_eq!(out.color_gamut, "display-p3");
        assert_eq!(out.cpu_cores, 8);
        assert_eq!(out.font_scale, 1.2);
        assert_eq!(out.form_factor, "Phone");
        assert_eq!(out.gpu_renderer, "Adreno 650");
        assert_eq!(out.gpu_vendor, "Qualcomm");
        assert!(
            out.is_hdr
                && !out.is_jailbroken
                && !out.is_low_end_device
                && !out.is_rooted
                && out.is_virtual
        );
        assert_eq!(out.manufacturer, "Google");
        assert_eq!(out.marketing_name, "Pixel 8 Pro");
        assert_eq!(out.model, "Pixel");
        assert_eq!(out.os_build, "TP1A.220624.014");
        assert_eq!(out.os_name, "Android");
        assert_eq!(out.os_version, "14");
        assert_eq!(out.platform_string, "Linux armv8l");
        assert_eq!(out.product_name, "husky");
        assert_eq!(
            out.supported_abis,
            vec!["arm64-v8a".to_string(), "armeabi-v7a".to_string()]
        );
        assert_eq!(out.total_memory, 8_000_000_000.0);
        assert_eq!(out.web_view_version, "120.0.6099.230");
    }

    #[test]
    fn keeps_byte_counts_exact_beyond_f32_range() {
        let mut backend = fake_backend(None);
        backend.get_info = Arc::new(|out: &mut DeviceInfo| out.total_memory = 17_179_869_185.0);
        let mut out = create_device_info();
        get_device_info(&mut out, &backend);
        assert_eq!(out.total_memory, 17_179_869_185.0);
    }
}

mod get_safe_area_insets {
    use super::*;

    #[test]
    fn fills_out_via_the_host_backend() {
        let mut out = create_safe_area_insets();
        get_safe_area_insets(&mut out, &fake_backend(None));
        assert_eq!(out.top, 24.0);
        assert_eq!(out.bottom, 16.0);
    }
}

mod r3_boundary {
    /// TS asserts the module exports no ambient-state API; Rust cannot enumerate exports at runtime,
    /// so the public lanes are checked by source text.
    #[test]
    fn exports_no_ambient_state_api() {
        let sources = [
            include_str!("../src/lib.rs"),
            include_str!("../src/contract.rs"),
            include_str!("../src/device.rs"),
            include_str!("../src/types.rs"),
        ];
        for symbol in [
            "create_web_device_backend",
            "enable_web_safe_area_insets",
            "explain_device_backend",
            "get_device_backend",
            "install_device_host_backend",
            "observe_device_host_result",
            "reset_device_backend_for_test",
            "set_device_backend",
        ] {
            for source in sources {
                assert!(!source.contains(symbol), "{symbol} must not be exported");
            }
        }
    }
}

mod refresh_device_info {
    use super::*;

    #[test]
    fn does_not_panic_on_a_backend_without_refresh() {
        refresh_device_info(&fake_backend(None));
    }

    #[test]
    fn calls_refresh_on_backends_that_expose_it() {
        let refreshed = Arc::new(Mutex::new(false));
        let flag = refreshed.clone();
        refresh_device_info(&fake_backend(Some(Arc::new(move || {
            *flag.lock().unwrap() = true
        }))));
        assert!(*refreshed.lock().unwrap());
    }
}
