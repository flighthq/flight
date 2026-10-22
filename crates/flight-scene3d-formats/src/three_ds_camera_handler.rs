use crate::shared::convert_positions_z_up_to_y_up;
use crate::three_ds_parse::{read_chunk_end, tally_three_ds_drop};
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16};
use crate::three_ds_schema::*;
use crate::three_ds_types::{ThreeDsChunkHandler, ThreeDsDropTallyEntry};
use flight_camera::{Projection, create_perspective_projection};
use flight_entity::{Ref, Uint8Array};
use flight_geometry::{
    Vector3, clone_quaternion, clone_vector3, create_quaternion, create_transform3d,
    create_vector3, multiply_quaternion, normalize_vector3, set_quaternion_from_axis_angle,
    set_quaternion_from_unit_vectors, subtract_vector3,
};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_math::DEG_TO_RAD;
use flight_scene3d::{Scene3DDocument, Scene3DDocumentCamera};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static THREE_DS_CAMERA_HANDLER: LazyLock<Ref<ThreeDsChunkHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ThreeDsChunkHandler {
        chunk_ids: vec![THREE_DS_CAMERA],
        collect: Arc::new(|state, view, offset, end, name| {
            if let Some(camera) =
                parse_three_ds_camera(view, offset, end, name, state.drops.as_mut())
            {
                state.cameras.push(camera);
            }
        }),
        build: Some(Arc::new(|state| {
            for camera in &state.cameras {
                append_three_ds_camera_document(state.document, camera);
            }
        })),
    }))
});
pub static THREE_DS_CAMERA_FAMILY: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| vec![THREE_DS_CAMERA_HANDLER.clone()]);

fn append_three_ds_camera_document(document: &mut Scene3DDocument, camera: &ThreeDsCamera) {
    let position = convert_three_ds_point_z_up_to_y_up(&camera.position);
    let mut transform = create_transform3d();
    transform.position.x = position.x;
    transform.position.y = position.y;
    transform.position.z = position.z;
    let mut aim = convert_three_ds_point_z_up_to_y_up(&camera.target);
    let source = clone_vector3(&aim);
    subtract_vector3(&mut aim, &source, &position);
    let source = clone_vector3(&aim);
    if normalize_vector3(&mut aim, &source) > 0.0 {
        set_quaternion_from_unit_vectors(
            &mut transform.rotation,
            &create_vector3(0.0, 0.0, -1.0),
            &aim,
        );
        if camera.roll != 0.0 {
            let mut roll = create_quaternion(0.0, 0.0, 0.0, 1.0);
            set_quaternion_from_axis_angle(&mut roll, &aim, camera.roll * DEG_TO_RAD);
            let rotation = clone_quaternion(&transform.rotation);
            multiply_quaternion(&mut transform.rotation, &roll, &rotation);
        }
    }
    let focal_length = if camera.focal_length > 0.0 {
        camera.focal_length
    } else {
        50.0
    };
    document.cameras.push(Scene3DDocumentCamera {
        far: camera.far.unwrap_or(1000.0),
        near: camera.near.unwrap_or(1.0),
        name: if camera.name.is_empty() {
            None
        } else {
            Some(camera.name.clone())
        },
        node: None,
        projection: {
            let projection = create_perspective_projection();
            projection.write().unwrap().fov_y =
                2.0 * (THREE_DS_CAMERA_APERTURE_MM / (2.0 * focal_length)).atan();
            Projection::Perspective(projection)
        },
        transform,
    });
}

fn convert_three_ds_point_z_up_to_y_up(point: &[f32; 3]) -> Vector3 {
    let mut values = *point;
    convert_positions_z_up_to_y_up(&mut values, None, None);
    return create_vector3(values[0], values[1], values[2]);
}

pub fn parse_three_ds_camera(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    name: &str,
    mut three_ds_drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<ThreeDsCamera> {
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    if cursor + 32 > end {
        tally_three_ds_drop(
            three_ds_drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.camera-truncated",
            "",
            HashMap::from([(
                "firstName".to_string(),
                ImportDiagnosticDetailValue::String(name.to_string()),
            )]),
        );
        return None;
    }
    let position = [
        read_three_ds_f32(view, cursor),
        read_three_ds_f32(view, cursor + 4),
        read_three_ds_f32(view, cursor + 8),
    ];
    let target = [
        read_three_ds_f32(view, cursor + 12),
        read_three_ds_f32(view, cursor + 16),
        read_three_ds_f32(view, cursor + 20),
    ];
    let roll = read_three_ds_f32(view, cursor + 24);
    let focal_length = read_three_ds_f32(view, cursor + 28);
    cursor += 32;
    let (mut near, mut far) = (None, None);
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            tally_three_ds_drop(
                three_ds_drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.subchunk-exceeds-camera",
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
        if chunk_id == THREE_DS_CAMERA_RANGES && data_start + 8 <= chunk_end {
            near = Some(read_three_ds_f32(view, data_start));
            far = Some(read_three_ds_f32(view, data_start + 4));
        }
        cursor = chunk_end;
    }
    return Some(ThreeDsCamera {
        far,
        focal_length,
        name: name.to_string(),
        near,
        position,
        roll,
        target,
    });
}
