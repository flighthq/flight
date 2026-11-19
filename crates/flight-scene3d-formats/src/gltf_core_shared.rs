//! flight-compiler: rust-only

// flight-lint: allow-file(f64) Task Q format numbers: glTF JSON, COLLADA, MD5 and OBJ text numbers are JS Numbers held in f64, and binary AWD2/3DS/MD2/STL/glTF f32 fields widen exactly at decode; vertex, material, color and diagnostic lanes stay f32

use crate::gltf_diagnostics::gltf_diagnostic_values;
use crate::gltf_types::{GltfComponentArray, GltfCoreFeatureContext};
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};

pub(crate) fn gltf_component_values(out: &mut Vec<f64>, data: &GltfComponentArray) {
    out.clear();
    match data {
        GltfComponentArray::Float32(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| f64::from(*value)),
        ),
        GltfComponentArray::Int8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f64),
        ),
        GltfComponentArray::Int16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f64),
        ),
        GltfComponentArray::Uint8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f64),
        ),
        GltfComponentArray::Uint16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f64),
        ),
        GltfComponentArray::Uint32(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f64),
        ),
    }
}

pub(crate) fn gltf_core_index(value: f64) -> Option<usize> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 {
        return None;
    }
    return Some(value as usize);
}

pub(crate) fn report_gltf_core_values(
    context: &Ref<GltfCoreFeatureContext>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    values: &[(&str, ImportDiagnosticDetailValue)],
) {
    let report = context.read().unwrap().report_diagnostic.clone();
    let detail = gltf_diagnostic_values(values);
    report(severity, kind, Some(&detail), None);
}
