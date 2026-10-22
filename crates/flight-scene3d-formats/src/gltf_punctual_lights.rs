use crate::gltf_core_shared::gltf_core_index;
use crate::gltf_material::pack_gltf_linear_color;
use crate::gltf_schema::GltfPunctualLight;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_geometry::create_vector3;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_lighting::{
    DirectionalLightOptions, LightRef, SpotLightOptions, create_directional_light,
    create_point_light, create_spot_light,
};
use flight_scene3d::Scene3DDocumentLight;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_lights_punctual".to_string(),
            apply: Arc::new(apply_gltf_punctual_lights),
        }))
    });

struct LightDropTally {
    count: usize,
    entries: Vec<(String, ImportDiagnosticDetailValue)>,
    kind: String,
    severity: ImportDiagnosticSeverity,
}

fn apply_gltf_punctual_lights(context: &Ref<GltfExtensionContext>) {
    let source = context.read().unwrap().source.clone();
    let extensions = source.read().unwrap().extensions.clone();
    let definitions = extensions
        .and_then(|extensions| extensions.read().unwrap().khr_lights_punctual.clone())
        .map(|lights| lights.read().unwrap().lights.clone())
        .unwrap_or_default();
    let nodes = source.read().unwrap().nodes.clone().unwrap_or_default();
    let mut light_drops = context
        .read()
        .unwrap()
        .diagnostics
        .as_ref()
        .map(|_| Vec::new());
    for (node, source_node) in nodes.iter().enumerate() {
        let extensions = source_node.read().unwrap().extensions.clone();
        let light_index = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_lights_punctual.clone())
            .map(|light| light.read().unwrap().light);
        let Some(light_index) = light_index else {
            continue;
        };
        let definition = gltf_core_index(light_index).and_then(|index| definitions.get(index));
        let Some(definition) = definition else {
            tally_light_drop(
                &mut light_drops,
                ImportDiagnosticSeverity::Drop,
                "gltf.light-missing",
                &[
                    (
                        "firstLight",
                        ImportDiagnosticDetailValue::Number(light_index),
                    ),
                    (
                        "firstNode",
                        ImportDiagnosticDetailValue::Number(node as f32),
                    ),
                ],
            );
            continue;
        };
        let Some(descriptor) = build_gltf_punctual_light(definition, light_index, &mut light_drops)
        else {
            continue;
        };
        let name = definition.read().unwrap().name.clone();
        let indices = context.read().unwrap().node_indices.clone();
        let mapped_node = indices.read().unwrap().get(node).copied();
        let build = context.read().unwrap().build_node_transform.clone();
        let transform = build(node as f32);
        let document = context.read().unwrap().document.clone();
        document.write().unwrap().lights.push(Scene3DDocumentLight {
            descriptor,
            name,
            node: mapped_node,
            transform,
        });
    }
    if let Some(light_drops) = light_drops {
        for tally in light_drops {
            let diagnostics = context.read().unwrap().diagnostics.clone();
            if let Some(diagnostics) = diagnostics {
                let mut diagnostic_payload: HashMap<_, _> = tally.entries.into_iter().collect();
                diagnostic_payload.insert(
                    "count".to_string(),
                    ImportDiagnosticDetailValue::Number(tally.count as f32),
                );
                report_import_diagnostic(
                    Some(&mut diagnostics.write().unwrap()),
                    tally.severity,
                    &tally.kind,
                    "buildGltfPunctualLight",
                    Some(diagnostic_payload),
                );
            }
        }
    }
}

fn build_gltf_punctual_light(
    source: &Ref<GltfPunctualLight>,
    index: f32,
    light_drops: &mut Option<Vec<LightDropTally>>,
) -> Option<LightRef> {
    let color = source
        .read()
        .unwrap()
        .color
        .clone()
        .unwrap_or_else(|| vec![1.0, 1.0, 1.0]);
    let color = [
        color.first().copied().unwrap_or(1.0),
        color.get(1).copied().unwrap_or(1.0),
        color.get(2).copied().unwrap_or(1.0),
    ];
    let color = pack_gltf_linear_color(&color, 3);
    let intensity = source.read().unwrap().intensity.unwrap_or(1.0);
    if !(intensity >= 0.0) {
        tally_light_drop(
            light_drops,
            ImportDiagnosticSeverity::Drop,
            "gltf.light-negative-intensity",
            &[("firstLight", ImportDiagnosticDetailValue::Number(index))],
        );
        return None;
    }
    if source.read().unwrap().r#type == "directional" {
        return Some(Arc::new(RwLock::new(create_directional_light(Some(
            &DirectionalLightOptions {
                color: Some(color),
                direction: Some(create_vector3(0.0, 0.0, -1.0)),
                intensity: Some(intensity),
                ..Default::default()
            },
        )))));
    }
    let range = source.read().unwrap().range.unwrap_or(-1.0);
    if range != -1.0 && !(range > 0.0) {
        tally_light_drop(
            light_drops,
            ImportDiagnosticSeverity::Drop,
            "gltf.light-non-positive-range",
            &[("firstLight", ImportDiagnosticDetailValue::Number(index))],
        );
        return None;
    }
    if source.read().unwrap().r#type == "point" {
        let mut descriptor = create_point_light();
        descriptor.color = color;
        descriptor.intensity = intensity;
        descriptor.range = range;
        return Some(Arc::new(RwLock::new(descriptor)));
    }
    if source.read().unwrap().r#type == "spot" {
        let spot = source.read().unwrap().spot.clone();
        let inner = spot
            .as_ref()
            .and_then(|spot| spot.read().unwrap().inner_cone_angle)
            .unwrap_or(0.0);
        let outer = spot
            .as_ref()
            .and_then(|spot| spot.read().unwrap().outer_cone_angle)
            .unwrap_or(std::f32::consts::PI / 4.0);
        if !(inner >= 0.0) || !(outer > inner) || outer > std::f32::consts::PI / 2.0 {
            tally_light_drop(
                light_drops,
                ImportDiagnosticSeverity::Drop,
                "gltf.light-invalid-spot-cone",
                &[("firstLight", ImportDiagnosticDetailValue::Number(index))],
            );
            return None;
        }
        return Some(Arc::new(RwLock::new(create_spot_light(Some(
            &SpotLightOptions {
                color: Some(color),
                direction: Some(create_vector3(0.0, 0.0, -1.0)),
                inner_cone_degrees: Some(inner * 180.0 / std::f32::consts::PI),
                intensity: Some(intensity),
                outer_cone_degrees: Some(outer * 180.0 / std::f32::consts::PI),
                range: Some(range),
                ..Default::default()
            },
        )))));
    }
    tally_light_drop(
        light_drops,
        ImportDiagnosticSeverity::Skip,
        "gltf.light-unsupported-type",
        &[
            ("firstLight", ImportDiagnosticDetailValue::Number(index)),
            (
                "firstType",
                ImportDiagnosticDetailValue::String(source.read().unwrap().r#type.clone()),
            ),
        ],
    );
    return None;
}

fn tally_light_drop(
    tallies: &mut Option<Vec<LightDropTally>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    entries: &[(&str, ImportDiagnosticDetailValue)],
) {
    let Some(tallies) = tallies else {
        return;
    };
    if let Some(existing) = tallies.iter_mut().find(|tally| tally.kind == kind) {
        existing.count += 1;
    } else {
        tallies.push(LightDropTally {
            count: 1,
            entries: entries
                .iter()
                .map(|(key, value)| (key.to_string(), value.clone()))
                .collect(),
            kind: kind.to_string(),
            severity,
        });
    }
}
