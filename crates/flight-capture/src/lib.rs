//! Capture verification: tolerant fingerprint comparison and the canonical committed baseline
//! record. No filesystem, browser, screenshot or hash computation lives here; the public lane
//! mirrors TS `capture/src/index.ts`.

mod capture_baseline;
mod capture_comparison;
mod types;

pub mod contract;

pub use contract::compare_capture_fingerprints;
pub use contract::create_capture_baseline;
pub use contract::evaluate_capture_parity;
pub use contract::evaluate_capture_regression;
pub use contract::format_capture_baseline;
pub use contract::get_capture_baseline_field;
pub use contract::get_capture_baseline_provenance;
pub use contract::parse_capture_baseline;
pub use contract::set_capture_baseline_field;
pub use contract::set_capture_baseline_provenance;

pub use contract::CAPTURE_PARITY_TOLERANCE;
pub use contract::CAPTURE_REGRESSION_TOLERANCE;
pub use contract::CaptureBaseline;
pub use contract::CaptureBaselineField;
pub use contract::CaptureBaselineProvenance;
pub use contract::CaptureBaselineProvenanceField;
pub use contract::CaptureCheckResult;
pub use contract::CaptureColumnBaseline;
