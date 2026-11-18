//! flight-compiler: rust-only

// Pins every bounded f32 that survives the f64 migration. Each source line outside comments is
// scanned for `f32` tokens (types, `f32::` paths, literal suffixes, casts) and attributed to the
// nearest enclosing item declaration, so a new f32 anywhere, including inside an already-allowed
// item, changes the inventory and fails until it is classified here.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn source_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            source_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            out.push(path);
        }
    }
}

fn count_f32_tokens(line: &str) -> usize {
    let bytes = line.as_bytes();
    let mut count = 0;
    for index in 0..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] != b"f32" {
            continue;
        }
        let after = bytes.get(index + 3);
        let ends = after.is_none_or(|value| !value.is_ascii_alphanumeric() && *value != b'_');
        let before = index.checked_sub(1).map(|previous| bytes[previous]);
        let starts = before.is_none_or(|value| !value.is_ascii_alphabetic() && value != b'_')
            || before.is_some_and(|value| value == b'_' || value.is_ascii_digit());
        if ends && starts {
            count += 1;
        }
    }
    return count;
}

fn declared_item(line: &str) -> Option<String> {
    let mut rest = line.trim_start();
    for prefix in ["pub(crate) ", "pub "] {
        if let Some(stripped) = rest.strip_prefix(prefix) {
            rest = stripped;
        }
    }
    for keyword in [
        "fn ", "struct ", "type ", "enum ", "const ", "static ", "trait ",
    ] {
        if let Some(stripped) = rest.strip_prefix(keyword) {
            let name: String = stripped
                .chars()
                .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
                .collect();
            return Some(name);
        }
    }
    return None;
}

fn f32_inventory() -> BTreeMap<String, usize> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    source_files(&src, &mut files);
    files.sort();
    let mut inventory = BTreeMap::new();
    for path in files {
        let relative = path.strip_prefix(&src).unwrap().display().to_string();
        let mut item = String::from("<module>");
        for line in fs::read_to_string(&path).unwrap().lines() {
            if let Some(name) = declared_item(line) {
                item = name;
            }
            if line.trim_start().starts_with("//") {
                continue;
            }
            let count = count_f32_tokens(line);
            if count > 0 {
                *inventory.entry(format!("{relative}:{item}")).or_insert(0) += count;
            }
        }
    }
    return inventory;
}

#[test]
fn every_surviving_f32_is_an_inventoried_bounded_value() {
    let actual = f32_inventory();
    let expected: BTreeMap<String, usize> = EXPECTED_BOUNDED_F32
        .iter()
        .map(|(item, count)| (item.to_string(), *count))
        .collect();
    assert_eq!(
        actual, expected,
        "unclassified f32 change; classify it as f64 (spatial/time/animated value) or as a bounded \
         color/alpha/easing/weight value and update this inventory"
    );
}

const EXPECTED_BOUNDED_F32: &[(&str, usize)] = &[
    // Bounded color: the packed 24-bit RGB color target is exact in f32.
    ("color_tween.rs:create_color_tween", 2),
    ("sugar.rs:create_color_tween", 1),
    // Easing seam: f64 time/value <-> f32 normalized easing input/output.
    ("internal.rs:apply_tween_easing", 1),
    ("internal.rs:get_tween_normalized_progress", 2),
    ("internal.rs:interpolate_tween_value", 1),
    // Normalized 0-1 progress.
    ("sugar.rs:progress", 1),
    ("sugar.rs:set_progress", 1),
    ("tween_progress.rs:get_tween_progress", 1),
    ("tween_progress.rs:get_tween_progress_erased", 1),
    ("tween_progress.rs:set_tween_progress", 1),
    ("tween_progress.rs:set_tween_progress_erased", 1),
    // Easing functions over bounded 0-1 progress and the eased factor.
    ("types.rs:EasingFunction", 2),
    ("types.rs:default_ease", 2),
    ("types.rs:write_tween_ops_values", 1),
    ("types.rs:write_values", 2),
    // In-crate unit-test fixtures: a packed color field and a linear easing.
    ("sugar.rs:ColorObj", 2),
    ("sugar.rs:linear_ease", 2),
];
