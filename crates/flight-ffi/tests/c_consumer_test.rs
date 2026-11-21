//! Builds the flight-ffi static library, compiles each C program under `tests/c_consumer/` against it and the
//! `flight_ffi.h` header the build script writes to `OUT_DIR`, warning-free, links the executable,
//! and runs it. The C program owns the ABI assertions; this harness owns building, linking, and
//! reporting its output.
//!
//! The consumer is compiled strictly as C by the `cc` crate's compiler (honoring `CC`). The final
//! link is driven by rustc through a `#![no_main]` stub, so the target's native runtime libraries
//! come from rustc rather than a hand-maintained list. The test is compiled only for Linux (see
//! `tests/main.rs`), the one platform it has been run on.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[test]
fn thin_node_pointer_is_rejected_by_typed_flight_node_parameters() {
    if env!("FLIGHT_FFI_TARGET") != env!("FLIGHT_FFI_HOST") {
        eprintln!(
            "skipping the flight-ffi strict-C negative: it is built for {} and cannot run on host {}",
            env!("FLIGHT_FFI_TARGET"),
            env!("FLIGHT_FFI_HOST")
        );
        return;
    }

    let work_dir = Path::new(env!("OUT_DIR")).join("flight-ffi-thin-node-negative");
    fs::create_dir_all(&work_dir).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("c_consumer")
        .join("thin_node_must_not_compile.c");
    let object = work_dir.join("thin_node_must_not_compile.o");
    let _ = fs::remove_file(&object);

    let compiler = cc::Build::new()
        .cargo_metadata(false)
        .target(env!("FLIGHT_FFI_TARGET"))
        .host(env!("FLIGHT_FFI_HOST"))
        .opt_level(0)
        .debug(false)
        .out_dir(&work_dir)
        .get_compiler();
    let mut compile = compiler.to_command();
    compile
        .args([
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-Wpedantic",
            "-Werror",
            "-Werror=incompatible-pointer-types",
        ])
        .arg(format!("-I{}", env!("OUT_DIR")))
        .arg("-c")
        .arg(&source)
        .arg("-o")
        .arg(&object);
    let rejected = compile.output().unwrap();
    let diagnostics = String::from_utf8_lossy(&rejected.stderr);
    assert!(
        !rejected.status.success(),
        "strict C incorrectly accepted a fake thin node pointer"
    );
    assert!(
        diagnostics.contains("incompatible pointer type")
            || diagnostics.contains("incompatible-pointer-types"),
        "strict C failed for an unexpected reason:\n{diagnostics}"
    );
    assert!(
        diagnostics.contains("FlightNode"),
        "diagnostic did not identify the typed FlightNode boundary:\n{diagnostics}"
    );
}

#[test]
fn c_consumer_links_static_library_and_runs() {
    if let Some(output) = z_compile_link_and_run("consumer.c", "consumer", true, false) {
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "flight-ffi C consumer: ok"
        );
    }
}

#[test]
fn sanitizer_probe_proves_a_live_flight_node_leak_is_detected() {
    if let Some(output) = z_compile_link_and_run("consumer.c", "consumer-leak-probe", true, true) {
        let diagnostics = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success(),
            "LeakSanitizer accepted a deliberately leaked FlightNode"
        );
        assert!(
            diagnostics.contains("LeakSanitizer") && diagnostics.contains("detected memory leaks"),
            "deliberate FlightNode leak did not produce a live LeakSanitizer report:\n{diagnostics}"
        );
    }
}

#[test]
fn interaction_signal_rejection_links_static_library_and_runs() {
    if let Some(stdout) = z_compile_link_and_run(
        "interaction_signal_rejection.c",
        "interaction_signal_rejection",
        false,
        false,
    ) {
        assert_eq!(
            String::from_utf8_lossy(&stdout.stdout).trim(),
            "flight-ffi interaction rejection: ok"
        );
    }
}

#[cfg(feature = "host-headless")]
#[test]
fn headless_host_section_links_and_runs_under_sanitizers() {
    if let Some(output) = z_compile_link_and_run_against(
        Library::HostHeadless,
        "headless_host.c",
        "headless_host",
        true,
        false,
    ) {
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert_eq!(stdout.trim(), "flight-ffi headless host: ok");
    }
}

// Render objects outliving their host, under the sanitizers: a pass open on a non-empty scene
// across the destroy, and states drawing on other threads while it happens.
#[cfg(feature = "host-headless")]
#[test]
fn headless_teardown_outlives_its_host_under_sanitizers() {
    if let Some(output) = z_compile_link_and_run_against(
        Library::HostHeadless,
        "headless_teardown.c",
        "headless_teardown",
        true,
        false,
    ) {
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert_eq!(stdout.trim(), "flight-ffi headless teardown: ok");
    }
}

#[cfg(feature = "host-headless")]
#[test]
fn headless_host_sanitizer_probe_detects_a_leaked_adapter_name() {
    if let Some(output) = z_compile_link_and_run_against(
        Library::HostHeadless,
        "headless_host.c",
        "headless_host-leak-probe",
        true,
        true,
    ) {
        let diagnostics = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success(),
            "LeakSanitizer accepted a deliberately leaked adapter name"
        );
        assert!(
            diagnostics.contains("LeakSanitizer") && diagnostics.contains("detected memory leaks"),
            "deliberate adapter name leak did not produce a live LeakSanitizer report:\n{diagnostics}"
        );
    }
}

// The host section's declarations exist only for a consumer that defines the guard macro: the
// same header compiled without it must leave every host name free.
#[cfg(feature = "host-headless")]
#[test]
fn headless_host_section_stays_hidden_without_its_guard_macro() {
    let header = fs::read_to_string(Path::new(env!("OUT_DIR")).join("flight_ffi.h")).unwrap();
    assert!(header.contains(
        "#ifdef FLIGHT_HOST_HEADLESS\ntypedef struct FlightHeadlessHost FlightHeadlessHost;\n"
    ));
    let work_dir = Path::new(env!("OUT_DIR")).join("flight-ffi-c-host-section-guard");
    fs::create_dir_all(&work_dir).unwrap();
    let compiler = cc::Build::new()
        .cargo_metadata(false)
        .target(env!("FLIGHT_FFI_TARGET"))
        .host(env!("FLIGHT_FFI_HOST"))
        .opt_level(0)
        .debug(false)
        .out_dir(&work_dir)
        .get_compiler();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("c_consumer")
        .join("host_section_guard.c");
    let mut compile = compiler.to_command();
    compile
        .args([
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-Wpedantic",
            "-Werror",
            "-fsyntax-only",
        ])
        .arg(format!("-I{}", env!("OUT_DIR")))
        .arg(&source);
    run(
        &mut compile,
        "compile the guard probe without FLIGHT_HOST_HEADLESS",
    );
    let mut guarded = compiler.to_command();
    guarded
        .args(["-std=c11", "-fsyntax-only", "-DFLIGHT_HOST_HEADLESS"])
        .arg(format!("-I{}", env!("OUT_DIR")))
        .arg(&source);
    assert!(
        !guarded.output().unwrap().status.success(),
        "the guard probe compiled with FLIGHT_HOST_HEADLESS defined"
    );
}

// The same scene, rendered once by the strict C program through the generated externs on the
// device and target the headless host lends and once through the Rust API on a Rust-created
// headless host, reads back identically within HEADLESS_RENDER_TOLERANCE per channel. The scene's
// known fills are checked on the Rust frame first, and a perturbed copy must be rejected, so the
// comparison cannot pass on two blank or two wrong frames.
#[cfg(feature = "host-headless")]
#[test]
fn headless_render_from_c_matches_the_same_scene_rendered_through_rust() {
    let work_dir = Path::new(env!("OUT_DIR")).join("flight-ffi-c-headless-render-scene");
    fs::create_dir_all(&work_dir).unwrap();
    let scene = work_dir.join("scene.svg");
    let pixels = work_dir.join("c-frame.rgba");
    fs::write(&scene, HEADLESS_RENDER_SVG).unwrap();
    let _ = fs::remove_file(&pixels);
    let Some(output) = z_compile_link_and_run_with_args(
        Library::HostHeadless,
        "headless_render.c",
        "headless_render",
        true,
        false,
        &[&scene, &pixels],
    ) else {
        return;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_eq!(stdout.trim(), "flight-ffi headless render: ok");
    let from_c = fs::read(&pixels).unwrap();
    let from_rust = headless_render::render_reference_scene(HEADLESS_RENDER_SVG)
        .expect("the C program found an adapter, so the Rust reference must too");
    let size = (headless_render::WIDTH * headless_render::HEIGHT * 4) as usize;
    assert_eq!((from_c.len(), from_rust.len()), (size, size));

    for (x, y, rgba) in headless_render::KNOWN_PIXELS {
        assert_eq!(
            headless_render::pixel(&from_rust, x, y),
            rgba,
            "the Rust reference misses the scene's known fill at ({x}, {y})"
        );
    }
    let mut perturbed = from_rust.clone();
    perturbed[size / 2] ^= 0x40;
    assert_eq!(
        headless_render::count_mismatches(&from_rust, &perturbed, HEADLESS_RENDER_TOLERANCE),
        1,
        "the comparison does not see a one-pixel difference"
    );
    let mismatches =
        headless_render::count_mismatches(&from_rust, &from_c, HEADLESS_RENDER_TOLERANCE);
    assert_eq!(
        mismatches, 0,
        "{mismatches} pixels differ beyond {HEADLESS_RENDER_TOLERANCE} per channel between the C and Rust frames"
    );
}

#[cfg(feature = "host-headless")]
#[test]
fn headless_render_sanitizer_probe_detects_a_leaked_node() {
    let work_dir = Path::new(env!("OUT_DIR")).join("flight-ffi-c-headless-render-leak");
    fs::create_dir_all(&work_dir).unwrap();
    let scene = work_dir.join("scene.svg");
    let pixels = work_dir.join("c-frame.rgba");
    fs::write(&scene, HEADLESS_RENDER_SVG).unwrap();
    let Some(output) = z_compile_link_and_run_with_args(
        Library::HostHeadless,
        "headless_render.c",
        "headless_render-leak-probe",
        true,
        true,
        &[&scene, &pixels],
    ) else {
        return;
    };
    let diagnostics = String::from_utf8_lossy(&output.stderr);
    assert!(
        !output.status.success(),
        "LeakSanitizer accepted a deliberately leaked node"
    );
    assert!(
        diagnostics.contains("LeakSanitizer") && diagnostics.contains("detected memory leaks"),
        "deliberate node leak did not produce a live LeakSanitizer report:\n{diagnostics}"
    );
}

#[test]
fn render_pass_bracket_links_static_library_and_runs() {
    if let Some(output) =
        z_compile_link_and_run("render_pass_bracket.c", "render_pass_bracket", true, false)
    {
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "flight-ffi render pass bracket: ok"
        );
    }
}

#[test]
fn render_pass_live_sequence_matches_the_native_reference_under_sanitizers() {
    if let Some(output) = z_compile_link_and_run_against(
        Library::StandInWgpuHost,
        "render_pass_live.c",
        "render_pass_live",
        true,
        false,
    ) {
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "flight-ffi render pass live: ok"
        );
    }
}

#[test]
fn render_pass_live_sanitizer_probe_detects_a_leaked_scene_root() {
    if let Some(output) = z_compile_link_and_run_against(
        Library::StandInWgpuHost,
        "render_pass_live.c",
        "render_pass_live-leak-probe",
        true,
        true,
    ) {
        let diagnostics = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success(),
            "LeakSanitizer accepted a deliberately leaked scene root"
        );
        assert!(
            diagnostics.contains("LeakSanitizer") && diagnostics.contains("detected memory leaks"),
            "deliberate scene root leak did not produce a live LeakSanitizer report:\n{diagnostics}"
        );
    }
}

#[test]
fn render_pass_bracket_sanitizer_probe_detects_a_leaked_scene_source() {
    if let Some(output) = z_compile_link_and_run(
        "render_pass_bracket.c",
        "render_pass_bracket-leak-probe",
        true,
        true,
    ) {
        let diagnostics = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success(),
            "LeakSanitizer accepted a deliberately leaked scene source"
        );
        assert!(
            diagnostics.contains("LeakSanitizer") && diagnostics.contains("detected memory leaks"),
            "deliberate scene source leak did not produce a live LeakSanitizer report:\n{diagnostics}"
        );
    }
}

// `cargo test` compiles the library only as a test harness, never as its declared `staticlib`, so
// the archive is built here with the outer Cargo and located through its artifact messages. The
// test only runs when the target is the host, so a host build matches the consumer's target.
// The stand-in and host builds add their feature's producers and keep their own target
// directories, so they never replace the default archive another consumer links.
fn build_static_library(library: Library) -> PathBuf {
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let mut command = Command::new(cargo);
    command
        .args(["build", "--package", "flight-ffi", "--lib"])
        .arg("--message-format=json-render-diagnostics")
        .current_dir(env!("CARGO_MANIFEST_DIR"));
    if library != Library::Default {
        let (feature, directory) = match library {
            Library::HostHeadless => ("host-headless", "flight-ffi-host-headless"),
            _ => ("stand-in-wgpu-host", "flight-ffi-stand-in-wgpu-host"),
        };
        let profile_dir = Path::new(env!("OUT_DIR"))
            .ancestors()
            .find(|dir| dir.file_name().is_some_and(|name| name == "build"))
            .and_then(Path::parent)
            .expect("OUT_DIR sits inside the profile's build directory");
        let target_dir = profile_dir.join(directory);
        command
            .args(["--features", feature, "--target-dir"])
            .arg(target_dir);
    }
    if !cfg!(debug_assertions) {
        command.arg("--release");
    }
    let built = run(&mut command, "build the flight-ffi static library");
    let messages = String::from_utf8_lossy(&built.stdout);
    let library = messages
        .lines()
        .filter(|line| line.contains("\"reason\":\"compiler-artifact\""))
        .flat_map(|line| line.split('"'))
        .find(|token| token.ends_with("/libflight_ffi.a"))
        .map(PathBuf::from)
        .expect("Cargo reported no flight-ffi static library artifact");
    assert!(library.is_file(), "missing {}", library.display());
    return library;
}

// Failures report the program and arguments only: `Command`'s `Debug` output also lists the
// environment the `cc` crate copies onto its compiler command.
fn run(command: &mut Command, purpose: &str) -> std::process::Output {
    let output = command.output().unwrap();
    let invocation: Vec<_> = std::iter::once(command.get_program())
        .chain(command.get_args())
        .map(|part| part.to_string_lossy())
        .collect();
    assert!(
        output.status.success(),
        "failed to {purpose} (`{}`, {}):\n{}{}",
        invocation.join(" "),
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    return output;
}

// Compiles `tests/c_consumer/<source_name>` strictly as C against the generated header, links it
// with the static library, runs it, and returns its stdout; `None` when the target is not the host.
fn z_compile_link_and_run(
    source_name: &str,
    stem: &str,
    sanitizers: bool,
    deliberate_leak: bool,
) -> Option<std::process::Output> {
    return z_compile_link_and_run_against(
        Library::Default,
        source_name,
        stem,
        sanitizers,
        deliberate_leak,
    );
}

fn z_compile_link_and_run_against(
    library: Library,
    source_name: &str,
    stem: &str,
    sanitizers: bool,
    deliberate_leak: bool,
) -> Option<std::process::Output> {
    return z_compile_link_and_run_with_args(
        library,
        source_name,
        stem,
        sanitizers,
        deliberate_leak,
        &[],
    );
}

fn z_compile_link_and_run_with_args(
    library: Library,
    source_name: &str,
    stem: &str,
    sanitizers: bool,
    deliberate_leak: bool,
    args: &[&Path],
) -> Option<std::process::Output> {
    if env!("FLIGHT_FFI_TARGET") != env!("FLIGHT_FFI_HOST") {
        eprintln!(
            "skipping the flight-ffi C consumer: it is built for {} and cannot run on host {}",
            env!("FLIGHT_FFI_TARGET"),
            env!("FLIGHT_FFI_HOST")
        );
        return None;
    }

    let host_section = library == Library::HostHeadless;
    let library = build_static_library(library);
    let work_dir = library
        .parent()
        .unwrap()
        .join(format!("flight-ffi-c-{stem}"));
    fs::create_dir_all(&work_dir).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("c_consumer")
        .join(source_name);
    let object = work_dir.join(format!("{stem}.o"));
    let link_stub = work_dir.join("link.rs");
    let executable = work_dir.join(format!("{stem}{}", env::consts::EXE_SUFFIX));
    let _ = fs::remove_file(&object);
    let _ = fs::remove_file(&executable);

    let compiler = cc::Build::new()
        .cargo_metadata(false)
        .target(env!("FLIGHT_FFI_TARGET"))
        .host(env!("FLIGHT_FFI_HOST"))
        .opt_level(0)
        .debug(false)
        .out_dir(&work_dir)
        .get_compiler();
    let sanitizer_runtimes = sanitizers.then(|| {
        ["libasan.so", "libubsan.so"]
            .into_iter()
            .map(|runtime| {
                let mut locate = compiler.to_command();
                locate.arg(format!("-print-file-name={runtime}"));
                let located = run(&mut locate, "locate a sanitizer runtime");
                let path = String::from_utf8(located.stdout).unwrap();
                let path = path.trim();
                assert_ne!(path, runtime, "compiler did not locate {runtime}");
                assert!(Path::new(path).is_file(), "missing {path}");
                path.to_owned()
            })
            .collect::<Vec<_>>()
    });
    let mut compile = compiler.to_command();
    compile
        .args(["-std=c11", "-Wall", "-Wextra", "-Wpedantic", "-Werror"])
        .arg(format!("-I{}", env!("OUT_DIR")));
    if sanitizers {
        compile.args(["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]);
    }
    if deliberate_leak {
        compile.arg("-DFLIGHT_FFI_DELIBERATE_LEAK=1");
    }
    if host_section {
        compile.arg("-DFLIGHT_HOST_HEADLESS");
    }
    compile.arg("-c").arg(&source).arg("-o").arg(&object);
    let compiled = run(&mut compile, "compile the C consumer");
    let diagnostics = String::from_utf8_lossy(&compiled.stderr);
    assert!(
        !diagnostics.contains("warning"),
        "C consumer compiled with warnings:\n{diagnostics}"
    );

    fs::write(&link_stub, "#![no_main]\n").unwrap();
    let mut link = Command::new(env!("FLIGHT_FFI_RUSTC"));
    link.args(["--edition=2024", "--crate-type=bin", "--target"])
        .arg(env!("FLIGHT_FFI_TARGET"))
        .arg(&link_stub)
        .arg("-C")
        .arg(format!("link-arg={}", object.display()))
        .arg("-C")
        .arg(format!("link-arg={}", library.display()))
        .arg("-o")
        .arg(&executable);
    if sanitizers {
        link.arg("-C")
            .arg("link-arg=-lasan")
            .arg("-C")
            .arg("link-arg=-lubsan");
    }
    run(&mut link, "link the C consumer");

    let mut executable_command = Command::new(&executable);
    executable_command.args(args);
    // A machine may have several Vulkan drivers installed; the headless programs load exactly one,
    // Mesa's software driver, so their adapter and the sanitizers' view are the same everywhere.
    if host_section {
        let Some(icd) = find_software_vulkan_icd() else {
            eprintln!(
                "SKIPPED {stem}: no Mesa lavapipe ICD (libvulkan_lvp) is installed; install mesa-vulkan-drivers to run it"
            );
            return None;
        };
        executable_command.env("VK_DRIVER_FILES", &icd);
        executable_command.env("VK_ICD_FILENAMES", &icd);
    }
    if let Some(sanitizer_runtimes) = sanitizer_runtimes {
        executable_command.env("LD_PRELOAD", sanitizer_runtimes.join(":"));
        executable_command.env("ASAN_OPTIONS", "detect_leaks=1:halt_on_error=1");
        executable_command.env("UBSAN_OPTIONS", "halt_on_error=1:print_stacktrace=1");
    }
    let output = if deliberate_leak {
        executable_command.output().unwrap()
    } else {
        run(&mut executable_command, "run the C consumer")
    };
    // With the software driver pinned there is always an adapter, so a host program that found
    // none is a failure of the pin, never a skip.
    assert!(
        !host_section || !String::from_utf8_lossy(&output.stdout).contains("skipped"),
        "{stem} found no adapter through the pinned software Vulkan driver: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    return Some(output);
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Library {
    Default,
    HostHeadless,
    StandInWgpuHost,
}

// The Rust half of the headless render comparison: the scene the C program builds, rendered
// through the Rust API on a Rust-created headless host, and the frame comparison.
#[cfg(feature = "host-headless")]
mod headless_render {
    use flight_sdk::Transform2DNode;

    pub const WIDTH: u32 = 48;
    pub const HEIGHT: u32 = 32;
    // The node offset the C program applies to the imported subtree.
    const OFFSET: (f64, f64) = (4.0, 2.0);

    // Interior pixels of each fill after the offset, and a corner the scene leaves untouched
    // (the target's zero-initialized contents, loaded by a pass with no clear).
    pub const KNOWN_PIXELS: [(u32, u32, [u8; 4]); 3] = [
        (12, 9, [255, 0, 0, 255]),
        (32, 18, [0, 255, 0, 255]),
        (0, 0, [0, 0, 0, 0]),
    ];

    pub fn count_mismatches(expected: &[u8], actual: &[u8], tolerance: u8) -> usize {
        return expected
            .chunks(4)
            .zip(actual.chunks(4))
            .filter(|(want, got)| {
                return want
                    .iter()
                    .zip(got.iter())
                    .any(|(want, got)| want.abs_diff(*got) > tolerance);
            })
            .count();
    }

    pub fn pixel(frame: &[u8], x: u32, y: u32) -> [u8; 4] {
        let offset = ((y * WIDTH + x) * 4) as usize;
        return frame[offset..offset + 4].try_into().unwrap();
    }

    // The C program's sequence through the Rust API: host, lent target, render state over the
    // host device, the same registrations, the SVG subtree under a display-object root at the same
    // offset, prepare, begin with no clear, draw, end, submit, and the host read-back.
    // flight-lint: allow(f64) the SDK's 2D node transform fields are f64
    pub fn render_reference_scene(svg: &str) -> Option<Vec<u8>> {
        let mut host = flight_host_headless::create_headless_host(None)?;
        let target =
            flight_host_headless::create_headless_host_render_target(&host, WIDTH, HEIGHT)?;
        let mut state = flight_sdk::render_wgpu::contract::create_wgpu_render_state(
            flight_host_headless::get_headless_host_wgpu_device(&host)?,
            None,
        );
        flight_sdk::scene2d_wgpu::contract::register_wgpu_standard_material(&mut state);
        flight_sdk::render_wgpu::contract::register_standard_wgpu_texture_resolvers(&mut state);
        flight_sdk::scene2d_wgpu::contract::register_wgpu_scene2d_render_preset(&mut state);
        let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
        let shapes = flight_sdk::create_scene2d_from_svg_document(svg, None, None);
        {
            let mut guard = shapes.write().unwrap();
            *guard.transform2d_mut().x = OFFSET.0;
            *guard.transform2d_mut().y = OFFSET.1;
        }
        let shapes: flight_sdk::NodeRef = shapes;
        flight_sdk::add_node_child(&root, &shapes);
        let mut proxies = flight_sdk::RenderProxies2D::<flight_sdk::WgpuRenderState>::default();
        flight_sdk::prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut pass =
            flight_sdk::render_wgpu::contract::begin_wgpu_render_pass(&mut state, &target, None);
        flight_sdk::scene2d_wgpu::contract::render_wgpu_scene2d(
            &mut pass,
            &mut proxies,
            &root,
            None,
        );
        flight_sdk::render_wgpu::contract::end_wgpu_render_pass(pass);
        flight_sdk::render_wgpu::contract::submit_wgpu_frame(&mut state);
        let flight_sdk::WgpuRenderTarget::Screen(screen) = &target else {
            panic!("a headless render target is a screen target");
        };
        let bitmap = flight_host_headless::create_bitmap_from_headless_screen_render_target(
            screen,
            Some(10_000),
        )
        .expect("the reference frame reads back");
        drop(state);
        drop(target);
        flight_host_headless::destroy_headless_host(&mut host);
        return Some(bitmap.data.into_vec());
    }
}

// Per-channel difference allowed between the C and Rust frames. Both run the same SDK pipeline on
// the same adapter, so they are expected to agree exactly; 1 absorbs a rounding-mode difference.
#[cfg(feature = "host-headless")]
const HEADLESS_RENDER_TOLERANCE: u8 = 1;

// Two solid opaque rectangles on whole pixels: their interiors are known exactly on any adapter.
#[cfg(feature = "host-headless")]
const HEADLESS_RENDER_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><rect x="2" y="2" width="12" height="10" fill="#ff0000"/><rect x="20" y="8" width="16" height="14" fill="#00ff00"/></svg>"##;

// The installed Vulkan driver manifest of Mesa's software rasterizer, lavapipe: the one ICD whose
// library is libvulkan_lvp.
fn find_software_vulkan_icd() -> Option<PathBuf> {
    for dir in [
        "/usr/share/vulkan/icd.d",
        "/usr/local/share/vulkan/icd.d",
        "/etc/vulkan/icd.d",
    ] {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        let mut manifests: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .collect();
        manifests.sort();
        for manifest in manifests {
            let Ok(text) = fs::read_to_string(&manifest) else {
                continue;
            };
            if text.contains("\"library_path\"") && text.contains("libvulkan_lvp") {
                return Some(manifest);
            }
        }
    }
    return None;
}
