use crate::spine_parse::parse_spine_draw_order_timeline;
use crate::types::{JsonRecord, SpineJsonTimelineContext};

pub fn spine_json_draw_order_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    context.draw_order = parse_spine_draw_order_timeline(
        anim_entry
            .get("drawOrder")
            .or_else(|| anim_entry.get("draworder")),
        &context.section.slots,
        context.section.diagnostics.as_deref_mut(),
    );
}
