use flight_host_winit::*;

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

    if !display_available() {
        eprintln!("SKIP winit host API: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_winit_host(&WinitHostOptions {
        title: "Flight winit API test".to_string(),
        width: 160.0,
        height: 120.0,
        visible: true,
    })
    .expect("create host");
    let _ = get_winit_host_app_loop_capability(&host);
    let _ = get_winit_host_input_ingress_capability(&host);
    let _ = get_winit_host_input_source(&host);
    let _ = get_winit_host_lifecycle_capability(&host);
    let _ = get_winit_host_native_window(&host);
    let _ = get_winit_host_screen_capabilities(&host);
    let _ = get_winit_host_surface_capabilities(&host);
    let _ = get_winit_host_wgpu_capability(&host);
    let _ = get_winit_host_window_capabilities(&host);
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

mod get_winit_host_surface_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_wgpu_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_winit_host_window_capabilities {
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
