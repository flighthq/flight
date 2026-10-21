use crate::spine_parse::parse_spine_draw_order_timeline;
use crate::types::{JsonRecord, SpineJsonTimelineContext};

pub fn spine_json_draw_order_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    context.draw_order = parse_spine_draw_order_timeline(
        animation
            .get("drawOrder")
            .or_else(|| animation.get("draworder")),
        &context.section.slots,
        context.section.diagnostics.as_deref_mut(),
    );
}
