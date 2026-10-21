use std::collections::HashMap;

use crate::types::ImportDiagnostic;
use crate::types::ImportDiagnosticDetailValue;
use crate::types::ImportDiagnosticSeverity;

/// Runs a parser-like callback with a fresh, engaged collector and returns its diagnostics in
/// emission order.
pub fn collect_import_diagnostics(
    run: &dyn Fn(&mut Vec<ImportDiagnostic>),
) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    run(&mut diagnostics);
    return diagnostics;
}

/// Appends one structured diagnostic when a collector is engaged. The default `None` path is a
/// no-op and does not construct a crumb.
pub fn report_import_diagnostic(
    sink: Option<&mut Vec<ImportDiagnostic>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    let Some(sink) = sink else {
        return;
    };
    sink.push(ImportDiagnostic {
        detail,
        kind: kind.to_string(),
        origin: origin.to_string(),
        severity,
    });
}
