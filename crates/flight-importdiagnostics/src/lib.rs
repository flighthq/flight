mod import_diagnostic_collector;
mod import_diagnostic_text;
mod types;

pub mod contract;

// Public lane: the three exports of pinned TS `index.ts`, plus the diagnostic types now owned by
// this package under the approved dissolved-types table. D9 enum string conversions are contract-only.
pub use contract::ImportDiagnostic;
pub use contract::ImportDiagnosticDetailValue;
pub use contract::ImportDiagnosticSeverity;
pub use contract::collect_import_diagnostics;
pub use contract::format_import_diagnostic;
pub use contract::report_import_diagnostic;
