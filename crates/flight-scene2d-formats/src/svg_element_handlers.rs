use std::sync::{Arc, LazyLock};

use crate::svg_container_element::svg_container_element_handler;
use crate::svg_geometry_element::svg_geometry_element_handler;
use crate::svg_image_element::svg_image_element_handler;
use crate::svg_registry::register_svg_element_handler;
use crate::svg_text_element::svg_text_element_handler;
use crate::svg_use_element::svg_use_element_handler;
use crate::types::*;

pub static SVG_ALL_ELEMENT_HANDLERS: LazyLock<Vec<SvgElementHandler>> = LazyLock::new(|| {
    return vec![
        Arc::new(svg_container_element_handler),
        Arc::new(svg_geometry_element_handler),
        Arc::new(svg_image_element_handler),
        Arc::new(svg_text_element_handler),
        Arc::new(svg_use_element_handler),
    ];
});

pub fn register_svg_element_handlers(registry: &mut SvgRegistry) {
    for (kind, index) in [
        (SVG_ELEMENT_KIND_CONTAINER, 0),
        (SVG_ELEMENT_KIND_GEOMETRY, 1),
        (SVG_ELEMENT_KIND_IMAGE, 2),
        (SVG_ELEMENT_KIND_TEXT, 3),
        (SVG_ELEMENT_KIND_USE, 4),
    ] {
        register_svg_element_handler(registry, kind, SVG_ALL_ELEMENT_HANDLERS[index].clone());
    }
}
