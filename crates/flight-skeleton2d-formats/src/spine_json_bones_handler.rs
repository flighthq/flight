use std::collections::HashMap;
use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Bone2D, TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION, TRANSFORM_MODE_2D_NO_SCALE,
    TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION, TRANSFORM_MODE_2D_NORMAL,
    TRANSFORM_MODE_2D_ONLY_TRANSLATION, TransformInherit2D,
};
use serde_json::Value;

use crate::spine_parse_helpers::number_or;
use crate::types::{SpineJsonSectionContext, SpineJsonSectionHandler};

pub fn spine_json_bones_section_handler(context: &mut SpineJsonSectionContext<'_>) {
    let Some(raw) = context.doc.get("bones").and_then(Value::as_array) else {
        return;
    };
    for entry in raw {
        let Some(bone) = entry.as_object() else {
            let mut detail = HashMap::new();
            detail.insert(
                "bones".to_string(),
                ImportDiagnosticDetailValue::Number(1.0),
            );
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "spine.malformed-bone-recovered",
                "parseSpineSkeleton",
                Some(detail),
            );
            context.bones.push(Bone2D::default());
            continue;
        };
        let name = bone.get("name").and_then(Value::as_str).map(str::to_string);
        let parent_index = bone
            .get("parent")
            .and_then(Value::as_str)
            .and_then(|parent| {
                context
                    .bones
                    .iter()
                    .rposition(|existing| existing.name.as_deref() == Some(parent))
            })
            .map(|index| index as i32)
            .unwrap_or(-1);
        context.bones.push(Bone2D {
            length: number_or(bone.get("length"), 0.0),
            name,
            parent_index,
            rotation: number_or(bone.get("rotation"), 0.0),
            scale_x: number_or(bone.get("scaleX"), 1.0),
            scale_y: number_or(bone.get("scaleY"), 1.0),
            shear_x: number_or(bone.get("shearX"), 0.0),
            shear_y: number_or(bone.get("shearY"), 0.0),
            transform_mode: spine_transform_mode(bone.get("transform").and_then(Value::as_str)),
            x: number_or(bone.get("x"), 0.0),
            y: number_or(bone.get("y"), 0.0),
        });
    }
}

pub fn spine_json_bones_section_reader() -> SpineJsonSectionHandler {
    return Arc::new(spine_json_bones_section_handler);
}

fn spine_transform_mode(value: Option<&str>) -> TransformInherit2D {
    return match value {
        Some("onlyTranslation") => TRANSFORM_MODE_2D_ONLY_TRANSLATION,
        Some("noRotationOrReflection") => TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION,
        Some("noScale") => TRANSFORM_MODE_2D_NO_SCALE,
        Some("noScaleOrReflection") => TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION,
        _ => TRANSFORM_MODE_2D_NORMAL,
    };
}
