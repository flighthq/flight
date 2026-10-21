use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum ImportDiagnosticDetailValue {
    Bool(bool),
    Number(f32),
    String(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportDiagnosticSeverity {
    Drop,
    Recover,
    Reject,
    Skip,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImportDiagnostic {
    pub detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
    pub kind: String,
    pub origin: String,
    pub severity: ImportDiagnosticSeverity,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ImportDiagnosticSeverity string union; TS exports the union and const namespace only
pub fn get_import_diagnostic_severity_string(value: ImportDiagnosticSeverity) -> &'static str {
    return match value {
        ImportDiagnosticSeverity::Drop => "Drop",
        ImportDiagnosticSeverity::Recover => "Recover",
        ImportDiagnosticSeverity::Reject => "Reject",
        ImportDiagnosticSeverity::Skip => "Skip",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ImportDiagnosticSeverity string union; TS exports the union and const namespace only
pub fn parse_import_diagnostic_severity(value: &str) -> Option<ImportDiagnosticSeverity> {
    return match value {
        "Drop" => Some(ImportDiagnosticSeverity::Drop),
        "Recover" => Some(ImportDiagnosticSeverity::Recover),
        "Reject" => Some(ImportDiagnosticSeverity::Reject),
        "Skip" => Some(ImportDiagnosticSeverity::Skip),
        _ => None,
    };
}
