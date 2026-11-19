use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

const TITLE: &str = "Flight winit API test";

fn acquire(host: &WinitHost) -> flight_surface::WgpuHostAcquisition {
    return futures::executor::block_on(flight_render_wgpu::create_wgpu_acquisition(
        get_winit_host_wgpu_capability(host),
        &create_winit_host_surface(host),
        None,
    ))
    .expect("host acquisition");
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn pump_for(host: &mut WinitHost, duration: Duration) {
    let deadline = Instant::now() + duration;
    while Instant::now() < deadline {
        assert_eq!(
            pump_winit_host(host).expect("pump"),
            WinitPumpStatus::Continue
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}

// Counts mapped X11 windows titled `TITLE`; None when the X11 tools are absent or on Wayland.
fn visible_x11_windows() -> Option<usize> {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() || std::env::var_os("DISPLAY").is_none() {
        return None;
    }
    let output = Command::new("xdotool")
        .args(["search", "--onlyvisible", "--name", TITLE])
        .output()
        .ok()?;
    return Some(String::from_utf8_lossy(&output.stdout).lines().count());
}

// winit requires the event loop on the process main thread and permits one per process, so every
// per-export scenario below runs from `main` against the one live host. The `#[test]` markers exist
// for flight-lint's per-export module rule; a `harness = false` target compiles them out.
fn main() {
    explain_winit_host_failure::verify();
    explain_winit_pump_status::verify();
    let options = create_winit_host_options::verify();
    if !display_available() {
        eprintln!("SKIP winit host API: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_winit_host::verify(&options);
    pump_for(&mut host, Duration::from_millis(200));
    assert_borrowed_lifetimes(&host);
    let provider = get_winit_host_wgpu_capability(&host).provider.clone();
    get_winit_host_wgpu_device::verify(&host, &provider);
    get_winit_host_native_window::verify(&host, &provider);
    get_winit_host_input_source::verify(&host, &provider);
    get_winit_host_screen_capabilities::verify(&host, &provider);
    get_winit_host_screen_query_capability::verify(&host);
    get_winit_host_surface_capabilities::verify(&host, &provider);
    get_winit_host_window_capabilities::verify(&host, &provider);
    create_winit_host_surface::verify(&host, &provider);
    get_winit_host_wgpu_capability::verify(&host);
    get_winit_host_app_loop_capability::verify(&mut host);
    get_winit_host_lifecycle_capability::verify(&host);
    get_winit_host_input_ingress_capability::verify(&host);
    get_winit_host_surface_display_capability::verify(&mut host);
    get_winit_host_surface_resize_capability::verify(&mut host);
    get_winit_host_window_appearance_capability::verify(&host);
    get_winit_host_window_focus_capability::verify(&host);
    get_winit_host_window_geometry_capability::verify(&mut host);
    get_winit_host_window_fullscreen_capability::verify(&mut host);
    get_winit_host_window_lifecycle_capability::verify(&host);
    get_winit_host_window_size_constraints_capability::verify(&host);
    get_winit_host_window_state_capability::verify(&mut host);
    get_winit_host_window_visibility_capability::verify(&mut host);
    get_winit_host_window_z_order_capability::verify(&host);
    pump_winit_host::verify(&mut host);
    run_winit_host::verify(&mut host);
    destroy_winit_host::verify(host);
}

mod create_winit_host {
    use super::*;

    pub fn verify(options: &WinitHostOptions) -> WinitHost {
        let host = create_winit_host(options).expect("create host");
        let second = create_winit_host(options)
            .err()
            .expect("one event loop per process");
        assert_eq!(second.kind, WinitHostFailureKind::EventLoop);
        assert!(explain_winit_host_failure(&second).contains("winit event-loop creation"));
        return host;
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod create_winit_host_options {
    use super::*;

    pub fn verify() -> WinitHostOptions {
        let options = create_winit_host_options(TITLE, 160.0, 120.0, true);
        assert_eq!(
            options,
            WinitHostOptions {
                title: TITLE.to_string(),
                width: 160.0,
                height: 120.0,
                visible: true,
            }
        );
        return options;
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod create_winit_host_surface {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let surface = create_winit_host_surface(host);
        let same_surface = create_winit_host_surface(host);
        assert!(Arc::ptr_eq(&surface, &same_surface));
        let handle = {
            let surface = surface.read().unwrap();
            flight_surface::get_surface_handle(&*surface).expect("canonical surface handle")
        };
        assert!(Arc::ptr_eq(provider, &handle.provider));
        assert!(Arc::ptr_eq(
            &handle.handle,
            &get_winit_host_native_window(host).handle
        ));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod destroy_winit_host {
    use super::*;

    // Held clones must fail closed after destroy: no window mutation, no frame scheduling, no
    // acquisition, and the native window is gone.
    pub fn verify(host: WinitHost) {
        let appearance = get_winit_host_window_appearance_capability(&host)
            .unwrap()
            .clone();
        let geometry = get_winit_host_window_geometry_capability(&host)
            .unwrap()
            .clone();
        let app_loop = get_winit_host_app_loop_capability(&host).clone();
        let wgpu = get_winit_host_wgpu_capability(&host).clone();
        let surface = create_winit_host_surface(&host);
        let device = get_winit_host_wgpu_device(&host).clone();
        destroy_winit_host(host).expect("destroy on the creator thread");

        let window = flight_app::create_app_window();
        (appearance.set_title)(&window, "after destroy");
        let mut bounds = flight_app::WindowBounds {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        bounds.width = -1.0;
        (geometry.get_bounds)(&mut bounds, &window);
        assert_eq!(bounds.width, -1.0, "no window is read after destroy");
        let fired = Arc::new(AtomicU32::new(0));
        let counter = fired.clone();
        let handle = (app_loop.request_frame)(Arc::new(move |_| {
            counter.fetch_add(1, Ordering::AcqRel);
        }));
        assert_eq!(handle.0, 0);
        assert!(!(wgpu.is_supported)());
        assert!((wgpu.create)(&window, 10.0, 10.0).is_none());
        let options = flight_surface::WgpuHostAcquisitionOptions {
            format: None,
            power_preference: None,
        };
        assert!(futures::executor::block_on((wgpu.acquire)(&surface, &options)).is_err());
        let attachment = flight_surface::WgpuSurfaceAttachment {
            alpha_mode: flight_surface::GpuCanvasAlphaMode::Opaque,
            device,
            format: "bgra8unorm".to_string(),
        };
        assert!((wgpu.attach_surface)(&surface, &attachment).is_none());
        assert_eq!(fired.load(Ordering::Acquire), 0);
        if let Some(visible) = visible_x11_windows() {
            assert_eq!(visible, 0, "the native window is destroyed");
        }
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod explain_winit_host_failure {
    use super::*;

    pub fn verify() {
        let failure = WinitHostFailure {
            kind: WinitHostFailureKind::Window,
            message: "fixture".to_string(),
        };
        assert_eq!(
            explain_winit_host_failure(&failure),
            "flight-host-winit native window creation failed: fixture"
        );
        let failure = WinitHostFailure {
            kind: WinitHostFailureKind::Adapter,
            message: "none".to_string(),
        };
        assert_eq!(
            explain_winit_host_failure(&failure),
            "flight-host-winit GPU adapter selection failed: none"
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod explain_winit_pump_status {
    use super::*;

    pub fn verify() {
        assert_eq!(
            explain_winit_pump_status(WinitPumpStatus::Unavailable),
            "pump mode is unavailable after the event loop has been consumed; use run_winit_host on platforms that require an OS-owned loop"
        );
        assert_eq!(
            explain_winit_pump_status(WinitPumpStatus::Continue),
            "the winit host is alive"
        );
        assert_eq!(
            explain_winit_pump_status(WinitPumpStatus::Exit(0)),
            "the winit host event loop exited"
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_app_loop_capability {
    use super::*;

    // A requested frame fires exactly once at the pump frame point; a cancelled one never does.
    pub fn verify(host: &mut WinitHost) {
        let app_loop = get_winit_host_app_loop_capability(host).clone();
        let kept = Arc::new(AtomicU32::new(0));
        let cancelled = Arc::new(AtomicU32::new(0));
        let (kept_counter, cancelled_counter) = (kept.clone(), cancelled.clone());
        let handle = (app_loop.request_frame)(Arc::new(move |_| {
            kept_counter.fetch_add(1, Ordering::AcqRel);
        }));
        assert!(handle.0 > 0);
        let dropped = (app_loop.request_frame)(Arc::new(move |_| {
            cancelled_counter.fetch_add(1, Ordering::AcqRel);
        }));
        (app_loop.cancel_frame)(dropped);
        pump_for(host, Duration::from_millis(60));
        assert_eq!(kept.load(Ordering::Acquire), 1);
        assert_eq!(cancelled.load(Ordering::Acquire), 0);
        let before = (app_loop.now)();
        std::thread::sleep(Duration::from_millis(10));
        assert!((app_loop.now)() - before >= 9.0);
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_input_ingress_capability {
    use super::*;

    // Text attachments toggle IME idempotently; a foreign source and the gamepad slot stay inert.
    pub fn verify(host: &WinitHost) {
        let ingress = get_winit_host_input_ingress_capability(host).clone();
        let source = get_winit_host_input_source(host).clone();
        let first = (ingress.attach_text)(&source, inert_sink(), None);
        let second = (ingress.attach_text)(&source, inert_sink(), None);
        first();
        first();
        second();
        let foreign = flight_host::InputIngressSource {
            provider: source.provider.clone(),
            handle: Arc::new(()),
        };
        (ingress.attach_keyboard)(&foreign, inert_sink(), None)();
        (ingress.attach_gamepad)(&source, inert_sink(), None)();
    }

    fn inert_sink() -> flight_input::InputIngressSink {
        return flight_input::InputIngressSink {
            gamepad_axis_move: Arc::new(|_| panic!("winit has no gamepads")),
            gamepad_button_down: Arc::new(|_| panic!("winit has no gamepads")),
            gamepad_button_up: Arc::new(|_| panic!("winit has no gamepads")),
            gamepad_connect: Arc::new(|_| panic!("winit has no gamepads")),
            gamepad_disconnect: Arc::new(|_| panic!("winit has no gamepads")),
            is_enabled: Arc::new(|| true),
            key_down: Arc::new(|_| {}),
            key_up: Arc::new(|_| {}),
            pointer_cancel: Arc::new(|_| {}),
            pointer_down: Arc::new(|_| {}),
            pointer_move: Arc::new(|_| {}),
            pointer_move_relative: Arc::new(|_| {}),
            pointer_up: Arc::new(|_| {}),
            text_edit: Arc::new(|_| {}),
            text_input: Arc::new(|_| {}),
            wheel: Arc::new(|_| {}),
        };
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_input_source {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let source = get_winit_host_input_source(host);
        assert!(Arc::ptr_eq(provider, &source.provider));
        assert!(Arc::ptr_eq(
            &source.handle,
            &get_winit_host_native_window(host).handle
        ));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_lifecycle_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let lifecycle = get_winit_host_lifecycle_capability(host);
        assert_ne!(
            (lifecycle.get_state)(),
            flight_lifecycle::AppLifecycleState::Background
        );
        let release = (lifecycle.subscribe)(Arc::new(|| {}));
        release();
        assert_eq!(
            (lifecycle.get_launch_kind.as_ref().unwrap())(),
            flight_lifecycle::AppLaunchKind::Cold
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_native_window {
    use super::*;

    // The native window handle is an identity token: retaining it cannot keep the window alive.
    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let native = get_winit_host_native_window(host);
        assert!(Arc::ptr_eq(provider, &native.provider));
        assert!(
            native
                .handle
                .downcast_ref::<winit::window::Window>()
                .is_none()
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_screen_capabilities {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let screen = get_winit_host_screen_capabilities(host);
        assert_leaf!(
            get_winit_host_screen_query_capability(host),
            screen.query,
            provider
        );
        assert!(screen.change.is_none() && screen.details.is_none());
        assert!(screen.permission_change.is_none());
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_screen_query_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let query = get_winit_host_screen_query_capability(host).unwrap();
        let mut screens = Vec::new();
        (query.get_screens)(&mut screens);
        assert!(!screens.is_empty());
        assert!(
            screens
                .iter()
                .all(|screen| screen.width > 0.0 && screen.scale_factor > 0.0)
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_surface_capabilities {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let surface = get_winit_host_surface_capabilities(host);
        assert_leaf!(
            get_winit_host_surface_display_capability(host),
            surface.display,
            provider
        );
        assert_leaf!(
            get_winit_host_surface_resize_capability(host),
            surface.resize,
            provider
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_surface_display_capability {
    use super::*;

    // A display-size request resizes the window and reconfigures the live extent on X11 (Resized)
    // and Wayland (immediate size), and notifies resize subscribers.
    pub fn verify(host: &mut WinitHost) {
        let acquisition = acquire(host);
        let resized = Arc::new(Mutex::new(Vec::new()));
        let log = resized.clone();
        let geometry = get_winit_host_window_geometry_capability(host)
            .unwrap()
            .clone();
        // flight-app has no constructor for the resize target; its derived Default is the only one.
        let create_target: fn() -> flight_app::WindowResizeTargetHandle = Default::default;
        let target = Arc::new(std::sync::RwLock::new(create_target()));
        let release = (geometry.subscribe_resize.as_ref().unwrap())(
            &target,
            Arc::new(move |width, height, _scale| log.lock().unwrap().push((width, height))),
        );
        let display = get_winit_host_surface_display_capability(host)
            .unwrap()
            .clone();
        (display.set_display_size)(&create_winit_host_surface(host), 200.0, 150.0);
        pump_for(host, Duration::from_millis(400));
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (200.0, 150.0)
        );
        assert_eq!(resized.lock().unwrap().last(), Some(&(200.0, 150.0)));
        release();
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_surface_resize_capability {
    use super::*;

    // A zero backing size reports a zero live extent; a nonzero one restores it.
    pub fn verify(host: &mut WinitHost) {
        let acquisition = acquire(host);
        let resize = get_winit_host_surface_resize_capability(host)
            .unwrap()
            .clone();
        let surface = create_winit_host_surface(host);
        (resize.resize)(&surface, 0.0, 0.0);
        assert_eq!((acquisition.surface.width)(), 0.0);
        (resize.resize)(&surface, 200.0, 150.0);
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (200.0, 150.0)
        );
        pump_for(host, Duration::from_millis(20));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_wgpu_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let wgpu = get_winit_host_wgpu_capability(host);
        assert!((wgpu.is_supported)());
        let acquisition = acquire(host);
        assert!(Arc::ptr_eq(
            &acquisition.device.handle,
            &get_winit_host_wgpu_device(host).handle
        ));
        assert!(
            !acquisition.format.contains("srgb"),
            "{}",
            acquisition.format
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_wgpu_device {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        assert!(Arc::ptr_eq(
            provider,
            &get_winit_host_wgpu_device(host).provider
        ));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_appearance_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let appearance = get_winit_host_window_appearance_capability(host).unwrap();
        assert!(appearance.set_icon.is_none() && appearance.set_opacity.is_none());
        (appearance.set_title)(&flight_app::create_app_window(), TITLE);
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_capabilities {
    use super::*;

    pub fn verify(host: &WinitHost, provider: &flight_host::ProviderRef) {
        let window = get_winit_host_window_capabilities(host);
        assert_leaf!(
            get_winit_host_window_appearance_capability(host),
            window.appearance,
            provider
        );
        assert_leaf!(
            get_winit_host_window_focus_capability(host),
            window.focus,
            provider
        );
        assert_leaf!(
            get_winit_host_window_fullscreen_capability(host),
            window.fullscreen,
            provider
        );
        assert_leaf!(
            get_winit_host_window_geometry_capability(host),
            window.geometry,
            provider
        );
        assert_leaf!(
            get_winit_host_window_lifecycle_capability(host),
            window.lifecycle,
            provider
        );
        assert_leaf!(
            get_winit_host_window_size_constraints_capability(host),
            window.size_constraints,
            provider
        );
        assert_leaf!(
            get_winit_host_window_state_capability(host),
            window.state,
            provider
        );
        assert_leaf!(
            get_winit_host_window_visibility_capability(host),
            window.visibility,
            provider
        );
        assert_leaf!(
            get_winit_host_window_z_order_capability(host),
            window.z_order,
            provider
        );
        assert!(window.attach.is_none() && window.attention.is_none());
        assert!(window.content_protection.is_none() && window.hierarchy.is_none());
        assert!(window.progress.is_none() && window.shadow.is_none() && window.shell.is_none());
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_focus_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        (get_winit_host_window_focus_capability(host).unwrap().focus)(
            &flight_app::create_app_window(),
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_fullscreen_capability {
    use super::*;

    pub fn verify(host: &mut WinitHost) {
        let fullscreen = get_winit_host_window_fullscreen_capability(host)
            .unwrap()
            .clone();
        let window = flight_app::create_app_window();
        (fullscreen.set_fullscreen)(&window, true);
        pump_for(host, Duration::from_millis(50));
        (fullscreen.set_fullscreen)(&window, false);
        pump_for(host, Duration::from_millis(50));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_geometry_capability {
    use super::*;

    // `set_size` reaches the window and the live extent on both display servers.
    pub fn verify(host: &mut WinitHost) {
        let acquisition = acquire(host);
        let geometry = get_winit_host_window_geometry_capability(host)
            .unwrap()
            .clone();
        let window = flight_app::create_app_window();
        (geometry.set_size)(&window, 180.0, 140.0);
        pump_for(host, Duration::from_millis(400));
        let mut bounds = flight_app::WindowBounds {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        (geometry.get_bounds)(&mut bounds, &window);
        assert_eq!((bounds.width, bounds.height), (180.0, 140.0));
        assert_eq!(
            (
                (acquisition.surface.width)(),
                (acquisition.surface.height)()
            ),
            (180.0, 140.0)
        );
        let release = (geometry.subscribe_move.as_ref().unwrap())(Arc::new(|_, _| {}));
        release();
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_lifecycle_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let lifecycle = get_winit_host_window_lifecycle_capability(host).unwrap();
        let release =
            (lifecycle.subscribe_close.as_ref().unwrap())(Arc::new(|| false), Arc::new(|| {}));
        release();
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_size_constraints_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let constraints = get_winit_host_window_size_constraints_capability(host).unwrap();
        let window = flight_app::create_app_window();
        (constraints.set_minimum_size)(&window, 50.0, 40.0);
        (constraints.set_maximum_size)(&window, 4000.0, 3000.0);
        (constraints.set_resizable.as_ref().unwrap())(&window, true);
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_state_capability {
    use super::*;

    pub fn verify(host: &mut WinitHost) {
        let state = get_winit_host_window_state_capability(host)
            .unwrap()
            .clone();
        let window = flight_app::create_app_window();
        (state.maximize)(&window);
        (state.restore)(&window);
        pump_for(host, Duration::from_millis(30));
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_visibility_capability {
    use super::*;

    pub fn verify(host: &mut WinitHost) {
        let visibility = get_winit_host_window_visibility_capability(host)
            .unwrap()
            .clone();
        let window = flight_app::create_app_window();
        (visibility.hide)(&window);
        pump_for(host, Duration::from_millis(100));
        if let Some(visible) = visible_x11_windows() {
            assert_eq!(visible, 0);
        }
        (visibility.show)(&window);
        pump_for(host, Duration::from_millis(100));
        if let Some(visible) = visible_x11_windows() {
            assert_eq!(visible, 1);
        }
        assert!(visibility.subscribe_visibility.is_none());
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod get_winit_host_window_z_order_capability {
    use super::*;

    pub fn verify(host: &WinitHost) {
        let z_order = get_winit_host_window_z_order_capability(host).unwrap();
        let window = flight_app::create_app_window();
        (z_order.set_always_on_top)(&window, true);
        (z_order.set_always_on_top)(&window, false);
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod pump_winit_host {
    use super::*;

    pub fn verify(host: &mut WinitHost) {
        assert_eq!(
            pump_winit_host(host).expect("pump host"),
            WinitPumpStatus::Continue
        );
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}

mod run_winit_host {
    use super::*;

    // The blocking loop calls the frame function until it returns false and fires scheduled frames;
    // afterwards the loop is consumed, so pump is Unavailable and a second run fails typed.
    pub fn verify(host: &mut WinitHost) {
        let app_loop = get_winit_host_app_loop_capability(host).clone();
        let fired = Arc::new(AtomicU32::new(0));
        let counter = fired.clone();
        let _ = (app_loop.request_frame)(Arc::new(move |_| {
            counter.fetch_add(1, Ordering::AcqRel);
        }));
        let frames = Arc::new(AtomicU32::new(0));
        let frame_counter = frames.clone();
        run_winit_host(host, move |_time| {
            frame_counter.fetch_add(1, Ordering::AcqRel) + 1 < 5
        })
        .expect("run host");
        assert_eq!(frames.load(Ordering::Acquire), 5);
        assert_eq!(fired.load(Ordering::Acquire), 1);
        assert_eq!(
            pump_winit_host(host).expect("pump after run"),
            WinitPumpStatus::Unavailable
        );
        let again = run_winit_host(host, |_| false).expect_err("loop consumed");
        assert_eq!(again.kind, WinitHostFailureKind::RunLoop);
        if let Some(visible) = visible_x11_windows() {
            assert_eq!(visible, 0, "the run loop released the window as it exited");
        }
    }

    #[test]
    fn is_verified_by_main_on_the_creator_thread() {}
}
