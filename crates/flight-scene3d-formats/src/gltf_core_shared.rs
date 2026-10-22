use crate::gltf_diagnostics::gltf_diagnostic_values;
use crate::gltf_types::{GltfComponentArray, GltfCoreFeatureContext};
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};

pub(crate) fn gltf_component_values(out: &mut Vec<f32>, data: &GltfComponentArray) {
    out.clear();
    match data {
        GltfComponentArray::Float32(values) => {
            out.extend(values.values.read().unwrap().iter().copied())
        }
        GltfComponentArray::Int8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f32),
        ),
        GltfComponentArray::Int16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f32),
        ),
        GltfComponentArray::Uint8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f32),
        ),
        GltfComponentArray::Uint16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f32),
        ),
        GltfComponentArray::Uint32(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as f32),
        ),
    }
}

pub(crate) fn gltf_core_index(value: f32) -> Option<usize> {
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
