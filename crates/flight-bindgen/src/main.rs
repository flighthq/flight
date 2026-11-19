mod cli;
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
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = match cli::parse_bindgen_args(&args) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("flight-bindgen: {error}");
            eprintln!("{}", cli::BINDGEN_USAGE);
            std::process::exit(2);
        }
    };
    if options.help {
        println!("{}", cli::BINDGEN_USAGE);
        return;
    }
    let target = options.target.as_str();
    let out_dir = options.out_dir.clone();
    let offsets_path = options.offsets.clone();
    let ffi_dir = options.ffi_dir.clone();

    let crates_dir = find_crates_dir();
    let exports = parse::scan_all_crates(&crates_dir);
    let field_offsets = offsets_path
        .as_ref()
        .map(|p| offsets::load_offsets(p))
        .unwrap_or_default();

    let mut ffi_surface = ffi_dir
        .as_ref()
        .map(|dir| ffi_surface::load_ffi_surface(dir));
    if let Some(surface) = ffi_surface.as_mut() {
        if let Err(errors) = haxe_common::enforce_native_binding_policy(
            &exports,
            surface,
            haxe_common::NATIVE_SKIPS,
            haxe_common::NATIVE_NEVER_ACCESSORS,
            haxe_common::RETAINED_CALLBACK_CARRIER_SKIPS,
        ) {
            for error in &errors {
                eprintln!("native binding policy: {error}");
            }
            eprintln!(
                "{} native binding policy violation(s); generation refused",
                errors.len()
            );
            std::process::exit(1);
        }
        eprintln!(
            "native binding policy: {} reviewed skips ({} retained-callback carriers), {} reviewed never accessors",
            haxe_common::NATIVE_SKIPS.len(),
            haxe_common::RETAINED_CALLBACK_CARRIER_SKIPS.len(),
            haxe_common::NATIVE_NEVER_ACCESSORS.len()
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
        other => unreachable!("cli accepted unknown target {other}"),
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
