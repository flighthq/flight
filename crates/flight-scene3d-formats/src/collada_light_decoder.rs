use crate::collada_parse::report_collada_diagnostic;
use crate::collada_scene_shared::build_collada_node_world_matrices;
use crate::collada_types::*;
use crate::collada_xml::{collada_child, collada_children, collada_id_of, collada_local_name};
use crate::obj_features::is_obj_whitespace;
use crate::stl_features::parse_stl_number;
use flight_color::{allocate_linear_color, pack_linear_to_color};
use flight_entity::Ref;
use flight_geometry::contract::{
    create_transform3d, create_vector3, decompose_matrix4_to_transform3d,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_lighting::{
    DirectionalLightOptions, LightRef, SpotLightOptions, create_ambient_light,
    create_directional_light, create_point_light, create_spot_light,
};
use flight_scene3d::Scene3DDocumentLight;
use flight_xml::XmlElement;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static COLLADA_LIGHT_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: Some(Arc::new(resolve_lights)),
        build_phase: Some(20.0),
        decode: Arc::new(decode_lights),
        elements: vec!["light".to_string()],
        features: vec![
            "Light",
            "Light.Ambient",
            "Light.Directional",
            "Light.Point",
            "Light.Spot",
        ]
        .into_iter()
        .map(str::to_string)
        .collect(),
    }))
});

fn create_collada_light(definition: &ColladaLightDefinition) -> LightRef {
    match definition.kind {
        ColladaLightKind::Ambient => {
            let mut descriptor = create_ambient_light();
            descriptor.color = definition.color;
            descriptor.intensity = definition.intensity;
            return Arc::new(RwLock::new(descriptor));
        }
        ColladaLightKind::Directional => {
            return Arc::new(RwLock::new(create_directional_light(Some(
                &DirectionalLightOptions {
                    color: Some(definition.color),
                    intensity: Some(definition.intensity),
                    direction: Some(create_vector3(0.0, 0.0, -1.0)),
                    ..Default::default()
                },
            ))));
        }
        ColladaLightKind::Point => {
            let mut descriptor = create_point_light();
            descriptor.color = definition.color;
            descriptor.decay = definition.decay;
            descriptor.intensity = definition.intensity;
            descriptor.range = -1.0;
            return Arc::new(RwLock::new(descriptor));
        }
        ColladaLightKind::Spot => {
            return Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
                color: Some(definition.color),
                intensity: Some(definition.intensity),
                decay: Some(definition.decay),
                direction: Some(create_vector3(0.0, 0.0, -1.0)),
                inner_cone_degrees: Some(definition.inner_cone_degrees),
                outer_cone_degrees: Some(definition.outer_cone_degrees),
                range: Some(-1.0),
                spot_blend: Some(definition.spot_blend),
                ..Default::default()
            }))));
        }
    }
}

fn decode_lights(context: &Ref<ColladaParseContext>) {
    let (root, diagnostics, definitions) = {
        let context = context.read().unwrap();
        (
            context.root.clone(),
            context.diagnostics.clone(),
            context.light_definitions.clone(),
        )
    };
    let mut elements = Vec::new();
    collada_children(
        &mut elements,
        collada_child(Some(&root), "library_lights").as_ref(),
        "light",
    );
    for element in elements {
        let Some(id) = collada_id_of(&element).filter(|id| !id.is_empty()) else {
            malformed_light(&diagnostics, "(missing)", "id");
            continue;
        };
        let value =
            parse_light(&element, &id, &diagnostics).map(|value| Arc::new(RwLock::new(value)));
        let mut definitions = definitions.write().unwrap();
        if let Some(entry) = definitions.iter_mut().find(|entry| entry.key == id) {
            entry.value = value;
        } else {
            definitions.push(ColladaLightEntry { key: id, value });
        }
    }
}

// flight-lint: allow(f64) existing strict Number finite classifier before canonical f32 writes; unlike permissive XML float lists, one invalid token rejects the whole light field
fn finite_light_numbers(element: Option<&Ref<XmlElement>>) -> Option<Vec<f32>> {
    let element = element?.read().unwrap();
    let tokens = element
        .text
        .trim_matches(is_obj_whitespace)
        .split(is_obj_whitespace)
        .filter(|token| !token.is_empty());
    let mut values = Vec::new();
    for token in tokens {
        let value = parse_stl_number(token);
        if !value.is_finite() {
            return None;
        }
        values.push(value as f32);
    }
    return (!values.is_empty()).then_some(values);
}

fn light_scalar(
    parent: &Ref<XmlElement>,
    name: &str,
    fallback: f32,
    id: &str,
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
) -> Option<f32> {
    let Some(element) = collada_child(Some(parent), name) else {
        return Some(fallback);
    };
    if let Some(values) = finite_light_numbers(Some(&element)) {
        if values.len() == 1 && !(values[0] < 0.0) {
            return Some(values[0]);
        }
    }
    malformed_light(diagnostics, id, name);
    return None;
}

fn malformed_light(diagnostics: &Ref<Vec<ImportDiagnostic>>, id: &str, field: &str) {
    report_collada_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "collada.light-malformed",
        "parseColladaLightDefinition",
        Some(HashMap::from([
            (
                "field".to_string(),
                ImportDiagnosticDetailValue::String(field.to_string()),
            ),
            (
                "light".to_string(),
                ImportDiagnosticDetailValue::String(id.to_string()),
            ),
        ])),
    );
}

fn missing_light(diagnostics: &Ref<Vec<ImportDiagnostic>>, url: &str) {
    report_collada_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Recover,
        "collada.missing-reference",
        "resolveColladaLights",
        Some(HashMap::from([
            (
                "element".to_string(),
                ImportDiagnosticDetailValue::String("instance_light".to_string()),
            ),
            (
                "url".to_string(),
                ImportDiagnosticDetailValue::String(url.to_string()),
            ),
        ])),
    );
}

fn parse_light(
    element: &Ref<XmlElement>,
    id: &str,
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
) -> Option<ColladaLightDefinition> {
    let Some(technique_common) = collada_child(Some(element), "technique_common") else {
        malformed_light(diagnostics, id, "technique_common");
        return None;
    };
    let techniques = technique_common
        .read()
        .unwrap()
        .children
        .iter()
        .filter(|entry| {
            matches!(
                collada_local_name(entry).as_str(),
                "ambient" | "directional" | "point" | "spot"
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    if techniques.len() != 1 {
        malformed_light(diagnostics, id, "type");
        return None;
    }
    let technique = &techniques[0];
    let kind = match collada_local_name(technique).as_str() {
        "ambient" => ColladaLightKind::Ambient,
        "directional" => ColladaLightKind::Directional,
        "point" => ColladaLightKind::Point,
        _ => ColladaLightKind::Spot,
    };
    let Some(values) = finite_light_numbers(collada_child(Some(technique), "color").as_ref())
        .filter(|values| values.len() == 3 && !values.iter().any(|value| *value < 0.0))
    else {
        malformed_light(diagnostics, id, "color");
        return None;
    };
    let intensity = 1.0f32.max(values[0]).max(values[1]).max(values[2]);
    let mut color = allocate_linear_color();
    color.r = values[0] / intensity;
    color.g = values[1] / intensity;
    color.b = values[2] / intensity;
    color.a = 1.0;
    let mut definition = ColladaLightDefinition {
        color: pack_linear_to_color(&color),
        decay: 0.0,
        inner_cone_degrees: 0.0,
        intensity,
        kind,
        name: element.read().unwrap().attributes.get("name").cloned(),
        outer_cone_degrees: 0.0,
        spot_blend: 0.0,
    };
    if matches!(kind, ColladaLightKind::Point | ColladaLightKind::Spot) {
        // Evaluate all three original reads even when one is malformed, preserving diagnostic order.
        let constant = light_scalar(technique, "constant_attenuation", 1.0, id, diagnostics);
        let linear = light_scalar(technique, "linear_attenuation", 0.0, id, diagnostics);
        let quadratic = light_scalar(technique, "quadratic_attenuation", 0.0, id, diagnostics);
        let (Some(constant), Some(linear), Some(quadratic)) = (constant, linear, quadratic) else {
            return None;
        };
        let denominator = constant + linear + quadratic;
        if !(denominator > 0.0) {
            malformed_light(diagnostics, id, "attenuation");
            return None;
        }
        definition.intensity *= 1.0 / denominator;
        definition.decay = (linear + 2.0 * quadratic) / denominator;
        if [constant, linear, quadratic]
            .iter()
            .filter(|value| **value > 0.0)
            .count()
            > 1
        {
            report_collada_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "collada.light-attenuation-approximated",
                "parseColladaLightDefinition",
                Some(HashMap::from([
                    (
                        "constant".to_string(),
                        ImportDiagnosticDetailValue::Number(constant),
                    ),
                    (
                        "light".to_string(),
                        ImportDiagnosticDetailValue::String(id.to_string()),
                    ),
                    (
                        "linear".to_string(),
                        ImportDiagnosticDetailValue::Number(linear),
                    ),
                    (
                        "quadratic".to_string(),
                        ImportDiagnosticDetailValue::Number(quadratic),
                    ),
                ])),
            );
        }
    }
    if kind == ColladaLightKind::Spot {
        let angle = light_scalar(technique, "falloff_angle", 180.0, id, diagnostics);
        let exponent = light_scalar(technique, "falloff_exponent", 0.0, id, diagnostics);
        let (Some(angle), Some(exponent)) = (angle, exponent) else {
            return None;
        };
        if angle > 180.0 {
            malformed_light(diagnostics, id, "falloff_angle");
            return None;
        }
        definition.outer_cone_degrees = angle / 2.0;
        definition.spot_blend = exponent / (exponent + 1.0);
    }
    return Some(definition);
}

fn resolve_lights(context: &Ref<ColladaBuildContext>) {
    let context = context.read().unwrap();
    let (document, definitions, diagnostics) = {
        let parse = context.parse.read().unwrap();
        (
            parse.document.clone(),
            parse.light_definitions.clone(),
            parse.diagnostics.clone(),
        )
    };
    let mut document = document.write().unwrap();
    let mut matrices = Vec::new();
    build_collada_node_world_matrices(&mut matrices, &document.nodes, &context.root_node_indices);
    let definitions = definitions.read().unwrap();
    for binding in &context.deferred_lights {
        let Some(id) = binding.url.strip_prefix('#').filter(|id| !id.is_empty()) else {
            missing_light(&diagnostics, &binding.url);
            continue;
        };
        let Some(entry) = definitions.iter().find(|entry| entry.key == id) else {
            missing_light(&diagnostics, &binding.url);
            continue;
        };
        let Some(definition) = &entry.value else {
            continue;
        };
        let Some(Some(matrix)) = usize::try_from(binding.node_index)
            .ok()
            .and_then(|index| matrices.get(index))
        else {
            continue;
        };
        let mut transform = create_transform3d();
        decompose_matrix4_to_transform3d(&mut transform, &matrix.read().unwrap());
        let definition = definition.read().unwrap();
        document.lights.push(Scene3DDocumentLight {
            descriptor: create_collada_light(&definition),
            name: definition.name.clone(),
            node: Some(binding.node_index),
            transform,
        });
    }
}
