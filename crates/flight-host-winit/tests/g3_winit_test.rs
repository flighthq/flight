#[path = "../examples/pump/scene.rs"]
mod scene;

use std::process::Command;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use flight_host_winit::{
    WinitHost, WinitPumpStatus, create_winit_host, create_winit_host_options,
    create_winit_host_surface, destroy_winit_host, get_winit_host_input_ingress_capability,
    get_winit_host_input_source, get_winit_host_surface_display_capability,
    get_winit_host_surface_resize_capability, get_winit_host_wgpu_capability,
    get_winit_host_wgpu_device, pump_winit_host,
};
use flight_input::{attach_pointer_input, create_input_manager, detach_pointer_input};
use flight_render::RenderProxies2D;
use flight_render_wgpu::{
    WgpuRenderState, WgpuRenderTarget, create_bitmap_from_wgpu_screen_render_target,
    create_wgpu_acquisition, create_wgpu_render_state, create_wgpu_screen_render_target,
    enable_wgpu_screen_render_target_capture, register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d_wgpu::register_wgpu_scene2d_render_preset;
use flight_signals::connect_signal;
use scene::{PumpScene, create_pump_scene, move_pump_scene_shape, render_pump_scene_frame};

const BACKGROUND: [u8; 3] = [8, 10, 18];
const MOVABLE: [u8; 3] = [255, 90, 90];
const SECOND: [u8; 3] = [66, 200, 245];
const SPRITE: [u8; 3] = [247, 201, 72];
const TITLE: &str = "Flight G3 smoke";

struct Frame<'a> {
    host: &'a mut WinitHost,
    state: &'a mut WgpuRenderState,
    proxies: &'a mut RenderProxies2D<WgpuRenderState>,
    target: &'a WgpuRenderTarget,
    scene: &'a PumpScene,
}

fn assert_capture(
    screen: &Arc<RwLock<flight_render_wgpu::WgpuScreenRenderTarget>>,
    cases: &[(usize, usize, [u8; 3])],
) {
    let bitmap = futures::executor::block_on(create_bitmap_from_wgpu_screen_render_target(
        screen,
        Some(5_000),
    ))
    .expect("bounded capture");
    for &(x, y, expected) in cases {
        let offset = (y * bitmap.width as usize + x) * 4;
        assert_eq!(
            &bitmap.data[offset..offset + 3],
            &expected,
            "captured pixel ({x},{y})"
        );
    }
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn draw(frame: &mut Frame, count: usize) {
    for _ in 0..count {
        assert_eq!(
            pump_winit_host(frame.host).expect("pump"),
            WinitPumpStatus::Continue
        );
        render_pump_scene_frame(frame.state, frame.proxies, frame.target, frame.scene);
        std::thread::sleep(Duration::from_millis(10));
    }
}

// Reads presented pixels of the X11 window with xwd and ImageMagick; None when those tools, xdotool
// or an X11 display are unavailable, in which case the presented-pixel gates report a skip.
fn presented_pixel(x: usize, y: usize) -> Option<[u8; 3]> {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() || std::env::var_os("DISPLAY").is_none() {
        return None;
    }
    let window = x11_window()?;
    let script =
        format!("xwd -silent -id {window} | convert xwd:- -crop 1x1+{x}+{y} -depth 8 rgb:-");
    let output = Command::new("sh").args(["-c", &script]).output().ok()?;
    if !output.status.success() || output.stdout.len() != 3 {
        return None;
    }
    return Some([output.stdout[0], output.stdout[1], output.stdout[2]]);
}

fn x11_window() -> Option<String> {
    let output = Command::new("xdotool")
        .args(["search", "--name", TITLE])
        .output()
        .ok()?;
    return String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::to_string);
}

// winit requires event-loop creation on the process main thread on several platforms, so this
// target deliberately uses Cargo's custom-test-harness mode instead of the standard test harness.
fn main() {
    if !display_available() {
        eprintln!("SKIP G3: no DISPLAY or WAYLAND_DISPLAY; run under xvfb-run -a");
        return;
    }

    let mut host = create_winit_host(&create_winit_host_options(TITLE, 800.0, 600.0, true))
        .unwrap_or_else(|failure| panic!("{failure}"));
    let host_wgpu = get_winit_host_wgpu_capability(&host).clone();
    let surface = create_winit_host_surface(&host);
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&host_wgpu, &surface, None))
            .expect("host acquisition");
    assert!(Arc::ptr_eq(
        &acquisition.device.handle,
        &get_winit_host_wgpu_device(&host).handle
    ));
    let mut state = create_wgpu_render_state(get_winit_host_wgpu_device(&host), None);
    register_wgpu_scene2d_render_preset(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &host_wgpu,
        get_winit_host_wgpu_device(&host),
        &surface,
        None,
    )));
    let target = WgpuRenderTarget::Screen(screen.clone());
    let scene = Arc::new(create_pump_scene());
    let mut proxies = RenderProxies2D::default();
    let resize = get_winit_host_surface_resize_capability(&host)
        .unwrap()
        .clone();

    let input = create_input_manager();
    let moved = scene.clone();
    connect_signal(
        &input.read().unwrap().on_pointer_move.clone(),
        Arc::new(move |event| move_pump_scene_shape(&moved, event.x, event.y)),
        None,
    );
    let source = get_winit_host_input_source(&host).clone();
    let ingress = get_winit_host_input_ingress_capability(&host).clone();

    {
        let mut frame = Frame {
            host: &mut host,
            state: &mut state,
            proxies: &mut proxies,
            target: &target,
            scene: &scene,
        };
        draw(&mut frame, 8);

        // Presented frames: the scene reaches the window, a zero-extent frame is skipped, and a real
        // pointer motion moves the shape on screen.
        if presented_pixel(150, 145).is_some() {
            assert_eq!(presented_pixel(150, 145), Some(MOVABLE));
            assert_eq!(presented_pixel(450, 280), Some(SECOND));
            assert_eq!(presented_pixel(10, 10), Some(BACKGROUND));

            (resize.resize)(&surface, 0.0, 0.0);
            move_pump_scene_shape(frame.scene, 600.0, 300.0);
            draw(&mut frame, 4);
            assert_eq!(
                presented_pixel(150, 145),
                Some(MOVABLE),
                "a zero-extent frame is not presented"
            );
            (resize.resize)(&surface, 800.0, 600.0);
            draw(&mut frame, 4);
            assert_eq!(presented_pixel(600, 300), Some(MOVABLE));
            assert_eq!(presented_pixel(150, 145), Some(BACKGROUND));

            // A display resize reconfigures the presentation surface: content drawn beyond the
            // original 800x600 extent reaches the screen.
            let display = get_winit_host_surface_display_capability(frame.host)
                .unwrap()
                .clone();
            (display.set_display_size)(&surface, 900.0, 700.0);
            move_pump_scene_shape(frame.scene, 850.0, 650.0);
            draw(&mut frame, 20);
            assert_eq!(presented_pixel(850, 650), Some(MOVABLE));
            (display.set_display_size)(&surface, 800.0, 600.0);
            draw(&mut frame, 20);

            // Pointer input attaches only now: the display's initial pointer position would otherwise
            // drag the shape before the static presented-pixel checks above.
            attach_pointer_input(&ingress, &input, &source, None);
            let window = x11_window().expect("X11 window");
            let moved_pointer = Command::new("xdotool")
                .args(["mousemove", "--window", &window, "300", "400"])
                .status()
                .is_ok_and(|status| status.success());
            assert!(moved_pointer, "xdotool mousemove");
            let deadline = Instant::now() + Duration::from_secs(2);
            while presented_pixel(300, 400) != Some(MOVABLE) && Instant::now() < deadline {
                draw(&mut frame, 2);
            }
            assert_eq!(presented_pixel(300, 400), Some(MOVABLE));
            assert_eq!(presented_pixel(600, 300), Some(BACKGROUND));
        } else {
            eprintln!("SKIP G3 presented-pixel gates: needs X11 with xdotool, xwd and convert");
        }

        // Captured frames: exact scene content, and a moved shape moves.
        enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
        move_pump_scene_shape(frame.scene, 150.0, 145.0);
        draw(&mut frame, 1);
        assert_capture(
            &screen,
            &[
                (150, 145, MOVABLE),
                (450, 280, SECOND),
                (668, 468, SPRITE),
                (10, 10, BACKGROUND),
                (600, 300, BACKGROUND),
            ],
        );
        move_pump_scene_shape(frame.scene, 600.0, 300.0);
        draw(&mut frame, 1);
        assert_capture(&screen, &[(600, 300, MOVABLE), (150, 145, BACKGROUND)]);
    }

    detach_pointer_input(&input, &source);
    drop(target);
    destroy_winit_host(host).expect("destroy on creator thread");
    if let Some(remaining) = x11_window() {
        panic!("destroy left X11 window {remaining} on the display");
    }
}
