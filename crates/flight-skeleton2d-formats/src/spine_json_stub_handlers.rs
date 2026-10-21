use crate::spine_parse_helpers::skip_crumb_spine_timeline_group;
use crate::types::{JsonRecord, SpineJsonSectionContext, SpineJsonTimelineContext};

pub fn spine_json_deform_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    skip_crumb_spine_timeline_group(
        context.section.diagnostics.as_deref_mut(),
        animation.get("deform"),
        "spine.deform-timeline-unsupported",
    );
}

pub fn spine_json_event_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    skip_crumb_spine_timeline_group(
        context.section.diagnostics.as_deref_mut(),
        animation.get("events"),
        "spine.event-timeline-unsupported",
    );
}

pub fn spine_json_events_section_handler(_context: &mut SpineJsonSectionContext<'_>) {}

pub fn spine_json_ik_constraints_section_handler(_context: &mut SpineJsonSectionContext<'_>) {}

pub fn spine_json_ik_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    skip_crumb_spine_timeline_group(
        context.section.diagnostics.as_deref_mut(),
        animation.get("ik"),
        "spine.ik-timeline-unsupported",
    );
}

pub fn spine_json_path_constraints_section_handler(_context: &mut SpineJsonSectionContext<'_>) {}

pub fn spine_json_path_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    skip_crumb_spine_timeline_group(
        context.section.diagnostics.as_deref_mut(),
        animation.get("path"),
        "spine.path-timeline-unsupported",
    );
}

pub fn spine_json_transform_constraints_section_handler(
    _context: &mut SpineJsonSectionContext<'_>,
) {
}

pub fn spine_json_transform_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    skip_crumb_spine_timeline_group(
        context.section.diagnostics.as_deref_mut(),
        animation.get("transform"),
        "spine.transform-timeline-unsupported",
    );
}
