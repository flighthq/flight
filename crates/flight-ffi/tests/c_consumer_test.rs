//! Builds the flight-ffi static library, compiles `tests/c_consumer/consumer.c` against it and the
//! `flight_ffi.h` header the build script writes to `OUT_DIR`, warning-free, links the executable,
//! and runs it. The C program owns the ABI assertions; this
//! harness owns building, linking, and reporting its output.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[test]
fn c_consumer_links_static_library_and_runs() {
    let library = build_static_library();
    let work_dir = library.parent().unwrap().join("flight-ffi-c-consumer");
    fs::create_dir_all(&work_dir).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("c_consumer")
        .join("consumer.c");
    let executable = work_dir.join(format!("consumer{}", env::consts::EXE_SUFFIX));
    let _ = fs::remove_file(&executable);

    let compiler = cc::Build::new()
        .cargo_metadata(false)
        .target(env!("FLIGHT_FFI_TARGET"))
        .host(env!("FLIGHT_FFI_HOST"))
        .opt_level(0)
        .debug(false)
        .out_dir(&work_dir)
        .get_compiler();
    let mut command = compiler.to_command();
    if compiler.is_like_msvc() {
        command
            .args(["/nologo", "/W4", "/WX", "/std:c11"])
            .arg(format!("/I{}", env!("OUT_DIR")))
            .arg(&source)
            .arg(format!("/Fo{}\\", work_dir.display()))
            .arg(format!("/Fe{}", executable.display()))
            .arg("/link")
            .arg(&library);
    } else {
        command
            .args(["-std=c11", "-Wall", "-Wextra", "-Wpedantic", "-Werror"])
            .arg(format!("-I{}", env!("OUT_DIR")))
            .arg(&source)
            .arg("-o")
            .arg(&executable)
            .arg(&library);
    }
    command.args(native_link_arguments());

    let compiled = command.output().unwrap();
    assert!(
        compiled.status.success(),
        "C consumer failed to compile or link ({:?}):\n{}{}",
        command,
        String::from_utf8_lossy(&compiled.stdout),
        String::from_utf8_lossy(&compiled.stderr)
    );
    let diagnostics = String::from_utf8_lossy(&compiled.stderr);
    assert!(
        !diagnostics.contains("warning"),
        "C consumer compiled with warnings:\n{diagnostics}"
    );

    let ran = Command::new(&executable).output().unwrap();
    let stdout = String::from_utf8_lossy(&ran.stdout);
    let stderr = String::from_utf8_lossy(&ran.stderr);
    assert!(
        ran.status.success(),
        "C consumer exited with {}:\n{stdout}{stderr}",
        ran.status
    );
    assert_eq!(stdout.trim(), "flight-ffi C consumer: ok");
}

// `cargo test` compiles the library only as a test harness, never as its declared `staticlib`, so
// the archive is built here with the outer Cargo and located through its artifact messages.
fn build_static_library() -> PathBuf {
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let mut command = Command::new(cargo);
    command
        .args(["build", "--package", "flight-ffi", "--lib"])
        .arg("--message-format=json-render-diagnostics")
        .current_dir(env!("CARGO_MANIFEST_DIR"));
    if !cfg!(debug_assertions) {
        command.arg("--release");
    }
    let built = command.output().unwrap();
    assert!(
        built.status.success(),
        "building the flight-ffi static library failed:\n{}",
        String::from_utf8_lossy(&built.stderr)
    );
    let messages = String::from_utf8_lossy(&built.stdout);
    let suffix = static_library_name();
    let library = messages
        .lines()
        .filter(|line| line.contains("\"reason\":\"compiler-artifact\""))
        .flat_map(|line| line.split('"'))
        .map(|token| token.replace("\\\\", "\\"))
        .find(|token| {
            return token.ends_with(&format!("/{suffix}"))
                || token.ends_with(&format!("\\{suffix}"));
        })
        .map(PathBuf::from)
        .expect("Cargo reported no flight-ffi static library artifact");
    assert!(library.is_file(), "missing {}", library.display());
    return library;
}

fn static_library_name() -> &'static str {
    if cfg!(target_env = "msvc") {
        return "flight_ffi.lib";
    }
    return "libflight_ffi.a";
}

// The system libraries Rust's standard library needs when linked from a static archive, as
// `rustc --print native-static-libs` reports them per target family.
fn native_link_arguments() -> &'static [&'static str] {
    if cfg!(target_env = "msvc") {
        return &[
            "kernel32.lib",
            "advapi32.lib",
            "ntdll.lib",
            "userenv.lib",
            "ws2_32.lib",
            "dbghelp.lib",
            "bcrypt.lib",
            "/defaultlib:msvcrt",
        ];
    }
    if cfg!(target_vendor = "apple") {
        return &["-lSystem", "-lc", "-lm"];
    }
    if cfg!(windows) {
        return &[
            "-lkernel32",
            "-ladvapi32",
            "-lntdll",
            "-luserenv",
            "-lws2_32",
            "-ldbghelp",
            "-lbcrypt",
        ];
    }
    return &[
        "-lgcc_s",
        "-lutil",
        "-lrt",
        "-lpthread",
        "-lm",
        "-ldl",
        "-lc",
    ];
}
