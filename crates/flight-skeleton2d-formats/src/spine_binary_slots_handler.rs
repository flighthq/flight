use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::Slot2D;

use crate::spine_binary_parse_helpers::{
    SPINE_BINARY_NO_DARK_COLOR, read_spine_binary_string_reference,
};
use crate::spine_binary_reader::*;
use crate::types::SpineBinarySectionContext;

pub const SKIP_SPINE_BINARY_SLOTS_SECTION: for<'a> fn(&mut SpineBinarySectionContext<'a>) =
    skip_spine_binary_slots_section;

fn parse_spine_binary_slots(context: &mut SpineBinarySectionContext<'_>, retain: bool) {
    let count = read_spine_binary_varint(&mut context.reader) as usize;
    let mut dark_colors = 0;
    for _ in 0..count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        let name = read_spine_binary_string(&mut context.reader);
        let bone_index = read_spine_binary_varint(&mut context.reader) as i32;
        let color = read_spine_binary_int(&mut context.reader) as u32;
        if read_spine_binary_int(&mut context.reader) != SPINE_BINARY_NO_DARK_COLOR {
            dark_colors += 1;
        }
        let attachment = read_spine_binary_string_reference(&mut context.reader, &context.strings);
        read_spine_binary_varint(&mut context.reader);
        if retain {
            context.attachment_names.push(attachment);
            context.slots.push(Slot2D {
                attachment: None,
                deform: None,
                bone_index,
                color: Some(color),
                name,
            });
        }
    }
    if retain && dark_colors > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "slots".to_string(),
            ImportDiagnosticDetailValue::Number(dark_colors as f32),
        );
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "spine.slot-dark-color-unsupported",
            "parseSpineSkeletonBinary",
            Some(detail),
        );
    }
}

pub(crate) fn skip_spine_binary_slots_section(context: &mut SpineBinarySectionContext<'_>) {
    parse_spine_binary_slots(context, false);
}

pub fn spine_binary_slots_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    parse_spine_binary_slots(context, true);
}
