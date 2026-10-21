use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::{Bone2D, TransformInherit2D};
use serde_json::Value;

use crate::dragon_bones_parse_helpers::{number_or, parse_dragon_bones_bone_transform};
use crate::types::DragonBonesSectionContext;

fn bool_or(value: Option<&Value>, fallback: bool) -> bool {
    return value.and_then(Value::as_bool).unwrap_or(fallback);
}

pub fn dragon_bones_bones_section_handler(context: &mut DragonBonesSectionContext<'_>) {
    let raw = context.armature.get("bone").and_then(Value::as_array);
    let Some(raw) = raw else {
        return;
    };
    context.raw_index_to_output = vec![-1; raw.len()];
    let mut pending = Vec::new();
    for (raw_index, entry) in raw.iter().enumerate() {
        let Some(source) = entry.as_object() else {
            continue;
        };
        let transform = parse_dragon_bones_bone_transform(source.get("transform"));
        pending.push((
            Bone2D {
                length: number_or(source.get("length"), 0.0),
                name: source
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                parent_index: -1,
                rotation: transform.rotation,
                scale_x: transform.scale_x,
                scale_y: transform.scale_y,
                shear_x: 0.0,
                shear_y: transform.shear_y,
                transform_mode: TransformInherit2D {
                    reflection: bool_or(source.get("inheritReflection"), true),
                    rotation: bool_or(source.get("inheritRotation"), true),
                    scale: bool_or(source.get("inheritScale"), true),
                    translation: bool_or(source.get("inheritTranslation"), true),
                },
                x: transform.x,
                y: transform.y,
            },
            source
                .get("parent")
                .and_then(Value::as_str)
                .map(str::to_string),
            raw_index,
        ));
    }
    let mut by_name: HashMap<String, usize> = HashMap::new();
    let mut advanced = true;
    while !pending.is_empty() && advanced {
        advanced = false;
        let mut index = 0;
        while index < pending.len() {
            let ready = pending[index]
                .1
                .as_ref()
                .is_none_or(|parent| by_name.contains_key(parent));
            if !ready {
                index += 1;
                continue;
            }
            let (mut bone, parent, raw_index) = pending.remove(index);
            bone.parent_index = parent
                .as_ref()
                .and_then(|name| by_name.get(name))
                .map(|index| *index as i32)
                .unwrap_or(-1);
            if let Some(name) = bone.name.as_ref() {
                by_name.insert(name.clone(), context.bones.len());
            }
            context.raw_index_to_output[raw_index] = context.bones.len() as i32;
            context.bones.push(bone);
            advanced = true;
        }
    }
    if !pending.is_empty() {
        let mut detail = HashMap::new();
        detail.insert(
            "count".to_string(),
            ImportDiagnosticDetailValue::Number(pending.len() as f32),
        );
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "dragonbones.unresolved-bone-parent",
            "parseDragonBonesSkeleton",
            Some(detail),
        );
        for (bone, _, raw_index) in pending {
            if let Some(name) = bone.name.as_ref() {
                by_name.insert(name.clone(), context.bones.len());
            }
            context.raw_index_to_output[raw_index] = context.bones.len() as i32;
            context.bones.push(bone);
        }
    }
    context.bone_index_by_name = by_name;
}
