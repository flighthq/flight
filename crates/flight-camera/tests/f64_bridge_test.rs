//! flight-compiler: rust-only

use std::fs;
use std::path::{Path, PathBuf};

use flight_camera::contract::*;
use flight_geometry::{create_matrix, create_vector2};

fn rust_files(path: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(path).expect("camera source directory must be readable") {
        let path = entry.expect("camera source entry must be readable").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            out.push(path);
        }
    }
}

fn contains_f32_syntax(line: &str) -> bool {
    let code = line.split("//").next().unwrap_or("");
    let bytes = code.as_bytes();
    let mut index = 0;
    while index + 2 < bytes.len() {
        if &bytes[index..index + 3] == b"f32" {
            let before = index.checked_sub(1).map(|i| bytes[i]);
            let after = bytes.get(index + 3).copied();
            let identifier = |byte: u8| byte.is_ascii_alphanumeric() || byte == b'_';
            let is_word = before.is_none_or(|byte| !identifier(byte))
                && after.is_none_or(|byte| !identifier(byte));
            let is_literal_suffix = before
                .is_some_and(|byte| byte == b'_' || byte.is_ascii_digit())
                && after.is_none_or(|byte| !identifier(byte));
            if is_word || is_literal_suffix {
                return true;
            }
        }
        index += 1;
    }
    false
}

fn scan_source(source: &str) -> Vec<usize> {
    source
        .lines()
        .enumerate()
        .filter_map(|(index, line)| contains_f32_syntax(line).then_some(index + 1))
        .collect()
}

#[test]
fn freezes_the_empty_f32_boundary_inventory() {
    let source_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&source_root, &mut files);
    files.sort();

    let mut failures = Vec::new();
    for path in files {
        let source = fs::read_to_string(&path).expect("camera source must be readable");
        for line in scan_source(&source) {
            failures.push(format!("{}:{line}", path.display()));
        }
    }

    assert!(
        failures.is_empty(),
        "flight-camera has no retained f32 boundary; found unclassified f32 syntax:\n{}",
        failures.join("\n")
    );
}

#[test]
fn f32_inventory_scanner_rejects_type_cast_and_literal_suffix_mutations() {
    let mutations = [
        "pub fn leak(value: f32) {}",
        "pub fn leak(value: f64) { let _ = value as f32; }",
        "pub fn leak() { let _ = 0.0_f32; }",
    ];
    for mutation in mutations {
        assert_eq!(
            scan_source(mutation),
            vec![1],
            "mutation escaped: {mutation}"
        );
    }
}

#[test]
fn large_coordinates_round_trip_without_a_final_narrowing_seam() {
    let coordinate = 1_000_000_000_000.25_f64;
    let mut camera = create_camera_2d();
    set_camera_2d_look_at(&mut camera, coordinate, -coordinate);
    camera.zoom = 2.0;

    let mut screen = create_vector2(0.0, 0.0);
    project_camera_2d_point(
        &camera,
        800.0,
        600.0,
        coordinate + 1.0,
        -coordinate - 2.0,
        &mut screen,
    );
    assert_eq!((screen.x, screen.y), (402.0, 296.0));

    let mut world = create_vector2(0.0, 0.0);
    unproject_camera_2d_point(&camera, 800.0, 600.0, screen.x, screen.y, &mut world);
    assert_eq!((world.x, world.y), (coordinate + 1.0, -coordinate - 2.0));
}

#[test]
fn large_angles_preserve_a_quarter_turn_that_f32_would_collapse() {
    let start = 1_000_000_000.0_f64;
    let end = start + std::f64::consts::FRAC_PI_2;
    assert_eq!(start as f32, end as f32, "fixture must expose the old seam");

    let mut camera = create_camera_2d();
    camera.rotation = start;
    let mut start_view = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(&camera, 800.0, 600.0, &mut start_view);

    camera.rotation = end;
    let mut end_view = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(&camera, 800.0, 600.0, &mut end_view);

    let linear_delta = (start_view.a - end_view.a).abs()
        + (start_view.b - end_view.b).abs()
        + (start_view.c - end_view.c).abs()
        + (start_view.d - end_view.d).abs();
    assert!(
        linear_delta > 1.0,
        "the quarter turn was lost: {linear_delta}"
    );
}
