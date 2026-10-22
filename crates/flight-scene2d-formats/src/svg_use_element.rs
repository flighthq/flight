use std::collections::HashMap;

use flight_entity::Ref;
use flight_geometry::create_matrix;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_node::contract::{NodeRef, add_node_child};
use flight_scene2d::contract::{DisplayObject, Node2DRef, create_display_object};
use flight_xml::contract::XmlElement;

use crate::svg_document::{
    append_svg_children, apply_svg_element_appearance, apply_svg_element_clip_family,
    create_svg_element_node, report_remaining_unsupported_svg_elements,
};
use crate::svg_transform::create_svg_viewport_matrix;
use crate::svg_xml::{
    svg_attribute, svg_local_name, svg_number_attribute, svg_optional_number_attribute,
};
use crate::types::*;

fn create_svg_symbol_node(
    element: &Ref<XmlElement>,
    use_element: &Ref<XmlElement>,
    parent_style: &SvgStyle,
    context: &mut SvgImportContext<'_>,
) -> Ref<DisplayObject> {
    let container = create_display_object();
    container.write().unwrap().name =
        svg_attribute(&element.read().unwrap(), "id").map(str::to_string);
    let (width, height) = {
        let use_element = use_element.read().unwrap();
        (
            svg_optional_number_attribute(&use_element, "width"),
            svg_optional_number_attribute(&use_element, "height"),
        )
    };
    let viewport = create_svg_viewport_matrix(
        &element.read().unwrap(),
        Some(&SvgViewportOptions {
            height,
            width,
            x: Some(0.0),
            y: Some(0.0),
        }),
    );
    let node: Node2DRef = container.clone();
    let style = apply_svg_element_appearance(
        &node,
        element,
        parent_style,
        context,
        viewport.as_ref(),
        true,
    );
    append_svg_children(&container, element, &style, context);
    apply_svg_element_clip_family(&node, element, context);
    return container;
}

fn create_svg_use_node(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    let href = svg_attribute(&context.element.read().unwrap(), "href").map(str::to_string);
    let id = href.as_deref().and_then(|href| href.strip_prefix('#'));
    let recursive = id.is_some_and(|id| {
        context
            .import
            .resolving_uses
            .iter()
            .any(|candidate| candidate == id)
    });
    let Some(id) = id.filter(|_| !recursive) else {
        let detail = id.map(|id| {
            HashMap::from([(
                "id".to_string(),
                ImportDiagnosticDetailValue::String(id.to_string()),
            )])
        });
        report_import_diagnostic(
            context.import.diagnostics.as_deref_mut(),
            if recursive {
                ImportDiagnosticSeverity::Reject
            } else {
                ImportDiagnosticSeverity::Drop
            },
            if recursive {
                "svg.recursive-use"
            } else {
                "svg.unresolved-use"
            },
            "createSvgUseNode",
            detail,
        );
        return None;
    };
    let Some(referenced) = context.import.elements_by_id.get(id).cloned() else {
        report_import_diagnostic(
            context.import.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "svg.unresolved-use",
            "createSvgUseNode",
            Some(HashMap::from([(
                "id".to_string(),
                ImportDiagnosticDetailValue::String(id.to_string()),
            )])),
        );
        return None;
    };

    context.import.resolving_uses.push(id.to_string());
    report_remaining_unsupported_svg_elements(&referenced, context.import, false);
    let container = create_display_object();
    let placement = {
        let element = context.element.read().unwrap();
        create_matrix(
            1.0,
            0.0,
            0.0,
            1.0,
            svg_number_attribute(&element, "x", 0.0),
            svg_number_attribute(&element, "y", 0.0),
        )
    };
    let node: Node2DRef = container.clone();
    let style = apply_svg_element_appearance(
        &node,
        &context.element,
        context.parent_style,
        context.import,
        Some(&placement),
        true,
    );
    let referenced_node = if svg_local_name(&referenced.read().unwrap().name) == "symbol" {
        let symbol = create_svg_symbol_node(&referenced, &context.element, &style, context.import);
        let node: Node2DRef = symbol;
        Some(node)
    } else {
        create_svg_element_node(&referenced, &style, context.import)
    };
    if let Some(referenced_node) = referenced_node {
        let parent: NodeRef = container;
        let child: NodeRef = referenced_node;
        add_node_child(&parent, &child);
    }
    apply_svg_element_clip_family(&node, &context.element, context.import);
    context
        .import
        .resolving_uses
        .retain(|candidate| candidate != id);
    return Some(node);
}

pub fn svg_use_element_handler(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    return create_svg_use_node(context);
}
