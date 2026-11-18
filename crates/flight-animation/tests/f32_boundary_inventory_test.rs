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
    // Blend weights and the public blend alpha are bounded inputs.
    ("animation_blend.rs:accumulate_animation_sample", 1),
    ("animation_blend.rs:add_animation_sample", 1),
    ("animation_blend.rs:blend_animation_samples", 1),
    (
        "animation_blend_tree.rs:set_animation_blend_tree_input_weight",
        1,
    ),
    ("animation_layer_stack.rs:set_animation_layer_weight", 1),
    ("sugar.rs:accumulate", 1),
    ("sugar.rs:set_input_weight", 1),
    ("sugar.rs:set_layer_weight", 1),
    ("types.rs:AnimationBlendTreeInput", 1),
    ("types.rs:AnimationLayer", 1),
    ("types.rs:AnimationLayerOptions", 1),
    ("types.rs:AnimationSampleAccumulator", 1),
    // Transition weights narrowed once from clamped f64 time.
    (
        "animation_crossfade.rs:get_linear_animation_crossfade_weight",
        2,
    ),
    (
        "animation_state_machine.rs:get_linear_animation_state_machine_transition_weight",
        2,
    ),
    (
        "animation_state_machine_advance.rs:get_linear_animation_state_machine_transition_weight",
        2,
    ),
    ("types.rs:AnimationCrossfade", 1),
    ("types.rs:AnimationStateMachine", 1),
    // Easing curves over bounded 0-1 progress and the per-keyframe easing seam.
    ("animation_crossfade.rs:linear_animation_crossfade_curve", 2),
    (
        "animation_state_machine.rs:linear_animation_state_machine_curve",
        2,
    ),
    ("animation_track.rs:ease_animation_track_alpha", 1),
    ("types.rs:EasingFn", 2),
    ("types.rs:linear_easing_identity", 2),
    // Normalized 0-1 playback progress.
    (
        "animation_player.rs:get_animation_player_normalized_time",
        2,
    ),
    ("sugar.rs:normalized_time", 1),
];
