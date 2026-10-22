use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    awd_transform_to_transform3d, read_awd_properties, read_awd_property_number,
    read_awd_property_uint8, read_awd_property_uint32, read_awd_string, read_awd_transform,
};
use crate::awd2_schema::*;
use crate::awd2_types::{
    Awd2Block, Awd2BlockHandler, Awd2LightEntry, Awd2LightPickerEntry, Awd2ParseState,
    Awd2ParsedLight, Awd2ParsedLightPicker,
};
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_entity::{Ref, Uint8Array};
use flight_geometry::{
    create_transform3d, create_vector3, normalize_vector3, set_quaternion_from_unit_vectors,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_lighting::{
    DirectionalLightOptions, LightRef, create_ambient_light, create_directional_light,
    create_point_light,
};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentLight};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct AwdLightDropTally {
    count: usize,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
    kind: String,
    origin: String,
    severity: ImportDiagnosticSeverity,
}

pub static AWD2_LIGHT_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_LIGHT],
        build_phase: Some(AWD2_BUILD_PHASE_LIGHTING as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(light) = parse_light_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .lights
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = light;
                } else {
                    state.lights.push(Awd2LightEntry {
                        key: block.block_id,
                        value: light,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            let mut drops = Vec::new();
            {
                let mut document = state.document.write().unwrap();
                for entry in &state.lights {
                    let node = state
                        .node_index_for_block
                        .iter()
                        .find(|row| row.key == entry.value.parent_id)
                        .map(|row| row.value);
                    build_awd_document_lights(&mut document, &entry.value, node, &mut drops);
                }
            }
            flush_awd_light_drops(&drops, state.diagnostics.as_ref());
        })),
    }))
});

pub static AWD2_LIGHT_PICKER_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_LIGHT_PICKER],
        build_phase: Some(AWD2_BUILD_PHASE_LIGHTING as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(picker) = parse_light_picker_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .light_pickers
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = picker;
                } else {
                    state.light_pickers.push(Awd2LightPickerEntry {
                        key: block.block_id,
                        value: picker,
                    });
                }
            }
        }),
        build: Some(Arc::new(report_awd_light_picker_scope)),
    }))
});

fn build_awd_document_lights(
    document: &mut Scene3DDocument,
    light: &Awd2ParsedLight,
    node: Option<i32>,
    drops: &mut Vec<AwdLightDropTally>,
) {
    let local_axis = create_vector3(0.0, 0.0, -1.0);
    let descriptor: LightRef;
    let mut transform = create_transform3d();
    if light.light_type == AWD2_LIGHT_TYPE_DIRECTIONAL {
        let source_aim = create_vector3(light.direction_x, light.direction_y, -light.direction_z);
        let mut aim = create_vector3(0.0, 0.0, 0.0);
        normalize_vector3(&mut aim, &source_aim);
        set_quaternion_from_unit_vectors(&mut transform.rotation, &local_axis, &aim);
        descriptor = Arc::new(RwLock::new(create_directional_light(Some(
            &DirectionalLightOptions {
                casts_shadow: Some(light.casts_shadow),
                color: Some(get_awd_light_rgba(light.rgb)),
                direction: Some(local_axis),
                intensity: Some(light.diffuse),
                ..Default::default()
            },
        ))));
    } else if light.light_type == AWD2_LIGHT_TYPE_POINT {
        awd_transform_to_transform3d(&mut transform, &light.transform);
        let mut point = create_point_light();
        point.casts_shadow = light.casts_shadow;
        point.color = get_awd_light_rgba(light.rgb);
        point.intensity = light.diffuse;
        point.range = light.fall_off;
        descriptor = Arc::new(RwLock::new(point));
        if light.has_radius {
            tally_awd_light_drop(
                drops,
                ImportDiagnosticSeverity::Skip,
                "awd2.light-radius-dropped",
                "buildAwdDocumentLights",
                HashMap::from([(
                    "firstLight".to_string(),
                    ImportDiagnosticDetailValue::String(light.name.clone()),
                )]),
            );
        }
    } else {
        tally_awd_light_drop(
            drops,
            ImportDiagnosticSeverity::Skip,
            "awd2.light-unsupported-type",
            "buildAwdDocumentLights",
            HashMap::from([
                (
                    "firstLight".to_string(),
                    ImportDiagnosticDetailValue::String(light.name.clone()),
                ),
                (
                    "firstType".to_string(),
                    ImportDiagnosticDetailValue::Number(light.light_type as f32),
                ),
            ]),
        );
        return;
    }
    if light.specular != AWD2_LIGHT_DEFAULT_SPECULAR {
        tally_awd_light_drop(
            drops,
            ImportDiagnosticSeverity::Skip,
            "awd2.light-specular-dropped",
            "buildAwdDocumentLights",
            HashMap::from([
                (
                    "firstLight".to_string(),
                    ImportDiagnosticDetailValue::String(light.name.clone()),
                ),
                (
                    "firstSpecular".to_string(),
                    ImportDiagnosticDetailValue::Number(light.specular),
                ),
            ]),
        );
    }
    document.lights.push(Scene3DDocumentLight {
        descriptor,
        name: (!light.name.is_empty()).then(|| light.name.clone()),
        node,
        transform,
    });
    if light.ambient != 0.0 {
        let mut ambient = create_ambient_light();
        ambient.color = get_awd_light_rgba(light.ambient_rgb);
        ambient.intensity = light.ambient;
        document.lights.push(Scene3DDocumentLight {
            descriptor: Arc::new(RwLock::new(ambient)),
            name: (!light.name.is_empty()).then(|| format!("{} Ambient", light.name)),
            node,
            transform: create_transform3d(),
        });
    }
}

fn flush_awd_light_drops(
    drops: &[AwdLightDropTally],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) {
    for tally in drops {
        let mut detail = tally.detail.clone();
        detail.insert(
            "count".to_string(),
            ImportDiagnosticDetailValue::Number(tally.count as f32),
        );
        report_awd_diagnostic(
            diagnostics,
            tally.severity,
            &tally.kind,
            &tally.origin,
            Some(detail),
        );
    }
}

fn get_awd_light_rgba(rgb: u32) -> u32 {
    return (rgb << 8) | 255;
}

fn is_awd_light_scope_dropped(state: &Awd2ParseState) -> bool {
    if state.lights.is_empty() {
        return false;
    }
    for picker in &state.light_pickers {
        let mut picked = Vec::new();
        for id in &picker.value.light_ids {
            if !picked.contains(id) {
                picked.push(*id);
            }
        }
        if picked.len() != state.lights.len() {
            return true;
        }
        for light in &state.lights {
            if !picked.contains(&light.key) {
                return true;
            }
        }
    }
    return false;
}

fn light_truncated(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    picker: bool,
    field: &str,
    lights: Option<u16>,
) {
    let mut detail = HashMap::from([(
        "field".to_string(),
        ImportDiagnosticDetailValue::String(field.to_string()),
    )]);
    if let Some(lights) = lights {
        detail.insert(
            "lights".to_string(),
            ImportDiagnosticDetailValue::Number(lights as f32),
        );
    }
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        if picker {
            "awd2.light-picker-truncated"
        } else {
            "awd2.light-truncated"
        },
        if picker {
            "parseLightPickerBlock"
        } else {
            "parseLightBlock"
        },
        Some(detail),
    );
}

fn parse_light_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedLight> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let mut offset = block.data_start;
        if offset + 4 > block.data_end {
            light_truncated(diagnostics, false, "parentId", None);
            return None;
        }
        let parent_id = read_three_ds_u32(view, offset);
        offset += 4;
        let float_size = if block.matrix_wide { 8 } else { 4 };
        if offset + 12 * float_size > block.data_end {
            light_truncated(diagnostics, false, "transform", None);
            return None;
        }
        let transform = read_awd_transform(view, offset, block.matrix_wide);
        offset = transform.end;
        if offset + 2 > block.data_end
            || offset + 2 + read_three_ds_u16(view, offset) as usize > block.data_end
        {
            light_truncated(diagnostics, false, "name", None);
            return None;
        }
        let name = read_awd_string(view, source, offset);
        offset = name.end;
        if offset + 1 > block.data_end {
            light_truncated(diagnostics, false, "lightType", None);
            return None;
        }
        let light_type = source[offset];
        offset += 1;
        let props = read_awd_properties(view, offset, block.data_end);
        let values = &props.values;
        return Some(Awd2ParsedLight {
            ambient: read_awd_property_number(view, values, AWD2_LIGHT_PROP_AMBIENT)
                .unwrap_or(AWD2_LIGHT_DEFAULT_AMBIENT),
            ambient_rgb: read_awd_property_uint32(view, values, AWD2_LIGHT_PROP_AMBIENT_COLOR)
                .unwrap_or(AWD2_LIGHT_DEFAULT_RGB),
            casts_shadow: read_awd_property_uint8(view, values, AWD2_LIGHT_PROP_SHADOW_MAPPER)
                .unwrap_or(0)
                > 0,
            diffuse: read_awd_property_number(view, values, AWD2_LIGHT_PROP_DIFFUSE)
                .unwrap_or(AWD2_LIGHT_DEFAULT_DIFFUSE),
            direction_x: read_awd_property_number(view, values, AWD2_LIGHT_PROP_DIRECTION_X)
                .unwrap_or(0.0),
            direction_y: read_awd_property_number(view, values, AWD2_LIGHT_PROP_DIRECTION_Y)
                .unwrap_or(-1.0),
            direction_z: read_awd_property_number(view, values, AWD2_LIGHT_PROP_DIRECTION_Z)
                .unwrap_or(1.0),
            fall_off: read_awd_property_number(view, values, AWD2_LIGHT_PROP_FALLOFF)
                .unwrap_or(AWD2_LIGHT_DEFAULT_FALLOFF),
            has_radius: values.iter().any(|row| row.key == AWD2_LIGHT_PROP_RADIUS),
            light_type,
            name: name.value,
            parent_id,
            radius: read_awd_property_number(view, values, AWD2_LIGHT_PROP_RADIUS)
                .unwrap_or(AWD2_LIGHT_DEFAULT_RADIUS),
            rgb: read_awd_property_uint32(view, values, AWD2_LIGHT_PROP_COLOR)
                .unwrap_or(AWD2_LIGHT_DEFAULT_RGB),
            specular: read_awd_property_number(view, values, AWD2_LIGHT_PROP_SPECULAR)
                .unwrap_or(AWD2_LIGHT_DEFAULT_SPECULAR),
            transform: transform.transform,
        });
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn parse_light_picker_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedLightPicker> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let mut offset = block.data_start;
        if offset + 2 > block.data_end
            || offset + 2 + read_three_ds_u16(view, offset) as usize > block.data_end
        {
            light_truncated(diagnostics, true, "name", None);
            return None;
        }
        let name = read_awd_string(view, source, offset);
        offset = name.end;
        if offset + 2 > block.data_end {
            light_truncated(diagnostics, true, "numLights", None);
            return None;
        }
        let count = read_three_ds_u16(view, offset);
        offset += 2;
        if offset + count as usize * 4 > block.data_end {
            light_truncated(diagnostics, true, "lightIds", Some(count));
            return None;
        }
        let mut light_ids = Vec::new();
        for index in 0..count as usize {
            light_ids.push(read_three_ds_u32(view, offset + index * 4));
        }
        return Some(Awd2ParsedLightPicker {
            light_ids,
            name: name.value,
        });
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn report_awd_light_picker_scope(state: &mut Awd2ParseState) {
    for picker in &state.light_pickers {
        for light in &picker.value.light_ids {
            if state.lights.iter().any(|entry| entry.key == *light) {
                continue;
            }
            report_awd_diagnostic(
                state.diagnostics.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "awd2.light-picker-missing-light",
                "parseAwd2",
                Some(HashMap::from([
                    (
                        "block".to_string(),
                        ImportDiagnosticDetailValue::Number(picker.key as f32),
                    ),
                    (
                        "light".to_string(),
                        ImportDiagnosticDetailValue::Number(*light as f32),
                    ),
                ])),
            );
        }
    }
    if is_awd_light_scope_dropped(state) {
        report_awd_diagnostic(
            state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Skip,
            "awd2.light-scope-dropped",
            "parseAwd2",
            Some(HashMap::from([
                (
                    "lights".to_string(),
                    ImportDiagnosticDetailValue::Number(state.lights.len() as f32),
                ),
                (
                    "pickers".to_string(),
                    ImportDiagnosticDetailValue::Number(state.light_pickers.len() as f32),
                ),
            ])),
        );
    }
}

fn tally_awd_light_drop(
    drops: &mut Vec<AwdLightDropTally>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    if let Some(tally) = drops.iter_mut().find(|tally| tally.kind == kind) {
        tally.count += 1;
    } else {
        drops.push(AwdLightDropTally {
            count: 1,
            detail,
            kind: kind.to_string(),
            origin: origin.to_string(),
            severity,
        });
    }
}
