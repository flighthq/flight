use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::spine_binary_version::get_spine_binary_version;
use crate::types::{Skeleton2DImport, SpineBinaryParser};

pub fn parse_spine_skeleton_binary_versioned(
    bytes: &[u8],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let mut diagnostics = diagnostics;
    let Some(version) = get_spine_binary_version(bytes) else {
        let mut detail = HashMap::new();
        detail.insert(
            "bytes".to_string(),
            ImportDiagnosticDetailValue::Number(bytes.len() as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spine.binary-header-unreadable",
            "parseSpineSkeletonBinaryVersioned",
            Some(detail),
        );
        return None;
    };
    let key = to_spine_binary_layout_key(&version);
    let parser = parsers()
        .lock()
        .expect("spine parser registry")
        .get(&key)
        .cloned();
    let Some(parser) = parser else {
        let mut detail = HashMap::new();
        detail.insert(
            "version".to_string(),
            ImportDiagnosticDetailValue::String(version),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spine.binary-version-unsupported",
            "parseSpineSkeletonBinaryVersioned",
            Some(detail),
        );
        return None;
    };
    return parser(bytes, diagnostics.as_deref_mut());
}

fn parsers() -> &'static Mutex<HashMap<String, SpineBinaryParser>> {
    static PARSERS: OnceLock<Mutex<HashMap<String, SpineBinaryParser>>> = OnceLock::new();
    return PARSERS.get_or_init(|| Mutex::new(HashMap::new()));
}

pub fn register_spine_skeleton_binary_parser(version: &str, parser: SpineBinaryParser) {
    parsers()
        .lock()
        .expect("spine parser registry")
        .insert(to_spine_binary_layout_key(version), parser);
}

pub fn to_spine_binary_layout_key(version: &str) -> String {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < 2 {
        return version.to_string();
    }
    return format!("{}.{}", parts[0], parts[1]);
}
