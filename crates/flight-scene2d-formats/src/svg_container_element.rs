use flight_scene2d::contract::{create_display_object, Node2DRef};

use crate::svg_document::{
    append_svg_children, apply_svg_element_appearance, apply_svg_element_clip_family,
};
use crate::svg_transform::create_svg_viewport_matrix;
use crate::svg_xml::svg_local_name;
use crate::types::SvgElementContext;

pub fn svg_container_element_handler(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    let container = create_display_object(None);
    let name = svg_local_name(&context.element.read().unwrap().name).to_string();
    let viewport = if name == "svg" {
        create_svg_viewport_matrix(&context.element.read().unwrap(), None)
    } else {
        None
    };
    let node: Node2DRef = container.clone();
    let style = apply_svg_element_appearance(
        &node,
        &context.element,
        context.parent_style,
        context.import,
        viewport.as_ref(),
        true,
    );
    append_svg_children(&container, &context.element, &style, context.import);
    apply_svg_element_clip_family(&node, &context.element, context.import);
    return Some(node);
}
