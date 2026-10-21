use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{clone_matrix, create_matrix, Matrix};
use flight_importdiagnostics::{
    report_import_diagnostic, ImportDiagnostic, ImportDiagnosticDetailValue,
    ImportDiagnosticSeverity,
};
use flight_node::contract::{add_node_child, NodeRef};
use flight_scene2d::contract::{create_display_object, DisplayObject, Node2DRef};
use flight_xml::contract::{parse_xml_document, XmlElement};

use crate::svg_gradient::parse_svg_gradient;
use crate::svg_registry::{get_svg_clip_handler, get_svg_element_handler};
use crate::svg_style::{collect_css_rules, resolve_svg_style, DEFAULT_SVG_STYLE};
use crate::svg_transform::{
    apply_svg_transform, create_svg_viewport_matrix, multiply_svg_matrices, parse_svg_transform,
};
use crate::svg_xml::{svg_attribute, svg_local_name};
use crate::types::*;

pub fn create_scene2d_from_svg_document_with_registry(
    source: &str,
    registry: &SvgRegistry,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&SvgDocumentImportOptions>,
) -> Ref<DisplayObject> {
    return import_svg_document_with_registry(source, registry, diagnostics, options);
}

pub fn create_svg_element_node(
    element: &Ref<XmlElement>,
    parent_style: &SvgStyle,
    context: &mut SvgImportContext<'_>,
) -> Option<Node2DRef> {
    return import_svg_element_node(element, parent_style, context);
}

pub fn append_svg_children(
    parent: &Ref<DisplayObject>,
    element: &Ref<XmlElement>,
    parent_style: &SvgStyle,
    context: &mut SvgImportContext<'_>,
) {
    let children = element.read().unwrap().children.clone();
    for child in children {
        let Some(node) = create_svg_element_node(&child, parent_style, context) else {
            continue;
        };
        let parent: NodeRef = parent.clone();
        let child: NodeRef = node;
        add_node_child(&parent, &child);
    }
}

pub fn apply_svg_element_appearance(
    target: &Node2DRef,
    element: &Ref<XmlElement>,
    parent_style: &SvgStyle,
    context: &mut SvgImportContext<'_>,
    geometry_transform: Option<&Matrix>,
    has_visual_descendants: bool,
) -> SvgStyle {
    let (style, name, filter, author_transform) = {
        let element = element.read().unwrap();
        let style = resolve_svg_style(&element, parent_style, context);
        let name = svg_attribute(&element, "id").map(str::to_string);
        let filter = style.filter.clone();
        let author_transform = parse_svg_transform(svg_attribute(&element, "transform"));
        (style, name, filter, author_transform)
    };
    {
        let mut target = target.write().unwrap();
        let fields = target.node2d_fields_mut();
        fields.alpha = style.opacity;
        fields.visible = style.display != "none"
            && (has_visual_descendants
                || (style.visibility != "hidden" && style.visibility != "collapse"));
        fields.name = name;
    }
    if filter != "none" {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "svg.unsupported-filter",
            "applySvgElementAppearance",
            Some(HashMap::from([(
                "filter".to_string(),
                ImportDiagnosticDetailValue::String(filter),
            )])),
        );
    }
    let transform = match (author_transform.as_ref(), geometry_transform) {
        (None, None) => None,
        (Some(author), None) => Some(clone_matrix(author)),
        (None, Some(geometry)) => Some(clone_matrix(geometry)),
        (Some(author), Some(geometry)) => {
            let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
            multiply_svg_matrices(&mut out, author, geometry);
            Some(out)
        }
    };
    apply_svg_transform(&mut *target.write().unwrap(), transform.as_ref());
    return style;
}

pub fn apply_svg_element_clip_family(
    target: &Node2DRef,
    element: &Ref<XmlElement>,
    context: &mut SvgImportContext<'_>,
) {
    let handler = get_svg_clip_handler(context.registry, SVG_CLIP_KIND_PATH);
    if let Some(handler) = handler {
        handler(&mut SvgClipContext {
            element: element.clone(),
            import: context,
            target: target.clone(),
        });
    }
}

fn import_svg_document_with_registry(
    source: &str,
    registry: &SvgRegistry,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&SvgDocumentImportOptions>,
) -> Ref<DisplayObject> {
    let out = create_display_object(None);
    let Some(document) = parse_xml_document(source) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "svg.invalid-document",
            "createScene2DFromSvgDocument",
            None,
        );
        return out;
    };
    if svg_local_name(&document.name) != "svg" {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "svg.invalid-document",
            "createScene2DFromSvgDocument",
            None,
        );
        return out;
    }

    let mut css_rules = Vec::new();
    collect_css_rules(&mut css_rules, &document);
    let document = Arc::new(RwLock::new(document));
    let mut context = SvgImportContext {
        css_rules,
        diagnostics,
        elements_by_id: HashMap::new(),
        gradients_by_id: HashMap::new(),
        object_bounding_boxes: Vec::new(),
        options,
        parent_by_element: Vec::new(),
        registry,
        reported_unsupported_elements: Vec::new(),
        resolved_definition_styles: Vec::new(),
        resolving_clip_uses: Vec::new(),
        resolving_clips: Vec::new(),
        resolving_gradients: Vec::new(),
        resolving_uses: Vec::new(),
    };
    index_svg_definitions(&document, &mut context);

    let viewport = create_svg_viewport_matrix(&document.read().unwrap(), None);
    let root: Node2DRef = out.clone();
    let root_style = apply_svg_element_appearance(
        &root,
        &document,
        &DEFAULT_SVG_STYLE,
        &mut context,
        viewport.as_ref(),
        true,
    );
    append_svg_children(&out, &document, &root_style, &mut context);
    apply_svg_element_clip_family(&root, &document, &mut context);
    report_remaining_unsupported_svg_elements(&document, &mut context, false);
    return out;
}

fn import_svg_element_node(
    element: &Ref<XmlElement>,
    parent_style: &SvgStyle,
    context: &mut SvgImportContext<'_>,
) -> Option<Node2DRef> {
    let name = svg_local_name(&element.read().unwrap().name).to_string();
    if matches!(
        name.as_str(),
        "defs" | "style" | "title" | "desc" | "metadata"
    ) {
        return None;
    }
    if matches!(
        name.as_str(),
        "linearGradient" | "radialGradient" | "clipPath" | "mask" | "symbol"
    ) {
        return None;
    }

    let kind = svg_element_kind_for_name(&name);
    if let Some(kind) = kind {
        if let Some(handler) = get_svg_element_handler(context.registry, kind) {
            return handler(&mut SvgElementContext {
                element: element.clone(),
                import: context,
                parent_style,
            });
        }
    }

    if is_unsupported_svg_element_name(&name) {
        report_unsupported_svg_element(element, context, "createSvgElementNode");
    } else {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "svg.unknown-element",
            "createSvgElementNode",
            Some(HashMap::from([(
                "element".to_string(),
                ImportDiagnosticDetailValue::String(name),
            )])),
        );
    }
    return None;
}

fn index_svg_definitions(root: &Ref<XmlElement>, context: &mut SvgImportContext<'_>) {
    fn index(
        element: &Ref<XmlElement>,
        parent: Option<Ref<XmlElement>>,
        context: &mut SvgImportContext<'_>,
    ) {
        context.parent_by_element.push((element.clone(), parent));
        let (id, children) = {
            let element = element.read().unwrap();
            (
                svg_attribute(&element, "id").map(str::to_string),
                element.children.clone(),
            )
        };
        if let Some(id) = id {
            context.elements_by_id.insert(id, element.clone());
        }
        for child in children {
            index(&child, Some(element.clone()), context);
        }
    }
    index(root, None, context);

    fn gradients(element: &Ref<XmlElement>, context: &mut SvgImportContext<'_>) {
        let (name, id, children) = {
            let element = element.read().unwrap();
            (
                svg_local_name(&element.name).to_string(),
                svg_attribute(&element, "id").map(str::to_string),
                element.children.clone(),
            )
        };
        if let Some(id) =
            id.filter(|_| matches!(name.as_str(), "linearGradient" | "radialGradient"))
        {
            if let Some(gradient) = parse_svg_gradient(element, context) {
                context.gradients_by_id.insert(id, gradient);
            }
        }
        for child in children {
            gradients(&child, context);
        }
    }
    gradients(root, context);
}

fn is_unsupported_svg_element_name(name: &str) -> bool {
    return matches!(
        name,
        "animate"
            | "animateMotion"
            | "animateTransform"
            | "filter"
            | "foreignObject"
            | "pattern"
            | "script"
            | "set"
    );
}

pub fn report_remaining_unsupported_svg_elements(
    element: &Ref<XmlElement>,
    context: &mut SvgImportContext<'_>,
    inside_definitions: bool,
) {
    let (name, children) = {
        let element = element.read().unwrap();
        (
            svg_local_name(&element.name).to_string(),
            element.children.clone(),
        )
    };
    let definitions = inside_definitions || name == "defs";
    if !definitions && is_unsupported_svg_element_name(&name) {
        report_unsupported_svg_element(element, context, "reportRemainingUnsupportedSvgElements");
    }
    for child in children {
        report_remaining_unsupported_svg_elements(&child, context, definitions);
    }
}

fn report_unsupported_svg_element(
    element: &Ref<XmlElement>,
    context: &mut SvgImportContext<'_>,
    origin: &str,
) {
    if context
        .reported_unsupported_elements
        .iter()
        .any(|candidate| Arc::ptr_eq(candidate, element))
    {
        return;
    }
    context.reported_unsupported_elements.push(element.clone());
    let name = svg_local_name(&element.read().unwrap().name).to_string();
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Skip,
        &format!("svg.unsupported-{name}"),
        origin,
        Some(HashMap::from([(
            "element".to_string(),
            ImportDiagnosticDetailValue::String(name),
        )])),
    );
}

fn svg_element_kind_for_name(name: &str) -> Option<&'static str> {
    return match name {
        "a" | "g" | "svg" | "switch" => Some(SVG_ELEMENT_KIND_CONTAINER),
        "circle" | "ellipse" | "line" | "path" | "polygon" | "polyline" | "rect" => {
            Some(SVG_ELEMENT_KIND_GEOMETRY)
        }
        "image" => Some(SVG_ELEMENT_KIND_IMAGE),
        "text" => Some(SVG_ELEMENT_KIND_TEXT),
        "use" => Some(SVG_ELEMENT_KIND_USE),
        _ => None,
    };
}
