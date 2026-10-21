use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Bone2D, TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION, TRANSFORM_MODE_2D_NO_SCALE,
    TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION, TRANSFORM_MODE_2D_NORMAL,
    TRANSFORM_MODE_2D_ONLY_TRANSLATION,
};

use crate::spine_binary_parse_helpers::SPINE_BINARY_COLOR_BYTES;
use crate::spine_binary_reader::*;
use crate::types::SpineBinarySectionContext;

pub const SKIP_SPINE_BINARY_BONES_SECTION: for<'a> fn(&mut SpineBinarySectionContext<'a>) =
    skip_spine_binary_bones_section;

fn parse_spine_binary_bones(context: &mut SpineBinarySectionContext<'_>, retain: bool) {
    let count = read_spine_binary_varint(&mut context.reader) as usize;
    for index in 0..count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        let name = read_spine_binary_string(&mut context.reader);
        let parent_index = if index == 0 {
            -1
        } else {
            read_spine_binary_varint(&mut context.reader) as i32
        };
        if parent_index >= index as i32 || parent_index < -1 {
            let mut detail = HashMap::new();
            detail.insert(
                "bone".to_string(),
                ImportDiagnosticDetailValue::String(name.unwrap_or_default()),
            );
            detail.insert(
                "declared".to_string(),
                ImportDiagnosticDetailValue::Number(parent_index as f32),
            );
            detail.insert(
                "read".to_string(),
                ImportDiagnosticDetailValue::Number(index as f32),
            );
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "spine.binary-bone-parent-out-of-range",
                "parseSpineBinaryBones",
                Some(detail),
            );
            let overrun = context.reader.view.len().saturating_add(1);
            skip_spine_binary_bytes(&mut context.reader, overrun);
            break;
        }
        let rotation = read_spine_binary_float(&mut context.reader);
        let x = read_spine_binary_float(&mut context.reader);
        let y = read_spine_binary_float(&mut context.reader);
        let scale_x = read_spine_binary_float(&mut context.reader);
        let scale_y = read_spine_binary_float(&mut context.reader);
        let shear_x = read_spine_binary_float(&mut context.reader);
        let shear_y = read_spine_binary_float(&mut context.reader);
        let length = read_spine_binary_float(&mut context.reader);
        let transform_mode = match read_spine_binary_varint(&mut context.reader) {
            1 => TRANSFORM_MODE_2D_ONLY_TRANSLATION,
            2 => TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION,
            3 => TRANSFORM_MODE_2D_NO_SCALE,
            4 => TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION,
            _ => TRANSFORM_MODE_2D_NORMAL,
        };
        read_spine_binary_boolean(&mut context.reader);
        if context.nonessential {
            skip_spine_binary_bytes(&mut context.reader, SPINE_BINARY_COLOR_BYTES);
        }
        if retain {
            context.bones.push(Bone2D {
                length,
                name,
                parent_index,
                rotation,
                scale_x,
                scale_y,
                shear_x,
                shear_y,
                transform_mode,
                x,
                y,
            });
        }
    }
}

pub(crate) fn skip_spine_binary_bones_section(context: &mut SpineBinarySectionContext<'_>) {
    parse_spine_binary_bones(context, false);
}

pub fn spine_binary_bones_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    parse_spine_binary_bones(context, true);
}
