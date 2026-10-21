use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::PathWinding;
use flight_scene2d_formats::contract::*;
use flight_shape::contract::SpreadMethod;
use flight_xml::{XmlElement, parse_xml_document};

mod create_svg_gradient_matrix {
    use super::*;

    #[test]
    fn places_a_gradient_in_both_unit_systems() {
        let path = create_svg_geometry_path(
            &element(r#"<rect width="10" height="20"/>"#),
            PathWinding::NonZero,
        )
        .expect("rectangle path");
        for units in [
            SvgGradientUnits::ObjectBoundingBox,
            SvgGradientUnits::UserSpaceOnUse,
        ] {
            let mut gradient = test_gradient();
            gradient.units = units;
            gradient.x2 = 10.0;
            let matrix = create_svg_gradient_matrix(&gradient, &path);
            assert!(matrix.a.is_finite());
            assert!(matrix.d.is_finite());
            assert!(matrix.a != 0.0);
        }
    }
}

mod has_zero_area_svg_gradient_box {
    use super::*;

    #[test]
    fn drops_the_fill_for_a_shape_with_no_area() {
        let empty = create_svg_geometry_path(
            &element(r#"<rect width="0" height="4"/>"#),
            PathWinding::NonZero,
        )
        .expect("empty rectangle path");
        assert!(has_zero_area_svg_gradient_box(&test_gradient(), &empty));
    }
}

mod parse_svg_gradient {
    use super::*;

    #[test]
    fn reads_the_stop_list_in_offset_order() {
        let root = xml_ref(
            r#"<svg><linearGradient id="g"><stop offset="1" stop-color="blue"/><stop offset="0" stop-color="red"/></linearGradient></svg>"#,
        );
        let gradient_element = find_elements(&root, "linearGradient").remove(0);
        let registry = create_svg_registry();
        let mut context = empty_context(&registry);
        index_document(&mut context, &root, None);
        let gradient = parse_svg_gradient(&gradient_element, &mut context).expect("gradient");
        assert_eq!(
            gradient
                .stops
                .iter()
                .map(|stop| stop.color.rgb)
                .collect::<Vec<_>>(),
            [0xff0000, 0x0000ff]
        );
    }
}

mod resolve_svg_gradient {
    use super::*;

    #[test]
    fn leaves_a_shape_unpainted_when_the_referenced_gradient_does_not_exist() {
        let registry = create_svg_registry();
        let context = empty_context(&registry);
        assert!(resolve_svg_gradient("url(#nope)", &context).is_none());
    }
}

fn element(xml: &str) -> XmlElement {
    return parse_xml_document(xml).expect("valid test XML");
}

fn empty_context(registry: &SvgRegistry) -> SvgImportContext<'_> {
    return SvgImportContext {
        css_rules: Vec::new(),
        diagnostics: None,
        elements_by_id: HashMap::new(),
        gradients_by_id: HashMap::new(),
        object_bounding_boxes: Vec::new(),
        options: None,
        parent_by_element: Vec::new(),
        registry,
        reported_unsupported_elements: Vec::new(),
        resolved_definition_styles: Vec::new(),
        resolving_clip_uses: Vec::new(),
        resolving_clips: Vec::new(),
        resolving_gradients: Vec::new(),
        resolving_uses: Vec::new(),
    };
}

fn find_elements(root: &Ref<XmlElement>, name: &str) -> Vec<Ref<XmlElement>> {
    let mut elements = Vec::new();
    if svg_local_name(&root.read().unwrap().name) == name {
        elements.push(root.clone());
    }
    let children = root.read().unwrap().children.clone();
    for child in children {
        elements.extend(find_elements(&child, name));
    }
    return elements;
}

fn index_document(
    context: &mut SvgImportContext<'_>,
    element: &Ref<XmlElement>,
    parent: Option<Ref<XmlElement>>,
) {
    context
        .parent_by_element
        .push((element.clone(), parent.clone()));
    if let Some(id) = svg_attribute(&element.read().unwrap(), "id") {
        context
            .elements_by_id
            .insert(id.to_string(), element.clone());
    }
    let children = element.read().unwrap().children.clone();
    for child in children {
        index_document(context, &child, Some(element.clone()));
    }
}

fn test_gradient() -> SvgGradient {
    return SvgGradient {
        cx: 0.5,
        cy: 0.5,
        fx: 0.5,
        fy: 0.5,
        kind: SvgGradientKind::Linear,
        radius: 0.5,
        spread_method: SpreadMethod::Pad,
        stops: vec![SvgGradientStop {
            color: SvgColor {
                alpha: 1.0,
                rgb: 0xff0000,
            },
            offset: 0.0,
        }],
        transform: None,
        units: SvgGradientUnits::ObjectBoundingBox,
        x1: 0.0,
        x2: 1.0,
        y1: 0.0,
        y2: 0.0,
    };
}

fn xml_ref(xml: &str) -> Ref<XmlElement> {
    return Arc::new(RwLock::new(element(xml)));
}
