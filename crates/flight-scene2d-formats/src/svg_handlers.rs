use crate::svg_clip_handlers::register_svg_clip_handlers;
use crate::svg_element_handlers::register_svg_element_handlers;
use crate::types::SvgRegistry;

pub fn register_all_svg_handlers(registry: &mut SvgRegistry) {
    register_svg_clip_handlers(registry);
    register_svg_element_handlers(registry);
}
