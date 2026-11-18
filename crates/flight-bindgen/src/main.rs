mod dispatch;
mod ffi_surface;
mod haxe_common;
mod haxe_cpp;
mod haxe_hl;
mod haxe_js;
mod offsets;
mod parse;

use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let target = args
        .iter()
        .position(|a| a == "--target")
        .and_then(|i| args.get(i + 1))
        .map(|s| s.as_str())
        .unwrap_or("haxe-hl");

    let out_dir = args
        .iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("generated").join(target));

    let offsets_path = args
        .iter()
        .position(|a| a == "--offsets")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from);

    // flight-ffi's build output directory: `flight_ffi.h` and `flight_hl.c` are the native
    // surface every generated extern is filtered by and verified against.
    let ffi_dir = args
        .iter()
        .position(|a| a == "--ffi-dir")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from);

    let crates_dir = find_crates_dir();
    let mut exports = parse::scan_all_crates(&crates_dir);
    let field_offsets = offsets_path
        .as_ref()
        .map(|p| offsets::load_offsets(p))
        .unwrap_or_default();

    let ffi_surface = ffi_dir
        .as_ref()
        .map(|dir| ffi_surface::load_ffi_surface(dir));
    if let Some(surface) = &ffi_surface {
        let dropped = haxe_common::drop_native_shape_mismatches(&mut exports, surface);
        for name in &dropped {
            eprintln!(
                "skipped flight_{name}: generic lowering disagrees with its flight-ffi wrapper"
            );
        }
        eprintln!(
            "{} functions skipped for native shape disagreement",
            dropped.len()
        );
    }

    let total_fns: usize = exports.iter().map(|e| e.fns.len()).sum();
    let total_crates = exports.len();

    match target {
        "haxe-hl" => {
            haxe_hl::generate(&exports, &out_dir, &field_offsets, ffi_surface.as_ref());
            dispatch::generate(&exports, &out_dir, ffi_surface.as_ref());
        }
        "haxe-cpp" => {
            haxe_cpp::generate(&exports, &out_dir, ffi_surface.as_ref());
            dispatch::generate(&exports, &out_dir, ffi_surface.as_ref());
        }
        "haxe-js" => {
            haxe_js::generate(&exports, &out_dir, ffi_surface.as_ref());
            dispatch::generate(&exports, &out_dir, ffi_surface.as_ref());
        }
        "haxe" => {
            haxe_hl::generate(&exports, &out_dir, &field_offsets, ffi_surface.as_ref());
            haxe_cpp::generate(&exports, &out_dir, ffi_surface.as_ref());
            haxe_js::generate(&exports, &out_dir, ffi_surface.as_ref());
            dispatch::generate(&exports, &out_dir, ffi_surface.as_ref());
        }
        other => {
            eprintln!("unknown target: {other}");
            eprintln!("available targets: haxe-hl, haxe-cpp, haxe-js, haxe");
            std::process::exit(1);
        }
    }

    eprintln!(
        "{total_fns} functions from {total_crates} crates → {}",
        out_dir.display()
    );

    if let Some(surface) = &ffi_surface {
        let verification = ffi_surface::verify_generated_externs(&out_dir, surface);
        if !verification.mismatches.is_empty() {
            for mismatch in &verification.mismatches {
                eprintln!("extern mismatch: {mismatch}");
            }
            eprintln!(
                "{} of {} native externs disagree with the flight-ffi surface",
                verification.mismatches.len(),
                verification.checked
            );
            std::process::exit(1);
        }
        eprintln!(
            "verified {} native externs against the flight-ffi surface",
            verification.checked
        );
    }
}

fn find_crates_dir() -> PathBuf {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap());

    if manifest_dir.join("crates").exists() {
        return manifest_dir.join("crates");
    }
    if manifest_dir.ends_with("crates/flight-bindgen") {
        return manifest_dir.parent().unwrap().to_path_buf();
    }
    let mut dir = manifest_dir.as_path();
    while let Some(parent) = dir.parent() {
        if parent.join("crates").exists() {
            return parent.join("crates");
        }
        dir = parent;
    }
    panic!("could not find crates/ directory");
}
