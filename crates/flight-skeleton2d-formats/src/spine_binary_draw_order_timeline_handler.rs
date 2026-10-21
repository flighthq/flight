use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::Skeleton2DDrawOrderTimeline;

use crate::spine_binary_parse_helpers::tally;
use crate::spine_binary_reader::*;
use crate::spine_draw_order::{SpineDrawOrderMove, resolve_spine_draw_ordering};
use crate::types::{SPINE_TIMELINE_KIND_DRAW_ORDER, SpineBinaryTimelineContext};

fn consume_draw_order(context: &mut SpineBinaryTimelineContext<'_, '_>, retain: bool) {
    if !retain {
        tally(
            &mut context.unregistered_timeline_counts,
            SPINE_TIMELINE_KIND_DRAW_ORDER,
        );
    }
    let frame_count = read_spine_binary_varint(&mut context.section.reader) as usize;
    let mut times = Vec::new();
    let mut orderings = Vec::new();
    for _ in 0..frame_count {
        if is_spine_binary_reader_overrun(&context.section.reader) {
            break;
        }
        let time = read_spine_binary_float(&mut context.section.reader);
        let move_count = read_spine_binary_varint(&mut context.section.reader) as usize;
        let moves = (0..move_count)
            .map(|_| SpineDrawOrderMove {
                slot_index: read_spine_binary_varint(&mut context.section.reader) as i32,
                offset: read_spine_binary_varint(&mut context.section.reader) as i32,
            })
            .collect::<Vec<_>>();
        if !retain {
            continue;
        }
        if let Some(ordering) =
            resolve_spine_draw_ordering(&moves, context.section.slots.len() as i32)
        {
            times.push(time);
            orderings.extend(ordering);
        } else {
            let mut detail = HashMap::new();
            detail.insert(
                "time".to_string(),
                ImportDiagnosticDetailValue::Number(time),
            );
            report_import_diagnostic(
                context.section.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "spine.draworder-keyframe-unresolved",
                "readSpineBinaryDrawOrderTimeline",
                Some(detail),
            );
        }
    }
    if retain && !times.is_empty() {
        context.draw_order = Some(Skeleton2DDrawOrderTimeline { orderings, times });
    }
}

pub fn skip_spine_binary_draw_order_timeline(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_draw_order(context, false);
}

pub fn spine_binary_draw_order_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_draw_order(context, true);
}
