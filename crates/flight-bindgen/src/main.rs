mod dispatch;
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

    let crates_dir = find_crates_dir();
    let exports = parse::scan_all_crates(&crates_dir);
    let field_offsets = offsets_path
        .as_ref()
        .map(|p| offsets::load_offsets(p))
        .unwrap_or_default();

    let total_fns: usize = exports.iter().map(|e| e.fns.len()).sum();
    let total_crates = exports.len();

    match target {
        "haxe-hl" => {
            haxe_hl::generate(&exports, &out_dir, &field_offsets);
            dispatch::generate(&exports, &out_dir);
        }
        "haxe-cpp" => {
            haxe_cpp::generate(&exports, &out_dir);
            dispatch::generate(&exports, &out_dir);
        }
        "haxe-js" => {
            haxe_js::generate(&exports, &out_dir);
            dispatch::generate(&exports, &out_dir);
        }
        "haxe" => {
            haxe_hl::generate(&exports, &out_dir, &field_offsets);
            haxe_cpp::generate(&exports, &out_dir);
            haxe_js::generate(&exports, &out_dir);
            dispatch::generate(&exports, &out_dir);
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
