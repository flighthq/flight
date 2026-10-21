use crate::dragon_bones_section_handlers::register_dragon_bones_section_handlers;
use crate::dragon_bones_timeline_handlers::register_dragon_bones_timeline_handlers;
use crate::types::DragonBonesRegistry;

pub fn register_all_dragon_bones_handlers(registry: &mut DragonBonesRegistry) {
    register_dragon_bones_section_handlers(registry);
    register_dragon_bones_timeline_handlers(registry);
}
