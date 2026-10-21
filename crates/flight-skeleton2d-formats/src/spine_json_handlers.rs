use crate::spine_json_section_handlers::register_spine_json_section_handlers;
use crate::spine_json_timeline_handlers::register_spine_json_timeline_handlers;
use crate::types::SpineJsonRegistry;

pub fn register_all_spine_json_handlers(registry: &mut SpineJsonRegistry) {
    register_spine_json_section_handlers(registry);
    register_spine_json_timeline_handlers(registry);
}
