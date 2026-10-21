use crate::types::ImportDiagnostic;
use crate::types::ImportDiagnosticDetailValue;
use crate::types::get_import_diagnostic_severity_string;

/// Renders one diagnostic as `<severity> <origin>: <kind>[ key=value …]`.
// flight-lint: allow(hashmap-iteration) D3: the pinned TS Record must be enumerated on this opt-in formatting path; UTF-16 key sorting makes hash iteration order unobservable
pub fn format_import_diagnostic(diagnostic: &ImportDiagnostic) -> String {
    let mut detail_text = String::new();
    if let Some(detail) = &diagnostic.detail {
        let mut keys: Vec<&String> = detail.keys().collect();
        keys.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
        for key in keys {
            let value = detail.get(key).unwrap();
            detail_text.push(' ');
            detail_text.push_str(key);
            detail_text.push('=');
            detail_text.push_str(&format_import_diagnostic_detail_value(value));
        }
    }
    return format!(
        "{} {}: {}{}",
        get_import_diagnostic_severity_string(diagnostic.severity),
        diagnostic.origin,
        diagnostic.kind,
        detail_text
    );
}

fn format_import_diagnostic_detail_value(value: &ImportDiagnosticDetailValue) -> String {
    return match value {
        ImportDiagnosticDetailValue::Bool(value) => value.to_string(),
        ImportDiagnosticDetailValue::Number(value) => format_import_diagnostic_number(*value),
        ImportDiagnosticDetailValue::String(value) => value.clone(),
    };
}

fn format_import_diagnostic_number(value: f32) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value == f32::INFINITY {
        return "Infinity".to_string();
    }
    if value == f32::NEG_INFINITY {
        return "-Infinity".to_string();
    }
    if value == 0.0 {
        return "0".to_string();
    }
    return value.to_string();
}
