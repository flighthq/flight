//! flight-compiler: rust-only — freezes Rust scalar boundaries and exercises values TS keeps as Number

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path as FsPath, PathBuf};

use flight_geometry::{create_matrix, create_rectangle, create_vector2};
use flight_path::contract::*;

const EXPECTED_F32_BOUNDARIES: &[&str] = &[
    "src/path.rs::struct PathMeshTyped",
    "src/tessellate_path_typed.rs::fn tessellate_path_typed",
    "src/tessellate_path_typed.rs::fn tessellate_path_typed_into",
];

fn crate_dir() -> PathBuf {
    return PathBuf::from(env!("CARGO_MANIFEST_DIR"));
}

fn rust_files(dir: &FsPath) -> Vec<PathBuf> {
    fn visit(dir: &FsPath, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path, out);
            } else if path.extension().and_then(|value| value.to_str()) == Some("rs") {
                out.push(path);
            }
        }
    }

    let mut out = Vec::new();
    visit(dir, &mut out);
    out.sort();
    return out;
}

fn is_identifier_byte(value: u8) -> bool {
    return value.is_ascii_alphanumeric() || value == b'_';
}

fn has_f32_syntax(line: &str) -> bool {
    let code = line.split_once("//").map_or(line, |(code, _)| code);
    let bytes = code.as_bytes();
    for index in 0..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] != b"f32" {
            continue;
        }
        let ends_token = index + 3 == bytes.len() || !is_identifier_byte(bytes[index + 3]);
        let starts_word = index == 0 || !is_identifier_byte(bytes[index - 1]);
        let is_direct_suffix = index > 0 && bytes[index - 1].is_ascii_digit();
        let is_underscored_suffix =
            index > 1 && bytes[index - 1] == b'_' && bytes[index - 2].is_ascii_digit();
        if ends_token && (starts_word || is_direct_suffix || is_underscored_suffix) {
            return true;
        }
    }
    return false;
}

fn item_header(line: &str) -> Option<(&'static str, &str)> {
    let trimmed = line.trim_start();
    for (prefix, kind) in [
        ("pub(crate) fn ", "fn"),
        ("pub fn ", "fn"),
        ("fn ", "fn"),
        ("pub struct ", "struct"),
        ("struct ", "struct"),
    ] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return Some((kind, rest));
        }
    }
    return None;
}

fn boundary_mask_and_id(relative: &str, lines: &[&str], marker: usize) -> (Vec<bool>, String) {
    let reason = lines[marker]
        .split_once("allow(f32)")
        .map(|(_, value)| value.trim())
        .unwrap_or_default();
    assert!(
        !reason.is_empty(),
        "{relative}:{} needs a reason",
        marker + 1
    );

    let mut item = marker + 1;
    let (kind, rest) = loop {
        let Some(line) = lines.get(item) else {
            panic!("{relative}:{} marker has no following item", marker + 1);
        };
        if let Some(header) = item_header(line) {
            break header;
        }
        item += 1;
    };
    let name: String = rest
        .chars()
        .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
        .collect();
    assert!(!name.is_empty());

    let mut depth = 0_i32;
    let mut saw_open = false;
    let mut end = item;
    for (index, line) in lines.iter().enumerate().skip(item) {
        for value in line.bytes() {
            if value == b'{' {
                depth += 1;
                saw_open = true;
            } else if value == b'}' {
                depth -= 1;
            }
        }
        end = index;
        if saw_open && depth == 0 {
            break;
        }
    }
    assert!(saw_open, "{relative}:{} item has no body", item + 1);
    let mut mask = vec![false; lines.len()];
    for allowed in &mut mask[marker..=end] {
        *allowed = true;
    }
    return (mask, format!("{relative}::{kind} {name}"));
}

fn source_inventory(relative: &str, source: &str) -> (BTreeSet<String>, Vec<String>) {
    let lines: Vec<&str> = source.lines().collect();
    let mut boundaries = BTreeSet::new();
    let mut allowed = vec![false; lines.len()];
    for (index, line) in lines.iter().enumerate() {
        if line.contains("flight-lint: allow(f32)") {
            let (item_mask, id) = boundary_mask_and_id(relative, &lines, index);
            assert!(boundaries.insert(id.clone()), "duplicate boundary {id}");
            for (target, item) in allowed.iter_mut().zip(item_mask) {
                *target |= item;
            }
        }
    }
    let mut failures = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if has_f32_syntax(line) && !allowed[index] {
            failures.push(format!("{relative}:{}: {}", index + 1, line.trim()));
        }
    }
    return (boundaries, failures);
}

#[test]
fn freezes_the_exact_reasoned_f32_boundary_inventory() {
    let root = crate_dir();
    let mut actual = BTreeSet::new();
    let mut failures = Vec::new();
    for path in rust_files(&root.join("src")) {
        let source = fs::read_to_string(&path).unwrap();
        let relative = path
            .strip_prefix(&root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let (boundaries, file_failures) = source_inventory(&relative, &source);
        actual.extend(boundaries);
        failures.extend(file_failures);
    }
    let expected: BTreeSet<String> = EXPECTED_F32_BOUNDARIES
        .iter()
        .map(|value| (*value).to_string())
        .collect();
    assert_eq!(actual, expected);
    assert!(
        failures.is_empty(),
        "unclassified f32 syntax remains:\n{}",
        failures.join("\n")
    );
}

#[test]
fn f32_inventory_scanner_rejects_type_cast_and_literal_suffix_mutations() {
    for mutation in [
        "pub fn leak(value: f32) {}",
        "pub fn leak(value: f64) { let _ = value as f32; }",
        "pub fn leak() { let _ = 0.0_f32; }",
    ] {
        let (_, failures) = source_inventory("mutation.rs", mutation);
        assert_eq!(failures.len(), 1, "scanner missed mutation: {mutation}");
    }
}

#[test]
fn preserves_large_coordinates_across_bounds_queries_and_transforms() {
    let x = 1_000_000_000_000.25_f64;
    let y = -1_000_000_000_000.5_f64;
    let mut path = create_path(Some(PathWinding::NonZero));
    append_path_move_to(&mut path, x, y);
    append_path_line_to(&mut path, x + 4.0, y);

    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    assert!(get_path_bounds(&path, &mut bounds));
    assert_eq!((bounds.x, bounds.y, bounds.width), (x, y, 4.0));

    let mut point = create_vector2(0.0, 0.0);
    assert!(get_path_point_at_distance(
        &path,
        2.0,
        &mut point,
        Some(0.01)
    ));
    assert_eq!((point.x, point.y), (x + 2.0, y));
    assert!(get_path_segment_point_at_parameter(
        &path, 0, 0.5, &mut point
    ));
    assert_eq!((point.x, point.y), (x + 2.0, y));

    let distance = get_path_nearest_point(&path, x + 2.0, y + 3.0, &mut point, Some(0.01));
    assert_eq!(distance, 3.0);
    assert_eq!((point.x, point.y), (x + 2.0, y));

    let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.5, -0.25);
    let mut transformed = create_path(Some(PathWinding::NonZero));
    transform_path(&path, &matrix, &mut transformed);
    assert_eq!(transformed.data[0], x + 0.5);
    assert_eq!(transformed.data[1], y - 0.25);
}

#[test]
fn preserves_an_arc_sweep_that_f32_cannot_resolve_at_a_large_angle() {
    let start = 1_000_000_000.0_f64;
    let end = start + std::f64::consts::FRAC_PI_2;
    assert_eq!(start as f32, end as f32);

    let mut path = create_path(Some(PathWinding::NonZero));
    append_path_arc(&mut path, 3.0, -4.0, 7.0, start, end, None, None);
    let (x, y) = get_path_last_point(&path).unwrap();
    let expected_x = 3.0 + end.cos() * 7.0;
    let expected_y = -4.0 + end.sin() * 7.0;
    assert!((x - expected_x).abs() < 2e-6);
    assert!((y - expected_y).abs() < 2e-6);
    let start_x = 3.0 + start.cos() * 7.0;
    let start_y = -4.0 + start.sin() * 7.0;
    assert!((x - start_x).hypot(y - start_y) > 5.0);
}
