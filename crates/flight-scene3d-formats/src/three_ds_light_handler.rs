use crate::shared::convert_positions_z_up_to_y_up;
use crate::three_ds_parse::{
    pack_three_ds_color, parse_color_chunk, read_chunk_end, tally_three_ds_drop,
};
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16};
use crate::three_ds_schema::*;
use crate::three_ds_types::{ThreeDsChunkHandler, ThreeDsDropTallyEntry};
use flight_entity::{Ref, Uint8Array};
use flight_geometry::{
    Vector3, clone_vector3, create_transform3d, create_vector3, normalize_vector3,
    set_quaternion_from_unit_vectors, subtract_vector3,
};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_lighting::{LightRef, SpotLightOptions, create_point_light, create_spot_light};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentLight};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static THREE_DS_LIGHT_HANDLER: LazyLock<Ref<ThreeDsChunkHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ThreeDsChunkHandler {
        chunk_ids: vec![THREE_DS_LIGHT],
        collect: Arc::new(|state, view, offset, end, name| {
            if let Some(light) = parse_three_ds_light(view, offset, end, name, state.drops.as_mut())
            {
                state.lights.push(light);
            }
        }),
        build: Some(Arc::new(|state| {
            for light in &state.lights {
                append_three_ds_light_document(state.document, light, state.drops.as_mut());
            }
        })),
    }))
});
pub static THREE_DS_LIGHT_FAMILY: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| vec![THREE_DS_LIGHT_HANDLER.clone()]);

fn append_three_ds_light_document(
    document: &mut Scene3DDocument,
    light: &ThreeDsLight,
    mut drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) {
    let position = convert_three_ds_point_z_up_to_y_up(&light.position);
    let mut transform = create_transform3d();
    transform.position.x = position.x;
    transform.position.y = position.y;
    transform.position.z = position.z;
    let color = pack_three_ds_color(&light.color, None);
    let range = light.outer_range.unwrap_or(-1.0);
    if light.inner_range.is_some() {
        tally_three_ds_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "3ds.light-inner-range-dropped",
            "",
            HashMap::from([(
                "firstName".to_string(),
                ImportDiagnosticDetailValue::String(light.name.clone()),
            )]),
        );
    }
    let intensity = if light.enabled { light.multiplier } else { 0.0 };
    if !light.enabled {
        tally_three_ds_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "3ds.light-disabled",
            "",
            HashMap::from([(
                "firstName".to_string(),
                ImportDiagnosticDetailValue::String(light.name.clone()),
            )]),
        );
    }
    let descriptor: LightRef = if let Some(target) = &light.target {
        let mut aim = convert_three_ds_point_z_up_to_y_up(target);
        let source = clone_vector3(&aim);
        subtract_vector3(&mut aim, &source, &position);
        let source = clone_vector3(&aim);
        if normalize_vector3(&mut aim, &source) > 0.0 {
            set_quaternion_from_unit_vectors(
                &mut transform.rotation,
                &create_vector3(0.0, 0.0, -1.0),
                &aim,
            );
        }
        Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
            color: Some(color),
            direction: Some(create_vector3(0.0, 0.0, -1.0)),
            inner_cone_degrees: Some(light.hotspot / 2.0),
            intensity: Some(intensity),
            outer_cone_degrees: Some(light.falloff / 2.0),
            range: Some(range),
            ..Default::default()
        }))))
    } else {
        let mut descriptor = create_point_light();
        descriptor.color = color;
        descriptor.intensity = intensity;
        descriptor.range = range;
        Arc::new(RwLock::new(descriptor))
    };
    document.lights.push(Scene3DDocumentLight {
        descriptor,
        name: if light.name.is_empty() {
            None
        } else {
            Some(light.name.clone())
        },
        node: None,
        transform,
    });
}

fn convert_three_ds_point_z_up_to_y_up(point: &[f32; 3]) -> Vector3 {
    let mut values = *point;
    convert_positions_z_up_to_y_up(&mut values, None, None);
    return create_vector3(values[0], values[1], values[2]);
}

pub fn parse_three_ds_light(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    name: &str,
    mut three_ds_drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<ThreeDsLight> {
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    if cursor + 12 > end {
        tally_three_ds_drop(
            three_ds_drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.light-truncated",
            "",
            HashMap::from([(
                "firstName".to_string(),
                ImportDiagnosticDetailValue::String(name.to_string()),
            )]),
        );
        return None;
    }
    let mut light = ThreeDsLight {
        color: [1.0; 3],
        enabled: true,
        falloff: 0.0,
        hotspot: 0.0,
        inner_range: None,
        multiplier: 1.0,
        name: name.to_string(),
        outer_range: None,
        position: [
            read_three_ds_f32(view, cursor),
            read_three_ds_f32(view, cursor + 4),
            read_three_ds_f32(view, cursor + 8),
        ],
        target: None,
    };
    cursor += 12;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            tally_three_ds_drop(
                three_ds_drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.subchunk-exceeds-light",
                "",
                HashMap::from([(
                    "firstName".to_string(),
                    ImportDiagnosticDetailValue::String(name.to_string()),
                )]),
            );
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        match chunk_id {
            THREE_DS_COLOR_FLOAT | THREE_DS_COLOR_BYTE => {
                if let Some(color) = parse_color_chunk(view, cursor, chunk_end) {
                    light.color = color;
                }
            }
            THREE_DS_LIGHT_OFF => light.enabled = false,
            THREE_DS_LIGHT_MULTIPLIER => {
                if data_start + 4 <= chunk_end {
                    light.multiplier = read_three_ds_f32(view, data_start);
                }
            }
            THREE_DS_LIGHT_INNER_RANGE => {
                if data_start + 4 <= chunk_end {
                    light.inner_range = Some(read_three_ds_f32(view, data_start));
                }
            }
            THREE_DS_LIGHT_OUTER_RANGE => {
                if data_start + 4 <= chunk_end {
                    light.outer_range = Some(read_three_ds_f32(view, data_start));
                }
            }
            THREE_DS_LIGHT_SPOT => {
                if data_start + 20 <= chunk_end {
                    light.target = Some([
                        read_three_ds_f32(view, data_start),
                        read_three_ds_f32(view, data_start + 4),
                        read_three_ds_f32(view, data_start + 8),
                    ]);
                    light.hotspot = read_three_ds_f32(view, data_start + 12);
                    light.falloff = read_three_ds_f32(view, data_start + 16);
                } else {
                    tally_three_ds_drop(
                        three_ds_drops.as_deref_mut(),
                        ImportDiagnosticSeverity::Recover,
                        "3ds.light-spot-truncated",
                        "",
                        HashMap::from([(
                            "firstName".to_string(),
                            ImportDiagnosticDetailValue::String(name.to_string()),
                        )]),
                    );
                }
            }
            _ => {}
        }
        cursor = chunk_end;
    }
    return Some(light);
}
