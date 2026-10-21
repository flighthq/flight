use crate::spine_binary_section_handlers::register_spine_binary_section_handlers;
use crate::spine_binary_timeline_handlers::register_spine_binary_timeline_handlers;
use crate::types::SpineBinaryRegistry;

pub fn register_all_spine_binary_handlers(registry: &mut SpineBinaryRegistry) {
    register_spine_binary_section_handlers(registry);
    register_spine_binary_timeline_handlers(registry);
}
