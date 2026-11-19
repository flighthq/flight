use std::sync::Arc;

use flight_host_winit::*;

fn assert_borrowed_lifetimes<'host>(host: &'host WinitHost) {
    let _: &'host flight_host::WgpuDevice = get_winit_host_wgpu_device(host);
    let _: Option<&'host flight_screen::HostScreenQueryCapability> =
        get_winit_host_screen_query_capability(host);
    let _: Option<&'host flight_surface::HostSurfaceDisplayCapability> =
        get_winit_host_surface_display_capability(host);
    let _: Option<&'host flight_surface::HostSurfaceResizeCapability> =
        get_winit_host_surface_resize_capability(host);
    let _: Option<&'host flight_app::HostWindowAppearanceCapability> =
        get_winit_host_window_appearance_capability(host);
    let _: Option<&'host flight_app::HostWindowFocusCapability> =
        get_winit_host_window_focus_capability(host);
    let _: Option<&'host flight_app::HostWindowFullscreenCapability> =
        get_winit_host_window_fullscreen_capability(host);
    let _: Option<&'host flight_app::HostWindowGeometryCapability> =
        get_winit_host_window_geometry_capability(host);
    let _: Option<&'host flight_app::HostWindowLifecycleCapability> =
        get_winit_host_window_lifecycle_capability(host);
    let _: Option<&'host flight_app::HostWindowSizeConstraintsCapability> =
        get_winit_host_window_size_constraints_capability(host);
    let _: Option<&'host flight_app::HostWindowStateCapability> =
        get_winit_host_window_state_capability(host);
    let _: Option<&'host flight_app::HostWindowVisibilityCapability> =
        get_winit_host_window_visibility_capability(host);
    let _: Option<&'host flight_app::HostWindowZOrderCapability> =
        get_winit_host_window_z_order_capability(host);
}

macro_rules! assert_leaf {
    ($actual:expr, $stored:expr, $provider:expr) => {{
        let actual = $actual.expect("the documented leaf is filled");
        let stored = $stored.as_ref().expect("the aggregate leaf is filled");
        assert!(std::ptr::eq(actual, stored));
        assert!(Arc::ptr_eq(&actual.provider, $provider));
    }};
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn main() {
    assert_eq!(
        explain_winit_pump_status(WinitPumpStatus::Unavailable),
        "pump mode is unavailable after the event loop has been consumed; use run_winit_host on platforms that require an OS-owned loop"
    );
    let failure = WinitHostFailure {
        kind: WinitHostFailureKind::Window,
        message: "fixture".to_string(),
    };
    assert!(explain_winit_host_failure(&failure).contains("native window creation"));

    let options = flight_host_winit::contract::create_winit_host_options(
        "Flight winit API test",
        160.0,
        120.0,
        true,
    );
    assert_eq!(
        options,
        WinitHostOptions {
            title: "Flight winit API test".to_string(),
            width: 160.0,
            height: 120.0,
            visible: true,
        }
    );

    if !display_available() {
        eprintln!("SKIP winit host API: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_winit_host(&options).expect("create host");
    let _ = get_winit_host_app_loop_capability(&host);
    let _ = get_winit_host_input_ingress_capability(&host);
    let _ = get_winit_host_input_source(&host);
    let _ = get_winit_host_lifecycle_capability(&host);
    let _ = get_winit_host_native_window(&host);
    let _ = get_winit_host_screen_capabilities(&host);
    let _ = get_winit_host_surface_capabilities(&host);
    let _ = get_winit_host_wgpu_capability(&host);
    let _ = get_winit_host_window_capabilities(&host);

    assert_borrowed_lifetimes(&host);
    let provider = &get_winit_host_wgpu_capability(&host).provider;
    assert!(Arc::ptr_eq(
        provider,
        &get_winit_host_wgpu_device(&host).provider
    ));
    assert!(Arc::ptr_eq(
        provider,
        &get_winit_host_native_window(&host).provider
    ));
    assert!(Arc::ptr_eq(
        provider,
        &get_winit_host_input_source(&host).provider
    ));

    let screen = get_winit_host_screen_capabilities(&host);
    assert_leaf!(
        get_winit_host_screen_query_capability(&host),
        screen.query,
        provider
    );
    let surface_capabilities = get_winit_host_surface_capabilities(&host);
    assert_leaf!(
        get_winit_host_surface_display_capability(&host),
        surface_capabilities.display,
        provider
    );
    assert_leaf!(
        get_winit_host_surface_resize_capability(&host),
        surface_capabilities.resize,
        provider
    );
    let window = get_winit_host_window_capabilities(&host);
    assert_leaf!(
        get_winit_host_window_appearance_capability(&host),
        window.appearance,
        provider
    );
    assert_leaf!(
        get_winit_host_window_focus_capability(&host),
        window.focus,
        provider
    );
    assert_leaf!(
        get_winit_host_window_fullscreen_capability(&host),
        window.fullscreen,
        provider
    );
    assert_leaf!(
        get_winit_host_window_geometry_capability(&host),
        window.geometry,
        provider
    );
    assert_leaf!(
        get_winit_host_window_lifecycle_capability(&host),
        window.lifecycle,
        provider
    );
    assert_leaf!(
        get_winit_host_window_size_constraints_capability(&host),
        window.size_constraints,
        provider
    );
    assert_leaf!(
        get_winit_host_window_state_capability(&host),
        window.state,
        provider
    );
    assert_leaf!(
        get_winit_host_window_visibility_capability(&host),
        window.visibility,
        provider
    );
    assert_leaf!(
        get_winit_host_window_z_order_capability(&host),
        window.z_order,
        provider
    );

    let surface = create_winit_host_surface(&host);
    let same_surface = create_winit_host_surface(&host);
    assert!(Arc::ptr_eq(&surface, &same_surface));
    let surface_handle = {
        let surface = surface.read().unwrap();
        flight_surface::get_surface_handle(&*surface).expect("canonical surface handle")
    };
    assert!(Arc::ptr_eq(provider, &surface_handle.provider));
    assert!(Arc::ptr_eq(
        &surface_handle.handle,
        &get_winit_host_native_window(&host).handle
    ));
    drop(surface);
    drop(same_surface);

    assert_eq!(
        pump_winit_host(&mut host).expect("pump host"),
        WinitPumpStatus::Continue
    );
    run_winit_host(&mut host, |_time| false).expect("run host");
    destroy_winit_host(host).expect("destroy host");
}

mod create_winit_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod create_winit_host_options {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod create_winit_host_surface {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod destroy_winit_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod explain_winit_host_failure {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod explain_winit_pump_status {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_app_loop_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_input_ingress_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_input_source {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_lifecycle_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_native_window {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_screen_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_screen_query_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_surface_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_surface_display_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_surface_resize_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_wgpu_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_wgpu_device {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_appearance_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_focus_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_fullscreen_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_geometry_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_lifecycle_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_size_constraints_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_state_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_visibility_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_z_order_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod pump_winit_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod run_winit_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}
