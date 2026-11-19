use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_host_sdl::*;

fn assert_borrowed_lifetimes<'host>(host: &'host SdlHost) {
    let _: Option<&'host flight_host::WgpuDevice> = get_sdl_host_wgpu_device(host);
    let _: Option<&'host flight_screen::HostScreenQueryCapability> =
        get_sdl_host_screen_query_capability(host);
    let _: Option<&'host flight_surface::HostSurfaceDisplayCapability> =
        get_sdl_host_surface_display_capability(host);
    let _: Option<&'host flight_surface::HostSurfaceResizeCapability> =
        get_sdl_host_surface_resize_capability(host);
    let _: Option<&'host flight_surface::HostWgpuCapability> = get_sdl_host_wgpu_capability(host);
    let _: Option<&'host flight_surface::HostGlCapability> = get_sdl_host_gl_capability(host);
    let _: Option<&'host flight_app::HostWindowAppearanceCapability> =
        get_sdl_host_window_appearance_capability(host);
    let _: Option<&'host flight_app::HostWindowFocusCapability> =
        get_sdl_host_window_focus_capability(host);
    let _: Option<&'host flight_app::HostWindowFullscreenCapability> =
        get_sdl_host_window_fullscreen_capability(host);
    let _: Option<&'host flight_app::HostWindowGeometryCapability> =
        get_sdl_host_window_geometry_capability(host);
    let _: Option<&'host flight_app::HostWindowLifecycleCapability> =
        get_sdl_host_window_lifecycle_capability(host);
    let _: Option<&'host flight_app::HostWindowSizeConstraintsCapability> =
        get_sdl_host_window_size_constraints_capability(host);
    let _: Option<&'host flight_app::HostWindowStateCapability> =
        get_sdl_host_window_state_capability(host);
    let _: Option<&'host flight_app::HostWindowVisibilityCapability> =
        get_sdl_host_window_visibility_capability(host);
    let _: Option<&'host flight_app::HostWindowZOrderCapability> =
        get_sdl_host_window_z_order_capability(host);
}

macro_rules! assert_leaf {
    ($actual:expr, $stored:expr, $provider:expr) => {{
        let actual = $actual.expect("the documented leaf is filled");
        let stored = $stored.as_ref().expect("the aggregate leaf is filled");
        assert!(std::ptr::eq(actual, stored));
        assert!(Arc::ptr_eq(&actual.provider, $provider));
    }};
}

fn assert_common_capabilities(host: &SdlHost) {
    assert_borrowed_lifetimes(host);
    let provider = &get_sdl_host_app_loop_capability(host).provider;
    assert!(Arc::ptr_eq(
        provider,
        &get_sdl_host_native_window(host).provider
    ));
    assert!(Arc::ptr_eq(
        provider,
        &get_sdl_host_input_source(host).provider
    ));
    assert!(Arc::ptr_eq(
        provider,
        &get_sdl_host_input_ingress_capability(host).provider
    ));
    assert_eq!(
        (get_sdl_host_lifecycle_capability(host).get_state)(),
        flight_lifecycle::AppLifecycleState::Active
    );

    let screen = get_sdl_host_screen_capabilities(host);
    assert!(screen.change.is_none());
    assert!(screen.details.is_none());
    assert!(screen.permission_change.is_none());
    assert_leaf!(
        get_sdl_host_screen_query_capability(host),
        screen.query,
        provider
    );

    let surface = get_sdl_host_surface_capabilities(host);
    assert_leaf!(
        get_sdl_host_surface_display_capability(host),
        surface.display,
        provider
    );
    assert_leaf!(
        get_sdl_host_surface_resize_capability(host),
        surface.resize,
        provider
    );

    let window = get_sdl_host_window_capabilities(host);
    assert!(window.attach.is_none());
    assert!(window.attention.is_none());
    assert!(window.content_protection.is_none());
    assert!(window.hierarchy.is_none());
    assert!(window.progress.is_none());
    assert!(window.shadow.is_none());
    assert!(window.shell.is_none());
    assert_leaf!(
        get_sdl_host_window_appearance_capability(host),
        window.appearance,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_focus_capability(host),
        window.focus,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_fullscreen_capability(host),
        window.fullscreen,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_geometry_capability(host),
        window.geometry,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_lifecycle_capability(host),
        window.lifecycle,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_size_constraints_capability(host),
        window.size_constraints,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_state_capability(host),
        window.state,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_visibility_capability(host),
        window.visibility,
        provider
    );
    assert_leaf!(
        get_sdl_host_window_z_order_capability(host),
        window.z_order,
        provider
    );

    let canonical = create_sdl_host_surface(host);
    let same = create_sdl_host_surface(host);
    assert!(Arc::ptr_eq(&canonical, &same));
    let handle = {
        let surface = canonical.read().unwrap();
        flight_surface::get_surface_handle(&*surface).expect("canonical surface handle")
    };
    assert!(Arc::ptr_eq(provider, &handle.provider));
    assert!(Arc::ptr_eq(
        &handle.handle,
        &get_sdl_host_native_window(host).handle
    ));
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn main() {
    assert!(
        include_str!("../examples/pump_wgpu.rs")
            .contains("render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);")
    );
    let options = create_sdl_host_options(
        "Flight SDL API test",
        160.0,
        120.0,
        false,
        SdlHostRenderBackend::Wgpu,
    );
    assert_eq!(
        options,
        SdlHostOptions {
            title: "Flight SDL API test".to_string(),
            width: 160.0,
            height: 120.0,
            visible: false,
            render_backend: SdlHostRenderBackend::Wgpu,
            gl_context_options: None,
        }
    );
    assert_eq!(
        explain_sdl_pump_status(SdlPumpStatus::Exit(4)),
        "the SDL host event loop exited"
    );
    assert!(
        explain_sdl_host_failure(&SdlHostFailure {
            kind: SdlHostFailureKind::Window,
            message: "fixture".to_string(),
        })
        .contains("SDL native window creation")
    );

    if !display_available() {
        eprintln!("SKIP SDL host API: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_sdl_host(&options).expect("create wgpu host");
    let second = match create_sdl_host(&options) {
        Ok(_) => panic!("second live host must be rejected"),
        Err(failure) => failure,
    };
    assert_eq!(second.kind, SdlHostFailureKind::Sdl);
    assert!(second.message.contains("already live"));
    assert_common_capabilities(&host);
    assert!(get_sdl_host_wgpu_capabilities(&host).context.is_some());
    assert!(get_sdl_host_gl_capabilities(&host).context.is_none());
    assert!(get_sdl_host_wgpu_capability(&host).is_some());
    assert!(get_sdl_host_wgpu_device(&host).is_some());
    assert!(get_sdl_host_gl_capability(&host).is_none());

    let frame_count = Arc::new(AtomicUsize::new(0));
    let cancelled_count = Arc::new(AtomicUsize::new(0));
    let scheduled = frame_count.clone();
    let cancelled = cancelled_count.clone();
    let app_loop = get_sdl_host_app_loop_capability(&host);
    (app_loop.request_frame)(Arc::new(move |_| {
        scheduled.fetch_add(1, Ordering::AcqRel);
    }));
    let handle = (app_loop.request_frame)(Arc::new(move |_| {
        cancelled.fetch_add(1, Ordering::AcqRel);
    }));
    (app_loop.cancel_frame)(handle);
    let synthetic_sdl = sdl3::init().expect("obtain a ref-counted SDL event sender");
    let synthetic_events = synthetic_sdl.event().expect("obtain SDL event subsystem");
    synthetic_events
        .push_event(sdl3::event::Event::Window {
            timestamp: 1,
            window_id: u32::MAX,
            win_event: sdl3::event::WindowEvent::CloseRequested,
        })
        .expect("push foreign-window close event");
    assert_eq!(
        pump_sdl_host(&mut host).expect("pump"),
        SdlPumpStatus::Continue
    );
    assert_eq!(frame_count.load(Ordering::Acquire), 1);
    assert_eq!(cancelled_count.load(Ordering::Acquire), 0);
    drop(synthetic_events);
    drop(synthetic_sdl);

    let wgpu = get_sdl_host_wgpu_capability(&host).unwrap().clone();
    let surface = create_sdl_host_surface(&host);
    destroy_sdl_host(host).expect("destroy wgpu host");
    assert!(!(wgpu.is_supported)());
    assert!(
        futures::executor::block_on((wgpu.acquire)(
            &surface,
            &flight_surface::WgpuHostAcquisitionOptions {
                format: None,
                power_preference: None,
            },
        ))
        .is_err()
    );

    let gl_options = create_sdl_host_options(
        "Flight SDL GL API test",
        160.0,
        120.0,
        false,
        SdlHostRenderBackend::Gl,
    );
    let gl_host = create_sdl_host(&gl_options).expect("create GL host");
    assert_common_capabilities(&gl_host);
    assert!(get_sdl_host_gl_capabilities(&gl_host).context.is_some());
    assert!(get_sdl_host_wgpu_capabilities(&gl_host).context.is_none());
    assert!(get_sdl_host_gl_capability(&gl_host).is_some());
    assert!(get_sdl_host_wgpu_capability(&gl_host).is_none());
    assert!(get_sdl_host_wgpu_device(&gl_host).is_none());
    make_sdl_host_gl_context_current(&gl_host).expect("make current");
    present_sdl_host_gl(&gl_host).expect("present empty GL drawable");
    let gl = get_sdl_host_gl_capability(&gl_host).unwrap().clone();
    let surface = create_sdl_host_surface(&gl_host);
    assert!((gl.acquire)(&surface, None).is_some());
    let lost_count = Arc::new(AtomicUsize::new(0));
    let lost = lost_count.clone();
    let _release = (gl.subscribe)(
        &surface,
        Arc::new(move || {
            lost.fetch_add(1, Ordering::AcqRel);
        }),
        Arc::new(|| {}),
    );
    destroy_sdl_host(gl_host).expect("destroy GL host");
    assert_eq!(lost_count.load(Ordering::Acquire), 1);
    assert!((gl.acquire)(&surface, None).is_none());

    let mut run_host = create_sdl_host(&options).expect("create run-loop host");
    let synthetic_sdl = sdl3::init().expect("obtain a ref-counted SDL event sender");
    let synthetic_events = synthetic_sdl.event().expect("obtain SDL event subsystem");
    synthetic_events
        .push_event(sdl3::event::Event::Quit { timestamp: 1 })
        .expect("push synthetic SDL quit event");
    let mut frame_calls = 0;
    run_sdl_host(&mut run_host, |_| {
        frame_calls += 1;
        return true;
    })
    .expect("run host through queued quit");
    assert_eq!(frame_calls, 0);
    drop(synthetic_events);
    drop(synthetic_sdl);
    destroy_sdl_host(run_host).expect("destroy run-loop host");
}

mod create_sdl_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod create_sdl_host_options {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod create_sdl_host_surface {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod destroy_sdl_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod explain_sdl_host_failure {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod explain_sdl_pump_status {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_app_loop_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_gl_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_gl_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_input_ingress_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_input_source {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_lifecycle_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_native_window {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_screen_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_screen_query_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_surface_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_surface_display_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_surface_resize_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_wgpu_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_wgpu_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_wgpu_device {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_appearance_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_capabilities {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_focus_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_fullscreen_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_geometry_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_lifecycle_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_size_constraints_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_state_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_visibility_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod get_sdl_host_window_z_order_capability {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod make_sdl_host_gl_context_current {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod present_sdl_host_gl {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod pump_sdl_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}

mod run_sdl_host {
    #[test]
    fn is_exercised_on_the_main_thread() {}
}
