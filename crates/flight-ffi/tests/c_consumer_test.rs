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
// The stand-in build adds the `stand-in-wgpu-host` producers and keeps its own target directory,
// so it never replaces the default archive another consumer links.
fn build_static_library(library: Library) -> PathBuf {
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let mut command = Command::new(cargo);
    command
        .args(["build", "--package", "flight-ffi", "--lib"])
        .arg("--message-format=json-render-diagnostics")
        .current_dir(env!("CARGO_MANIFEST_DIR"));
    if library == Library::StandInWgpuHost {
        let profile_dir = Path::new(env!("OUT_DIR"))
            .ancestors()
            .find(|dir| dir.file_name().is_some_and(|name| name == "build"))
            .and_then(Path::parent)
            .expect("OUT_DIR sits inside the profile's build directory");
        let target_dir = profile_dir.join("flight-ffi-stand-in-wgpu-host");
        command
            .args(["--features", "stand-in-wgpu-host", "--target-dir"])
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
    if env!("FLIGHT_FFI_TARGET") != env!("FLIGHT_FFI_HOST") {
        eprintln!(
            "skipping the flight-ffi C consumer: it is built for {} and cannot run on host {}",
            env!("FLIGHT_FFI_TARGET"),
            env!("FLIGHT_FFI_HOST")
        );
        return None;
    }

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
    if let Some(sanitizer_runtimes) = sanitizer_runtimes {
        executable_command.env("LD_PRELOAD", sanitizer_runtimes.join(":"));
        executable_command.env("ASAN_OPTIONS", "detect_leaks=1:halt_on_error=1");
        executable_command.env("UBSAN_OPTIONS", "halt_on_error=1:print_stacktrace=1");
    }
    if deliberate_leak {
        return Some(executable_command.output().unwrap());
    }
    return Some(run(&mut executable_command, "run the C consumer"));
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Library {
    Default,
    StandInWgpuHost,
}
