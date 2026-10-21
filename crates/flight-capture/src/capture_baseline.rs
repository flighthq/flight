//! The canonical committed capture baseline record (TS `captureBaseline.ts`).

use std::cmp::Ordering;
use std::collections::BTreeMap;

use flight_entity::{Record, entries, get_record_value, set_record_value};
use serde::ser::SerializeMap;

use crate::types::*;

/// Emits columns in the source's canonical sorted-key order. The baseline itself is an ordered
/// `Record`, so the adapter is what applies `Object.keys(...).sort()` at serialization time.
struct SortedCaptureBaseline<'a> {
    baseline: &'a CaptureBaseline,
}

/// Allocates an empty baseline record; columns are added through `set_capture_baseline_field`.
pub fn create_capture_baseline() -> CaptureBaseline {
    return Record::default();
}

/// Compares keys by UTF-16 code units, the order `Array.prototype.sort()` uses for object keys.
fn compare_utf16(left: &str, right: &str) -> Ordering {
    let mut left_units = left.encode_utf16();
    let mut right_units = right.encode_utf16();
    loop {
        match (left_units.next(), right_units.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(left_unit), Some(right_unit)) => match left_unit.cmp(&right_unit) {
                Ordering::Equal => continue,
                other => return other,
            },
        }
    }
}

/// Serializes a baseline to its committed text form: columns in sorted key order, each column's
/// fields in canonical order, 2-space indent, and a trailing newline. Only defined fields are
/// emitted.
pub fn format_capture_baseline(baseline: &CaptureBaseline) -> String {
    let sorted = SortedCaptureBaseline { baseline };
    let mut text =
        serde_json::to_string_pretty(&sorted).expect("capture baseline serializes to JSON");
    text.push('\n');
    return text;
}

/// The value of one column's field, or `None` when the column or field is absent.
pub fn get_capture_baseline_field(
    baseline: &CaptureBaseline,
    column: &str,
    field: CaptureBaselineField,
) -> Option<String> {
    let entry = get_record_value(baseline, column)?;
    return match field {
        CaptureBaselineField::Fingerprint => entry.fingerprint.clone(),
        CaptureBaselineField::Sha256 => entry.sha256.clone(),
    };
}

/// What produced one of a column's values, or `None` when that value is absent or predates
/// provenance recording (which reads as unknown provenance, never as agreement).
pub fn get_capture_baseline_provenance(
    baseline: &CaptureBaseline,
    column: &str,
    field: CaptureBaselineProvenanceField,
) -> Option<CaptureBaselineProvenance> {
    let entry = get_record_value(baseline, column)?;
    return match field {
        CaptureBaselineProvenanceField::Fingerprint => entry.fingerprint_provenance.clone(),
        CaptureBaselineProvenanceField::Sha256 => entry.sha256_provenance.clone(),
    };
}

/// Parses the text form produced by `format_capture_baseline`. Returns `None` for malformed input —
/// invalid JSON, a top-level value that is not a plain object, or a column that is not an object —
/// so a corrupt baseline reads as "no baseline" rather than crashing.
pub fn parse_capture_baseline(text: &str) -> Option<CaptureBaseline> {
    let parsed: BTreeMap<String, CaptureColumnBaseline> = serde_json::from_str(text).ok()?;
    let mut baseline = create_capture_baseline();
    for (column, entry) in parsed {
        set_record_value(&mut baseline, column, entry);
    }
    return Some(baseline);
}

/// Sets one column's field to `value`, creating the column entry if it does not yet exist.
pub fn set_capture_baseline_field(
    baseline: &mut CaptureBaseline,
    column: &str,
    field: CaptureBaselineField,
    value: &str,
) {
    let mut entry = get_record_value(baseline, column)
        .cloned()
        .unwrap_or_default();
    match field {
        CaptureBaselineField::Fingerprint => entry.fingerprint = Some(String::from(value)),
        CaptureBaselineField::Sha256 => entry.sha256 = Some(String::from(value)),
    }
    set_record_value(baseline, String::from(column), entry);
}

/// Records what produced one of a column's values, creating the column entry if it does not yet
/// exist.
pub fn set_capture_baseline_provenance(
    baseline: &mut CaptureBaseline,
    column: &str,
    field: CaptureBaselineProvenanceField,
    provenance: &CaptureBaselineProvenance,
) {
    let mut entry = get_record_value(baseline, column)
        .cloned()
        .unwrap_or_default();
    match field {
        CaptureBaselineProvenanceField::Fingerprint => {
            entry.fingerprint_provenance = Some(provenance.clone());
        }
        CaptureBaselineProvenanceField::Sha256 => {
            entry.sha256_provenance = Some(provenance.clone());
        }
    }
    set_record_value(baseline, String::from(column), entry);
}

// flight-lint: allow(sugar-delegates) canonical-order serializer adapter: serde's serialize callback emits the sorted columns, not a free-function delegate
impl serde::Serialize for SortedCaptureBaseline<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut columns = entries(self.baseline);
        columns.sort_by(|left, right| compare_utf16(left.0, right.0));
        let mut map = serializer.serialize_map(Some(columns.len()))?;
        for (column, entry) in columns {
            map.serialize_entry(column, entry)?;
        }
        return map.end();
    }
}
