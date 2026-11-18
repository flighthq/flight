//! flight-compiler: rust-only

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const FLOAT32_BOUNDARY_FUNCTIONS: &[&str] = &[
    "matrix4_transform_vectors",
    "reserve_float32_array",
    "set_matrix3_from_float32_array",
    "set_matrix4_from_float32_array",
    "set_matrix_from_float32_array",
    "set_vector2_from_float32_array",
    "set_vector3_from_float32_array",
    "set_vector4_from_float32_array",
    "write_matrix3_to_float32_array",
    "write_matrix4_to_float32_array",
    "write_matrix_to_float32_array",
    "write_vector2_to_float32_array",
    "write_vector3_to_float32_array",
    "write_vector4_to_float32_array",
];

fn crate_dir() -> PathBuf {
    return PathBuf::from(env!("CARGO_MANIFEST_DIR"));
}

fn repo_dir() -> PathBuf {
    return crate_dir().join("../..");
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, out: &mut Vec<PathBuf>) {
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

fn has_f32_word(line: &str) -> bool {
    let bytes = line.as_bytes();
    for index in 0..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] != b"f32" {
            continue;
        }
        let starts_word = index == 0 || !is_identifier_byte(bytes[index - 1]);
        let ends_word = index + 3 == bytes.len() || !is_identifier_byte(bytes[index + 3]);
        if starts_word && ends_word {
            return true;
        }
    }
    return false;
}

fn has_f32_suffix(line: &str) -> bool {
    let bytes = line.as_bytes();
    for index in 1..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] != b"f32" {
            continue;
        }
        let mut previous = index;
        while previous > 0 && bytes[previous - 1] == b'_' {
            previous -= 1;
        }
        if previous > 0 && bytes[previous - 1].is_ascii_digit() {
            return true;
        }
    }
    return false;
}

fn item_line_mask(source: &str, prefix: &str, names: &[&str]) -> Vec<bool> {
    let lines: Vec<&str> = source.lines().collect();
    let mut mask = vec![false; lines.len()];
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim_start();
        let Some(name) = names.iter().find(|name| {
            let needle = format!("{prefix}{name}");
            if !trimmed.starts_with(&needle) {
                return false;
            }
            return trimmed
                .as_bytes()
                .get(needle.len())
                .is_none_or(|value| !is_identifier_byte(*value));
        }) else {
            continue;
        };

        let needle = format!("{prefix}{name}");
        assert!(trimmed.starts_with(&needle));
        let mut start = index;
        while start > 0 {
            let previous = lines[start - 1].trim_start();
            if previous.starts_with("//") || previous.starts_with("#[") {
                start -= 1;
            } else {
                break;
            }
        }

        let mut depth = 0_i32;
        let mut saw_open = false;
        let mut end = index;
        for (line_index, item_line) in lines.iter().enumerate().skip(index) {
            for value in item_line.bytes() {
                if value == b'{' {
                    depth += 1;
                    saw_open = true;
                } else if value == b'}' {
                    depth -= 1;
                }
            }
            end = line_index;
            if saw_open && depth == 0 {
                break;
            }
        }
        for allowed in &mut mask[start..=end] {
            *allowed = true;
        }
    }
    return mask;
}

fn scan_f32_file(path: &Path, allowed: &[bool], failures: &mut Vec<String>) {
    let source = fs::read_to_string(path).unwrap();
    for (index, line) in source.lines().enumerate() {
        if line.contains("f32::") {
            failures.push(format!(
                "{}:{} uses the forbidden f32 namespace: {}",
                path.display(),
                index + 1,
                line.trim()
            ));
        }
        if has_f32_suffix(line) && !allowed.get(index).copied().unwrap_or(false) {
            failures.push(format!(
                "{}:{} uses a forbidden f32 literal suffix: {}",
                path.display(),
                index + 1,
                line.trim()
            ));
        }
        if has_f32_word(line) && !allowed.get(index).copied().unwrap_or(false) {
            failures.push(format!(
                "{}:{} retains f32 outside an inventoried Float32 boundary: {}",
                path.display(),
                index + 1,
                line.trim()
            ));
        }
    }
}

fn public_item_headers(source: &str) -> Vec<(String, String)> {
    let lines: Vec<&str> = source.lines().collect();
    let mut out = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let trimmed = lines[index].trim_start();
        let (kind, rest, braced) = if let Some(rest) = trimmed.strip_prefix("pub fn ") {
            ("fn", rest, true)
        } else if let Some(rest) = trimmed.strip_prefix("pub struct ") {
            ("struct", rest, true)
        } else if let Some(rest) = trimmed.strip_prefix("pub enum ") {
            ("enum", rest, true)
        } else if let Some(rest) = trimmed.strip_prefix("pub type ") {
            ("type", rest, false)
        } else if let Some(rest) = trimmed.strip_prefix("pub const ") {
            ("const", rest, false)
        } else if let Some(rest) = trimmed.strip_prefix("pub static ") {
            ("static", rest, false)
        } else {
            index += 1;
            continue;
        };

        let name: String = rest
            .chars()
            .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
            .collect();
        let mut header = String::new();
        let mut depth = 0_i32;
        let mut saw_open = false;
        loop {
            let item_line = lines[index];
            if !header.is_empty() {
                header.push(' ');
            }
            header.push_str(item_line.trim());
            if braced {
                for value in item_line.bytes() {
                    if value == b'{' {
                        depth += 1;
                        saw_open = true;
                    } else if value == b'}' {
                        depth -= 1;
                    }
                }
                if kind == "fn" && saw_open {
                    if let Some(position) = header.find('{') {
                        header.truncate(position);
                    }
                    break;
                }
                if saw_open && depth == 0 {
                    break;
                }
            } else if item_line.contains(';') {
                break;
            }
            index += 1;
        }
        out.push((format!("{kind}:{name}"), header));
        index += 1;
    }
    return out;
}

fn expected_float32_api_items() -> BTreeSet<String> {
    return [
        "fn:matrix4_transform_vectors",
        "fn:reserve_float32_array",
        "fn:set_matrix3_from_float32_array",
        "fn:set_matrix4_from_float32_array",
        "fn:set_matrix_from_float32_array",
        "fn:set_vector2_from_float32_array",
        "fn:set_vector3_from_float32_array",
        "fn:set_vector4_from_float32_array",
        "fn:write_matrix3_to_float32_array",
        "fn:write_matrix4_to_float32_array",
        "fn:write_matrix_to_float32_array",
        "fn:write_vector2_to_float32_array",
        "fn:write_vector3_to_float32_array",
        "fn:write_vector4_to_float32_array",
    ]
    .into_iter()
    .map(String::from)
    .collect();
}

mod f32_inventory {
    use super::*;

    #[test]
    fn marks_every_raw_float32_boundary_with_lint_evidence() {
        let repo = repo_dir();
        let mut sources = Vec::new();
        for crate_name in ["flight-geometry", "flight-math"] {
            for path in rust_files(&repo.join("crates").join(crate_name).join("src")) {
                sources.push((path.clone(), fs::read_to_string(path).unwrap()));
            }
        }

        let marker_count: usize = sources
            .iter()
            .map(|(_, source)| {
                source
                    .lines()
                    .filter(|line| line.contains("flight-lint: allow(f32)"))
                    .count()
            })
            .sum();
        assert_eq!(
            marker_count,
            FLOAT32_BOUNDARY_FUNCTIONS.len(),
            "exactly the 14 inventoried Float32 GPU/native boundary functions may allow f32"
        );

        for name in FLOAT32_BOUNDARY_FUNCTIONS {
            let signature = format!("pub fn {name}");
            let (_, source) = sources
                .iter()
                .find(|(_, source)| {
                    source
                        .lines()
                        .any(|line| line.trim_start().starts_with(&signature))
                })
                .unwrap_or_else(|| panic!("missing boundary function {name}"));
            let lines: Vec<&str> = source.lines().collect();
            let index = lines
                .iter()
                .position(|line| line.trim_start().starts_with(&signature))
                .unwrap();
            assert!(
                lines[index.saturating_sub(5)..=index]
                    .iter()
                    .any(|line| line.contains("flight-lint: allow(f32)")
                        && line
                            .split_once(')')
                            .is_some_and(|(_, reason)| !reason.trim().is_empty())),
                "{name} needs a reasoned allow(f32) marker documenting its boundary"
            );
        }
    }

    #[test]
    fn permits_only_evidenced_float32_boundaries() {
        let repo = repo_dir();
        let mut failures = Vec::new();
        for crate_name in ["flight-geometry", "flight-math"] {
            let source_dir = repo.join("crates").join(crate_name).join("src");
            for path in rust_files(&source_dir) {
                let source = fs::read_to_string(&path).unwrap();
                let allowed = if crate_name == "flight-geometry" {
                    item_line_mask(&source, "pub fn ", FLOAT32_BOUNDARY_FUNCTIONS)
                } else {
                    vec![false; source.lines().count()]
                };
                scan_f32_file(&path, &allowed, &mut failures);
            }

            let tests_dir = repo.join("crates").join(crate_name).join("tests");
            for path in rust_files(&tests_dir) {
                if path.file_name().and_then(|value| value.to_str())
                    == Some("task_n_f64_acceptance_test.rs")
                {
                    continue;
                }
                let source = fs::read_to_string(&path).unwrap();
                let allowed = if crate_name == "flight-geometry" {
                    item_line_mask(&source, "mod ", FLOAT32_BOUNDARY_FUNCTIONS)
                } else {
                    vec![false; source.lines().count()]
                };
                scan_f32_file(&path, &allowed, &mut failures);
            }
        }
        assert!(
            failures.is_empty(),
            "Task N left non-boundary f32 syntax:\n{}",
            failures.join("\n")
        );
    }
}

mod f64_api {
    use super::*;

    #[test]
    fn covers_every_named_geometry_type() {
        let expected_types: BTreeSet<String> = [
            "Aabb",
            "BoundingSphere",
            "Capsule",
            "Frustum",
            "Matrix",
            "Matrix3",
            "Matrix4",
            "Obb",
            "Plane",
            "Quaternion",
            "Ray3D",
            "Rectangle",
            "Transform2D",
            "Transform3D",
            "Vector2",
            "Vector3",
            "Vector4",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let direct_scalar_types: BTreeSet<&str> = [
            "BoundingSphere",
            "Capsule",
            "Matrix",
            "Matrix3",
            "Matrix4",
            "Obb",
            "Plane",
            "Quaternion",
            "Rectangle",
            "Transform2D",
            "Vector2",
            "Vector3",
            "Vector4",
        ]
        .into_iter()
        .collect();

        let mut actual_types = BTreeSet::new();
        let source_dir = repo_dir().join("crates/flight-geometry/src");
        for path in rust_files(&source_dir) {
            let source = fs::read_to_string(path).unwrap();
            for (label, header) in public_item_headers(&source) {
                let Some(name) = label.strip_prefix("struct:") else {
                    continue;
                };
                if expected_types.contains(name) {
                    actual_types.insert(name.to_string());
                    if direct_scalar_types.contains(name) {
                        assert!(
                            has_f32_word(&header) == false && header.contains("f64"),
                            "{name} must expose f64 scalar storage: {header}"
                        );
                    }
                }
            }
        }
        assert_eq!(actual_types, expected_types);
    }

    #[test]
    fn freezes_exact_float32_boundary_signatures() {
        let repo = repo_dir();
        let mut geometry = BTreeSet::new();
        let mut math = BTreeSet::new();
        for (crate_name, items) in [
            ("flight-geometry", &mut geometry),
            ("flight-math", &mut math),
        ] {
            for path in rust_files(&repo.join("crates").join(crate_name).join("src")) {
                let source = fs::read_to_string(path).unwrap();
                for (label, header) in public_item_headers(&source) {
                    if has_f32_word(&header) || header.to_ascii_lowercase().contains("float32") {
                        items.insert(label);
                    }
                }
            }
        }
        assert_eq!(
            geometry,
            expected_float32_api_items(),
            "the geometry Float32 API must be exactly the inventoried GPU/native boundary"
        );
        assert!(
            math.is_empty(),
            "flight-math has no approved f32 or Float32Array API survivor"
        );
    }

    #[test]
    fn requires_f64_math_constants_and_each_migrated_helper_module() {
        let source_dir = repo_dir().join("crates/flight-math/src");
        let mut constants = BTreeSet::new();
        for path in rust_files(&source_dir) {
            let source = fs::read_to_string(path).unwrap();
            for (label, header) in public_item_headers(&source) {
                if header.contains("f64") {
                    constants.insert(label);
                }
            }
        }
        for constant in [
            "CIRCLE_KAPPA",
            "DEG_TO_RAD",
            "EPSILON",
            "HALF_PI",
            "RAD_TO_DEG",
            "TAU",
        ] {
            assert!(
                constants.contains(&format!("const:{constant}")),
                "{constant} must be f64"
            );
        }
        for module in [
            "angle.rs",
            "clamp.rs",
            "comparison.rs",
            "constants.rs",
            "interpolation.rs",
            "interpolation_advanced.rs",
            "next_power_of_two.rs",
            "number_theory.rs",
            "random.rs",
            "random_distributions.rs",
            "random_range.rs",
            "rounding.rs",
            "scalar.rs",
        ] {
            let source = fs::read_to_string(source_dir.join(module)).unwrap();
            assert!(
                public_item_headers(&source)
                    .iter()
                    .any(|(_, header)| header.contains("f64")),
                "{module} must expose its migrated helper API in f64"
            );
        }
    }
}

mod protected_scope {
    use super::*;

    fn fnv1a(lines: &[String]) -> u64 {
        let mut hash = 0xcbf29ce484222325_u64;
        for line in lines {
            for value in line.bytes().chain(std::iter::once(b'\n')) {
                hash ^= u64::from(value);
                hash = hash.wrapping_mul(0x100000001b3);
            }
        }
        return hash;
    }

    #[test]
    fn preserves_flight_path_f64_annotations() {
        let path_dir = repo_dir().join("crates/flight-path");
        let mut markers = Vec::new();
        for path in rust_files(&path_dir) {
            let relative = path.strip_prefix(repo_dir()).unwrap();
            for line in fs::read_to_string(&path).unwrap().lines() {
                if line.contains("flight-lint:") && line.contains("f64") {
                    markers.push(format!("{}:{}", relative.display(), line.trim()));
                }
            }
        }
        markers.sort();
        assert_eq!(
            markers.len(),
            208,
            "Task N must not add or remove path annotations"
        );
        assert_eq!(
            fnv1a(&markers),
            13_422_142_117_017_552_300,
            "Task N must leave every flight-path f64 annotation byte-for-byte unchanged"
        );
    }
}
