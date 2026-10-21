use std::collections::HashMap;

use crate::types::ImportDiagnostic;
use crate::types::ImportDiagnosticDetailValue;
use crate::types::ImportDiagnosticSeverity;

/// Runs a parser-like callback with `out` cleared and engaged as its collector, leaving the
/// diagnostics in emission order.
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the diagnostics fill a caller-owned out, cleared first
pub fn collect_import_diagnostics(
    out: &mut Vec<ImportDiagnostic>,
    run: &dyn Fn(&mut Vec<ImportDiagnostic>),
) {
    out.clear();
    run(out);
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
