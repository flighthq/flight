//! Capture verification types (TS `types/src/CaptureBaseline.ts`, `CaptureColumnBaseline.ts`,
//! `CaptureBaselineProvenance.ts`, `CaptureBaselineField.ts`, `CaptureBaselineProvenanceField.ts`,
//! `CaptureCheckResult.ts`).

use flight_entity::Record;

/// Default parity tolerance (mean absolute per-channel difference, 0..255). Cross-backend agreement
/// is at most about 6.5 even for antialiasing-heavy scenes.
// flight-lint: allow(f64) D1: the tolerance is a JS number compared against a mean channel distance, which is fractional
pub const CAPTURE_PARITY_TOLERANCE: f64 = 15.0;

/// Default regression tolerance (mean absolute per-channel difference, 0..255). Same-backend
/// run-to-run noise for a stable test stays well under 5.
// flight-lint: allow(f64) D1: the tolerance is a JS number compared against a mean channel distance, which is fractional
pub const CAPTURE_REGRESSION_TOLERANCE: f64 = 5.0;

/// The outcome of a tolerance check: the measured `difference`, the `tolerance` it was compared
/// against, and whether it passed. `difference` is `f64::INFINITY` when a fingerprint could not be
/// parsed, which fails any finite tolerance.
// flight-lint: allow(f64) D1: a mean per-channel distance is fractional in the TS number domain and needs the Infinity sentinel
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CaptureCheckResult {
    pub pass: bool,
    pub difference: f64,
    pub tolerance: f64,
}

/// The committed baseline values for a single column (backend/renderer) of one capture test. Each
/// field is written independently; absent fields stay absent in the serialized form.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureColumnBaseline {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    /// Deprecated partial provenance for legacy fingerprints; retained only until that column is next
    /// written with full fingerprint provenance.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint_provenance: Option<CaptureBaselineProvenance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256_provenance: Option<CaptureBaselineProvenance>,
}

/// What produced ONE of a column's values — the conditions the artifact was captured under.
/// Nullable members are `string | null` in the source declaration.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBaselineProvenance {
    pub computation_id: Option<String>,
    pub frames: u32,
    pub source_hash: Option<String>,
    pub target_kind: Option<String>,
    pub verify_published: bool,
    pub warmup_frames: u32,
}

/// A single capture test's committed baseline: column name to that column's baseline values.
pub type CaptureBaseline = Record<CaptureColumnBaseline>;

/// The string-valued fields of a column that a get/set-by-name accessor can carry. A closed union
/// rather than the column's full key set, because the provenance members are records.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureBaselineField {
    Fingerprint,
    Sha256,
}

/// Which of a column's independently-written values a provenance record describes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureBaselineProvenanceField {
    Fingerprint,
    Sha256,
}

// flight-lint: allow(conform-extra) D9 string table for the closed CaptureBaselineField union (TS union names are strings)
pub fn get_capture_baseline_field_string(value: CaptureBaselineField) -> &'static str {
    return match value {
        CaptureBaselineField::Fingerprint => "fingerprint",
        CaptureBaselineField::Sha256 => "sha256",
    };
}

// flight-lint: allow(conform-extra) D9 string table for the closed CaptureBaselineProvenanceField union (TS union names are strings)
pub fn get_capture_baseline_provenance_field_string(
    value: CaptureBaselineProvenanceField,
) -> &'static str {
    return match value {
        CaptureBaselineProvenanceField::Fingerprint => "fingerprint",
        CaptureBaselineProvenanceField::Sha256 => "sha256",
    };
}

// flight-lint: allow(conform-extra) D9 parser for the closed CaptureBaselineField union, the inverse of the string table
pub fn parse_capture_baseline_field(value: &str) -> Option<CaptureBaselineField> {
    return match value {
        "fingerprint" => Some(CaptureBaselineField::Fingerprint),
        "sha256" => Some(CaptureBaselineField::Sha256),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 parser for the closed CaptureBaselineProvenanceField union, the inverse of the string table
pub fn parse_capture_baseline_provenance_field(
    value: &str,
) -> Option<CaptureBaselineProvenanceField> {
    return match value {
        "fingerprint" => Some(CaptureBaselineProvenanceField::Fingerprint),
        "sha256" => Some(CaptureBaselineProvenanceField::Sha256),
        _ => None,
    };
}
