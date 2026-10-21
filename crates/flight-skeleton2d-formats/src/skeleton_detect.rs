use std::sync::{Arc, Mutex, OnceLock};

use flight_importdiagnostics::ImportDiagnostic;

use crate::dragon_bones_full::parse_dragon_bones_skeleton;
use crate::spine_json_full::parse_spine_skeleton;
use crate::types::Skeleton2DImport;

pub type Skeleton2DFormatDetector = Arc<dyn Fn(&str) -> bool + Send + Sync>;
pub type Skeleton2DFormatParser =
    Arc<dyn Fn(&str, Option<&mut Vec<ImportDiagnostic>>) -> Option<Skeleton2DImport> + Send + Sync>;

#[derive(Clone)]
struct RegisteredSkeletonFormat {
    detect: Skeleton2DFormatDetector,
    parse: Skeleton2DFormatParser,
    kind: String,
    order: usize,
}

#[derive(Default)]
struct SkeletonFormatRegistry {
    formats: Vec<RegisteredSkeletonFormat>,
    initialized: bool,
    next_order: usize,
}

fn detect_dragon_bones(text: &str) -> bool {
    return text.trim_start().starts_with('{') && key_present(text, "armature");
}

fn detect_spine(text: &str) -> bool {
    return text.trim_start().starts_with('{')
        && (key_present(text, "bones")
            || key_present(text, "skeleton")
            || key_present(text, "slots"));
}

fn ensure_built_ins() {
    let mut state = registry().lock().expect("skeleton format registry");
    if state.initialized {
        return;
    }
    state.initialized = true;
    register_format(
        &mut state,
        "Spine",
        Arc::new(detect_spine),
        Arc::new(parse_spine_skeleton),
    );
    register_format(
        &mut state,
        "DragonBones",
        Arc::new(detect_dragon_bones),
        Arc::new(parse_dragon_bones_skeleton),
    );
}

pub fn get_skeleton_2d_format_kinds() -> Vec<String> {
    ensure_built_ins();
    let mut kinds: Vec<String> = registry()
        .lock()
        .expect("skeleton format registry")
        .formats
        .iter()
        .map(|entry| entry.kind.clone())
        .collect();
    kinds.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    return kinds;
}

fn key_present(text: &str, key: &str) -> bool {
    let pattern = format!(r#""{key}"\s*:"#);
    return regex::Regex::new(&pattern)
        .expect("escaped key regex")
        .is_match(text);
}

pub fn parse_skeleton_2d(
    text: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    ensure_built_ins();
    let mut formats = registry()
        .lock()
        .expect("skeleton format registry")
        .formats
        .clone();
    formats.sort_by_key(|entry| entry.order);
    let mut diagnostics = diagnostics;
    for entry in formats {
        if (entry.detect)(text) {
            return (entry.parse)(text, diagnostics.as_deref_mut());
        }
    }
    return None;
}

fn register_format(
    state: &mut SkeletonFormatRegistry,
    kind: &str,
    detect: Skeleton2DFormatDetector,
    parse: Skeleton2DFormatParser,
) {
    if let Some(index) = state.formats.iter().position(|entry| entry.kind == kind) {
        let order = state.formats[index].order;
        state.formats[index] = RegisteredSkeletonFormat {
            detect,
            parse,
            kind: kind.to_string(),
            order,
        };
        return;
    }
    let order = state.next_order;
    state.next_order += 1;
    state.formats.push(RegisteredSkeletonFormat {
        detect,
        parse,
        kind: kind.to_string(),
        order,
    });
}

pub fn register_skeleton_2d_format(
    kind: &str,
    detect: Skeleton2DFormatDetector,
    parse: Skeleton2DFormatParser,
) {
    ensure_built_ins();
    let mut state = registry().lock().expect("skeleton format registry");
    register_format(&mut state, kind, detect, parse);
}

fn registry() -> &'static Mutex<SkeletonFormatRegistry> {
    static REGISTRY: OnceLock<Mutex<SkeletonFormatRegistry>> = OnceLock::new();
    return REGISTRY.get_or_init(|| Mutex::new(SkeletonFormatRegistry::default()));
}

pub fn unregister_skeleton_2d_format(kind: &str) {
    ensure_built_ins();
    registry()
        .lock()
        .expect("skeleton format registry")
        .formats
        .retain(|entry| entry.kind != kind);
}
