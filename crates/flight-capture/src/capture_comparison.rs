//! Tolerant capture fingerprint comparison (TS `captureComparison.ts`).

use flight_bitmap::{compare_bitmap_fingerprints, parse_bitmap_fingerprint};

use crate::types::*;

/// The tolerant distance between two coarse render fingerprints in `<gridSize>:<hex>` text form:
/// the mean absolute per-channel difference (0..255). Returns `f64::INFINITY` when either string
/// fails to parse, or when the fingerprints use different grid sizes and are not comparable.
// flight-lint: allow(f64) D1: the source returns a JS number, including the Infinity sentinel, and the mean is fractional
pub fn compare_capture_fingerprints(a: &str, b: &str) -> f64 {
    let first = parse_bitmap_fingerprint(a);
    let second = parse_bitmap_fingerprint(b);
    let (Some(first), Some(second)) = (first, second) else {
        return f64::INFINITY;
    };
    if first.grid_size != second.grid_size {
        return f64::INFINITY;
    }
    return compare_bitmap_fingerprints(&first, &second);
}

/// Whether two render backends rendering the same scene in the same run agree within `tolerance`.
/// Environment-independent: it needs no committed baseline, only the two live fingerprints.
// flight-lint: allow(f64) D1: difference and tolerance are JS numbers; the comparison is the source's `difference <= tolerance`
pub fn evaluate_capture_parity(a: &str, b: &str, tolerance: Option<f64>) -> CaptureCheckResult {
    let tolerance = tolerance.unwrap_or(CAPTURE_PARITY_TOLERANCE);
    let difference = compare_capture_fingerprints(a, b);
    return CaptureCheckResult {
        pass: difference <= tolerance,
        difference,
        tolerance,
    };
}

/// Whether a freshly captured `fingerprint` still matches its own committed
/// `baseline_fingerprint` within `tolerance`.
// flight-lint: allow(f64) D1: difference and tolerance are JS numbers; the comparison is the source's `difference <= tolerance`
pub fn evaluate_capture_regression(
    fingerprint: &str,
    baseline_fingerprint: &str,
    tolerance: Option<f64>,
) -> CaptureCheckResult {
    let tolerance = tolerance.unwrap_or(CAPTURE_REGRESSION_TOLERANCE);
    let difference = compare_capture_fingerprints(fingerprint, baseline_fingerprint);
    return CaptureCheckResult {
        pass: difference <= tolerance,
        difference,
        tolerance,
    };
}
