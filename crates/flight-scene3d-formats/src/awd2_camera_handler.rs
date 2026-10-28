use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    awd_transform_to_transform3d, read_awd_properties, read_awd_property_float32, read_awd_string,
    read_awd_transform,
};
use crate::awd2_schema::*;
use crate::awd2_types::{Awd2BlockHandler, Awd2CameraEntry, Awd2ParsedCamera};
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_camera::{Projection, create_orthographic_projection, create_perspective_projection};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_math::DEG_TO_RAD;
use flight_scene3d::{Scene3DDocument, Scene3DDocumentCamera};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static AWD2_CAMERA_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_CAMERA],
        build_phase: Some(AWD2_BUILD_PHASE_CAMERA as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            let camera = if Arc::ptr_eq(&block.source, &block.view) {
                let bytes = block.view.read().unwrap();
                parse_camera_block(
                    &bytes,
                    &bytes,
                    block.data_start,
                    block.data_end,
                    block.matrix_wide,
                    state.diagnostics.as_ref(),
                )
            } else {
                let view = block.view.read().unwrap();
                let source = block.source.read().unwrap();
                parse_camera_block(
                    &view,
                    &source,
                    block.data_start,
                    block.data_end,
                    block.matrix_wide,
                    state.diagnostics.as_ref(),
                )
            };
            if let Some(camera) = camera {
                if let Some(entry) = state
                    .cameras
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = camera;
                } else {
                    state.cameras.push(Awd2CameraEntry {
                        key: block.block_id,
                        value: camera,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            let mut document = state.document.write().unwrap();
            for entry in &state.cameras {
                let node_index = state
                    .node_index_for_block
                    .iter()
                    .find(|row| row.key == entry.value.parent_id)
                    .map(|row| row.value);
                build_awd_document_camera(
                    &mut document,
                    &entry.value,
                    node_index,
                    state.diagnostics.as_ref(),
                );
            }
        })),
    }))
});

fn build_awd_document_camera(
    document: &mut Scene3DDocument,
    camera: &Awd2ParsedCamera,
    node_index: Option<i32>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) {
    let projection = match camera.projection_type {
        AWD2_CAMERA_PROJECTION_PERSPECTIVE => {
            let projection = create_perspective_projection();
            projection.write().unwrap().fov_y = camera.fov * DEG_TO_RAD;
            Projection::Perspective(projection)
        }
        AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC => {
            let projection = create_orthographic_projection();
            {
                let mut fields = projection.write().unwrap();
                fields.half_height = 0.5;
                fields.half_width = 0.5;
            }
            Projection::Orthographic(projection)
        }
        AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER => {
            let projection = create_orthographic_projection();
            {
                let mut fields = projection.write().unwrap();
                fields.half_height = (camera.top - camera.bottom).abs() / 2.0;
                fields.half_width = (camera.right - camera.left).abs() / 2.0;
            }
            if camera.right + camera.left != 0.0 || camera.top + camera.bottom != 0.0 {
                report_awd_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Skip,
                    "awd2.camera-offcenter-dropped",
                    "parseAwd2",
                    Some(HashMap::from([(
                        "name".to_string(),
                        ImportDiagnosticDetailValue::String(camera.name.clone()),
                    )])),
                );
            }
            Projection::Orthographic(projection)
        }
        _ => {
            report_awd_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Skip,
                "awd2.camera-unsupported-projection",
                "parseAwd2",
                Some(HashMap::from([
                    (
                        "name".to_string(),
                        ImportDiagnosticDetailValue::String(camera.name.clone()),
                    ),
                    (
                        "projectionType".to_string(),
                        ImportDiagnosticDetailValue::Number(camera.projection_type as f32),
                    ),
                ])),
            );
            return;
        }
    };
    document.cameras.push(Scene3DDocumentCamera {
        far: 3000.0,
        near: 20.0,
        name: if camera.name.is_empty() {
            None
        } else {
            Some(camera.name.clone())
        },
        node: node_index,
        projection,
        transform: {
            let mut output = flight_geometry::contract::create_transform3d();
            awd_transform_to_transform3d(&mut output, &camera.transform);
            output
        },
    });
}

fn camera_truncated(diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>, field: &str) {
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "awd2.camera-truncated",
        "parseCameraBlock",
        Some(HashMap::from([(
            "field".to_string(),
            ImportDiagnosticDetailValue::String(field.to_string()),
        )])),
    );
}

fn parse_camera_block(
    view: &Uint8Array,
    source: &Uint8Array,
    start: usize,
    end: usize,
    matrix_wide: bool,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedCamera> {
    let mut offset = start;
    if offset + 4 > end {
        camera_truncated(diagnostics, "parentId");
        return None;
    }
    let parent_id = read_three_ds_u32(view, offset);
    offset += 4;
    let float_size = if matrix_wide { 8 } else { 4 };
    if offset + 12 * float_size > end {
        camera_truncated(diagnostics, "transform");
        return None;
    }
    let transform_result = read_awd_transform(view, offset, matrix_wide);
    offset = transform_result.end;
    if offset + 2 > end || offset + 2 + read_three_ds_u16(view, offset) as usize > end {
        camera_truncated(diagnostics, "name");
        return None;
    }
    let name_result = read_awd_string(view, source, offset);
    offset = name_result.end;
    if offset + 5 > end {
        camera_truncated(diagnostics, "projectionType");
        return None;
    }
    offset += 3;
    let projection_type = read_three_ds_u16(view, offset) as i16;
    offset += 2;
    let props = read_awd_properties(view, offset, end);
    return Some(Awd2ParsedCamera {
        bottom: read_awd_property_float32(view, &props.values, AWD2_CAMERA_PROP_ORTHO_BOTTOM)
            .unwrap_or(-300.0),
        fov: read_awd_property_float32(view, &props.values, AWD2_CAMERA_PROP_FOV).unwrap_or(60.0),
        left: read_awd_property_float32(view, &props.values, AWD2_CAMERA_PROP_ORTHO_LEFT)
            .unwrap_or(-400.0),
        name: name_result.value,
        parent_id,
        projection_type,
        right: read_awd_property_float32(view, &props.values, AWD2_CAMERA_PROP_ORTHO_RIGHT)
            .unwrap_or(400.0),
        top: read_awd_property_float32(view, &props.values, AWD2_CAMERA_PROP_ORTHO_TOP)
            .unwrap_or(300.0),
        transform: transform_result.transform,
    });
}
