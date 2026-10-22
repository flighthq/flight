use crate::gltf_types::GltfAccessorFault;
use flight_entity::{Record, Ref, entries, set_record_value};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[cfg(test)]
#[path = "../tests/internal/gltf_diagnostics_test.rs"]
mod tests;

pub(crate) enum GltfDiagnosticDetail {
    Numbers(GltfDiagnosticNumbers),
    Values(GltfDiagnosticValues),
}

pub(crate) struct GltfDiagnosticNumbers {
    pub value: Ref<Record<f32>>,
}

pub(crate) struct GltfDiagnosticValues {
    pub value: Ref<Record<ImportDiagnosticDetailValue>>,
}

pub(crate) struct GltfDropTally {
    pub count: usize,
    pub detail: GltfDiagnosticDetail,
    pub key: String,
    pub kind: String,
    pub severity: ImportDiagnosticSeverity,
}

pub(crate) fn flush_gltf_drops(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    tallies: Option<&Ref<Vec<GltfDropTally>>>,
) {
    let (Some(diagnostics), Some(tallies)) = (diagnostics, tallies) else {
        return;
    };
    for tally in tallies.read().unwrap().iter() {
        let mut detail = HashMap::new();
        match &tally.detail {
            GltfDiagnosticDetail::Numbers(numbers) => {
                let numbers = numbers.value.read().unwrap();
                let mut pairs = Vec::new();
                entries(&mut pairs, &numbers);
                for (key, value) in pairs {
                    detail.insert(key.to_string(), ImportDiagnosticDetailValue::Number(*value));
                }
            }
            GltfDiagnosticDetail::Values(values) => {
                let values = values.value.read().unwrap();
                let mut pairs = Vec::new();
                entries(&mut pairs, &values);
                for (key, value) in pairs {
                    detail.insert(key.to_string(), value.clone());
                }
            }
        }
        detail.insert(
            "count".to_string(),
            ImportDiagnosticDetailValue::Number(tally.count as f32),
        );
        report_import_diagnostic(
            Some(&mut diagnostics.write().unwrap()),
            tally.severity,
            &tally.kind,
            "buildGltfDocument",
            Some(detail),
        );
    }
}

pub(crate) fn gltf_diagnostic_numbers(values: &[(&str, f32)]) -> Ref<Record<f32>> {
    let mut out = Record::default();
    for (key, value) in values {
        set_record_value(&mut out, key.to_string(), *value);
    }
    return Arc::new(RwLock::new(out));
}

pub(crate) fn gltf_diagnostic_values(
    values: &[(&str, ImportDiagnosticDetailValue)],
) -> Ref<Record<ImportDiagnosticDetailValue>> {
    let mut out = Record::default();
    for (key, value) in values {
        set_record_value(&mut out, key.to_string(), value.clone());
    }
    return Arc::new(RwLock::new(out));
}

pub(crate) fn report_gltf_accessor_fault(
    tallies: Option<&Ref<Vec<GltfDropTally>>>,
    severity: ImportDiagnosticSeverity,
    fault: &Ref<GltfAccessorFault>,
) {
    let (kind, detail) = {
        let fault = fault.read().unwrap();
        (fault.kind.clone(), fault.detail.clone())
    };
    tally_gltf_drop(
        tallies,
        severity,
        &kind,
        "",
        GltfDiagnosticDetail::Numbers(GltfDiagnosticNumbers { value: detail }),
    );
}

pub(crate) fn tally_gltf_drop(
    tallies: Option<&Ref<Vec<GltfDropTally>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    first_detail: GltfDiagnosticDetail,
) {
    let Some(tallies) = tallies else {
        return;
    };
    // The source uses one string key. In particular, embedded '|' characters can collide.
    let key = format!("{kind}|{discriminator}");
    let mut tallies = tallies.write().unwrap();
    if let Some(existing) = tallies.iter_mut().find(|tally| tally.key == key) {
        existing.count += 1;
    } else {
        tallies.push(GltfDropTally {
            count: 1,
            detail: first_detail,
            key,
            kind: kind.to_string(),
            severity,
        });
    }
}

pub(crate) fn tally_gltf_numbers(
    tallies: Option<&Ref<Vec<GltfDropTally>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    values: &[(&str, f32)],
) {
    if tallies.is_none() {
        return;
    }
    tally_gltf_drop(
        tallies,
        severity,
        kind,
        "",
        GltfDiagnosticDetail::Numbers(GltfDiagnosticNumbers {
            value: gltf_diagnostic_numbers(values),
        }),
    );
}
